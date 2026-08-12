import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const migrationFilePattern = /^(?<version>\d{4})_(?<name>[a-z0-9_]+)\.sql$/;

export interface Migration {
  version: string;
  name: string;
  filename: string;
  checksum: string;
  sql: string;
}

export function defaultMigrationsDirectory(): string {
  return fileURLToPath(new URL("../migrations/", import.meta.url));
}

export async function loadMigrations(
  directory = defaultMigrationsDirectory(),
): Promise<Migration[]> {
  const filenames = (await readdir(directory))
    .filter((filename) => migrationFilePattern.test(filename))
    .sort((left, right) => left.localeCompare(right));

  const migrations = await Promise.all(
    filenames.map(async (filename) => {
      const match = migrationFilePattern.exec(filename);
      const version = match?.groups?.version;
      const name = match?.groups?.name;
      if (!version || !name) {
        throw new Error(`Invalid migration filename: ${filename}`);
      }

      const sql = await readFile(join(directory, filename), "utf8");

      return {
        version,
        name,
        filename,
        checksum: createHash("sha256").update(sql).digest("hex"),
        sql,
      };
    }),
  );

  const versions = new Set<string>();
  for (const migration of migrations) {
    if (versions.has(migration.version)) {
      throw new Error(`Duplicate migration version: ${migration.version}`);
    }
    versions.add(migration.version);
  }

  return migrations;
}
