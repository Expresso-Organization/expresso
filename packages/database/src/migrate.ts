import postgres from "postgres";

import { loadMigrations } from "./migrations.js";

const migrationLockId = 7_819_357_735;

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

export async function migrate(options: MigrateOptions): Promise<MigrateResult> {
  const client = postgres(options.databaseUrl, { max: 1 });
  const result: MigrateResult = { applied: [], existing: [] };

  try {
    await client`select pg_advisory_lock(${migrationLockId})`;
    await client.unsafe(`
      create table if not exists schema_migration (
        version text primary key,
        name text not null,
        checksum text not null,
        applied_at timestamptz not null default now()
      )
    `);

    const migrations = await loadMigrations(options.migrationsDirectory);

    for (const migration of migrations) {
      await client.begin(async (transaction) => {
        const rows = await transaction<AppliedMigration[]>`
          select version, checksum
          from schema_migration
          where version = ${migration.version}
        `;
        const applied = rows[0];

        if (applied) {
          if (applied.checksum !== migration.checksum) {
            throw new Error(
              `Migration ${migration.filename} was modified after it was applied`,
            );
          }
          result.existing.push(migration.filename);
          return;
        }

        await transaction.unsafe(migration.sql);
        await transaction`
          insert into schema_migration (version, name, checksum)
          values (${migration.version}, ${migration.name}, ${migration.checksum})
        `;
        result.applied.push(migration.filename);
      });
    }

    return result;
  } finally {
    try {
      await client`select pg_advisory_unlock(${migrationLockId})`;
    } finally {
      await client.end({ timeout: 5 });
    }
  }
}

