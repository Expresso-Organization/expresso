import { createConnection, type Connection } from "mysql2/promise";

import { loadMigrations } from "./migrations.js";

// 한 번에 한 프로세스만 마이그레이션하도록 이름 있는 잠금을 씁니다.
// PostgreSQL 의 pg_advisory_lock 자리입니다.
//
// 이름에 데이터베이스를 넣습니다 — MySQL 의 이름 있는 잠금은 서버 하나에 하나라,
// 이름이 같으면 서로 다른 데이터베이스의 마이그레이션까지 줄을 섭니다. 테스트는
// 격리 데이터베이스를 여럿 만들어 동시에 옮기므로 그 줄이 그대로 대기 시간이
// 됩니다. 이름은 64자를 넘지 못합니다.
const migrationLockExpression =
  "left(concat('expresso:migration:', database()), 64)";
const migrationLockTimeoutSeconds = 30;

export interface MigrateOptions {
  databaseUrl: string;
  migrationsDirectory?: string;
}

export interface MigrateResult {
  applied: string[];
  existing: string[];
}

interface AppliedMigration {
  version: string;
  checksum: string;
}

async function acquireLock(connection: Connection): Promise<void> {
  const [rows] = await connection.query<any[]>(
    `select get_lock(${migrationLockExpression}, ?) as locked`,
    [migrationLockTimeoutSeconds],
  );
  if (rows[0]?.locked !== 1) {
    throw new Error("Could not acquire the migration lock");
  }
}

export async function migrate(options: MigrateOptions): Promise<MigrateResult> {
  const connection = await createConnection({
    uri: options.databaseUrl,
    multipleStatements: true,
    timezone: "Z",
    dateStrings: false,
  });
  const result: MigrateResult = { applied: [], existing: [] };

  try {
    await acquireLock(connection);
    await connection.query(`
      create table if not exists schema_migration (
        version varchar(16) primary key,
        name varchar(255) not null,
        checksum char(64) not null,
        applied_at datetime(6) not null default current_timestamp(6)
      ) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin
    `);

    const migrations = await loadMigrations(options.migrationsDirectory);

    for (const migration of migrations) {
      const [rows] = await connection.query<any[]>(
        "select version, checksum from schema_migration where version = ?",
        [migration.version],
      );
      const applied = rows[0] as AppliedMigration | undefined;

      if (applied) {
        if (applied.checksum !== migration.checksum) {
          throw new Error(
            `Migration ${migration.filename} was modified after it was applied`,
          );
        }
        result.existing.push(migration.filename);
        continue;
      }

      // MySQL 은 DDL 에서 트랜잭션이 암묵적으로 커밋됩니다 — 한 파일이 중간에 실패하면
      // 그때까지의 문장은 남습니다. 마이그레이션 하나를 되돌릴 수 있는 단위로 씁니다.
      await connection.query(migration.sql);
      await connection.query(
        "insert into schema_migration (version, name, checksum) values (?, ?, ?)",
        [migration.version, migration.name, migration.checksum],
      );
      result.applied.push(migration.filename);
    }

    return result;
  } finally {
    try {
      await connection.query(`select release_lock(${migrationLockExpression})`);
    } finally {
      await connection.end();
    }
  }
}
