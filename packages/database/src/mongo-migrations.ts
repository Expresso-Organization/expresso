import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Db } from "mongodb";
import { initialMigrationSteps } from "./mongodb-migrations/0001/migration.js";
import { generationLedgerConstraintSteps } from "./mongodb-migrations/0002/migration.js";
import { analyticsAndPreferenceSteps } from "./mongodb-migrations/0003/migration.js";
import { jobImportMetadataSteps } from "./mongodb-migrations/0004/migration.js";

export interface MongoMigrationStep {
  id: string;
  run(db: Db): Promise<void>;
}

export interface MongoMigration {
  version: string;
  name: string;
  checksum: string;
  steps: readonly MongoMigrationStep[];
}

/** 원본 TS와 모든 실행 입력의 바이트를 함께 고정합니다. 빌드 산출물은 해시 대상이 아닙니다. */
export async function loadMongoMigrations(): Promise<MongoMigration[]> {
  const directory = new URL("./mongodb-migrations/0001/", import.meta.url);
  const hash = createHash("sha256");
  for (const name of ["migration.ts", "schema.json", "seeds.json"]) {
    const source = await readFile(new URL(name, directory));
    hash.update(`${name}\0${source.byteLength}\0`).update(source);
  }
  const secondSource = await readFile(new URL("./mongodb-migrations/0002/migration.ts", import.meta.url));
  const secondHash = createHash("sha256").update(`migration.ts\0${secondSource.byteLength}\0`).update(secondSource).digest("hex");
  const thirdSource = await readFile(new URL("./mongodb-migrations/0003/migration.ts", import.meta.url));
  const thirdHash = createHash("sha256").update(`migration.ts\0${thirdSource.byteLength}\0`).update(thirdSource).digest("hex");
  const fourthSource = await readFile(new URL("./mongodb-migrations/0004/migration.ts", import.meta.url));
  const fourthHash = createHash("sha256").update(`migration.ts\0${fourthSource.byteLength}\0`).update(fourthSource).digest("hex");
  return [
    { version: "0001", name: "initial_collections", checksum: hash.digest("hex"), steps: await initialMigrationSteps() },
    { version: "0002", name: "generation_ledger_amount_constraint", checksum: secondHash, steps: await generationLedgerConstraintSteps() },
    { version: "0003", name: "analytics_rate_and_notification_preferences", checksum: thirdHash, steps: await analyticsAndPreferenceSteps() },
    { version: "0004", name: "job_import_metadata", checksum: fourthHash, steps: await jobImportMetadataSteps() },
  ];
}
