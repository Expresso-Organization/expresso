import { MongoClient } from "mongodb";
import type { SchemaMigrationDoc } from "./documents/operations.js";
import { acquireMigrationLease, releaseMigrationLease, renewMigrationLease } from "./migration-lease.js";
import { loadMongoMigrations, type MongoMigration } from "./mongo-migrations.js";

export interface MongoMigrateOptions {
  databaseUrl: string;
  databaseName?: string;
  /** 동일 실행기의 실패·복구 검증과 명시적인 마이그레이션 등록에 사용합니다. */
  migrations?: readonly MongoMigration[];
}

export interface MigrateResult {
  applied: string[];
  existing: string[];
}

export async function migrateMongo(options: MongoMigrateOptions): Promise<MigrateResult> {
  const client = new MongoClient(options.databaseUrl, { serverSelectionTimeoutMS: 3_000 });
  const db = client.db(options.databaseName);
  const result: MigrateResult = { applied: [], existing: [] };
  try {
    const migrations = options.migrations ?? await loadMongoMigrations();
    const versions = new Set<string>();
    let lastVersion = "";
    for (const migration of migrations) {
      if (!/^\d{4}$/.test(migration.version) || versions.has(migration.version) || migration.version <= lastVersion ||
        !/^[a-f0-9]{64}$/.test(migration.checksum) || new Set(migration.steps.map(({ id }) => id)).size !== migration.steps.length) {
        throw new Error("Invalid migration versions, checksum or step identifiers");
      }
      versions.add(migration.version); lastVersion = migration.version;
    }
    // 이 후보는 main 이력에서만 자동 전진한다. 열린 PR의 다른 번호 체계는 수동 대조가 필요하다.
    const recorded = await db.collection<SchemaMigrationDoc>("schema_migrations").find({}).toArray();
    for (const previous of recorded) {
      const migration = migrations.find(item => item.version === previous._id);
      if (!migration || previous.name !== migration.name || previous.checksum !== migration.checksum) {
        throw new Error(`MIGRATION_HISTORY_CONFLICT: ${previous._id}_${previous.name} is unknown or modified; reconcile the ledger before migration`);
      }
    }
    const lease = await acquireMigrationLease(db);
    const history = db.collection<SchemaMigrationDoc>("schema_migrations");
    for (const migration of migrations) {
      await renewMigrationLease(db, lease.token);
      const previous = await history.findOne({ _id: migration.version });
      const label = `${migration.version}_${migration.name}`;
      if (previous && (previous.checksum !== migration.checksum || previous.name !== migration.name)) {
        throw new Error(`Migration ${label} was modified after execution began`);
      }
      if (previous?.state === "applied") { result.existing.push(label); continue; }
      if (!previous) await history.insertOne({ _id: migration.version, name: migration.name, checksum: migration.checksum, state: "applying", completedSteps: [] });
      for (const step of migration.steps) {
        if (previous?.completedSteps.includes(step.id)) continue;
        await renewMigrationLease(db, lease.token);
        await step.run(db);
        // 성공 응답을 받은 단계만 완료로 기록합니다.
        await history.updateOne({ _id: migration.version, checksum: migration.checksum }, { $addToSet: { completedSteps: step.id } });
      }
      await history.updateOne({ _id: migration.version }, { $set: { state: "applied", appliedAt: new Date() } });
      result.applied.push(label);
    }
    await releaseMigrationLease(db, lease.token);
    return result;
  } finally {
    // 실패 시 lease를 남깁니다. 네트워크 오류 뒤 서버 DDL이 계속 실행 중일 수 있습니다.
    await client.close();
  }
}
