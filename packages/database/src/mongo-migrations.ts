import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Db } from "mongodb";
import { initialMigrationSteps } from "./mongodb-migrations/0001/migration.js";
import { generationLedgerConstraintSteps } from "./mongodb-migrations/0002/migration.js";
import { analyticsAndPreferenceSteps } from "./mongodb-migrations/0003/migration.js";
import { jobImportMetadataSteps } from "./mongodb-migrations/0004/migration.js";
import { jobSourceProviderSteps } from "./mongodb-migrations/0005/migration.js";
import { careerEditorLedgerSteps } from "./mongodb-migrations/0006/migration.js";
import { jobSourceSeedSteps } from "./mongodb-migrations/0007/migration.js";
import { careerViewConfigurationSteps } from "./mongodb-migrations/0008/migration.js";
import { careerBusinessWriterPreparationSteps } from "./mongodb-migrations/0014/migration.js";
import { careerPropertyMutationPreparationSteps } from "./mongodb-migrations/0015/migration.js";

import { agentCredentialSteps } from "./mongodb-migrations/0010/migration.js";
import { agentConversationSteps } from "./mongodb-migrations/0009/migration.js";


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
  const fifthSource = await readFile(new URL("./mongodb-migrations/0005/migration.ts", import.meta.url));
  const fifthHash = createHash("sha256").update(`migration.ts\0${fifthSource.byteLength}\0`).update(fifthSource).digest("hex");
  const sixthSource = await readFile(new URL("./mongodb-migrations/0006/migration.ts", import.meta.url));
  const sixthHash = createHash("sha256").update(`migration.ts\0${sixthSource.byteLength}\0`).update(sixthSource).digest("hex");
  const seventhSource = await readFile(new URL("./mongodb-migrations/0007/migration.ts", import.meta.url));
  const seventhHash = createHash("sha256").update(`migration.ts\0${seventhSource.byteLength}\0`).update(seventhSource).digest("hex");
  const eighthSource = await readFile(new URL("./mongodb-migrations/0008/migration.ts", import.meta.url));
  const eighthHash = createHash("sha256").update(`migration.ts\0${eighthSource.byteLength}\0`).update(eighthSource).digest("hex");
  const ninthSource = await readFile(new URL("./mongodb-migrations/0009/migration.ts", import.meta.url));
  const ninthHash = createHash("sha256").update(ninthSource).digest("hex");
  const tenthHash = createHash("sha256").update(await readFile(new URL("./mongodb-migrations/0010/migration.ts", import.meta.url))).digest("hex");
  const businessDirectory = new URL("./mongodb-migrations/0014/", import.meta.url);
  const manifest = await readFile(new URL("checksum-manifest.json", businessDirectory));
  const businessHash = createHash("sha256").update(`checksum-manifest.json\0${manifest.byteLength}\0`).update(manifest);
  const { files } = JSON.parse(manifest.toString("utf8")) as { files: string[] };
  if (files.length !== new Set(files).size || files.some((file) => !/^[a-z-]+\.(ts|json)$/.test(file))) throw new Error("invalid 0014 checksum manifest");
  for (const file of files) {
    const source = await readFile(new URL(file, businessDirectory));
    businessHash.update(`${file}\0${source.byteLength}\0`).update(source);
  }
  const mutationDirectory = new URL("./mongodb-migrations/0015/", import.meta.url);
  const mutationManifest = await readFile(new URL("checksum-manifest.json", mutationDirectory));
  const mutationHash = createHash("sha256").update(`checksum-manifest.json\0${mutationManifest.byteLength}\0`).update(mutationManifest);
  const mutationFiles = (JSON.parse(mutationManifest.toString("utf8")) as { files: string[] }).files;
  if (mutationFiles.length !== new Set(mutationFiles).size || mutationFiles.some(file => !/^[a-z-]+\.(ts|json)$/.test(file))) throw new Error("invalid 0015 checksum manifest");
  for (const file of mutationFiles) {
    const source = await readFile(new URL(file, mutationDirectory));
    mutationHash.update(`${file}\0${source.byteLength}\0`).update(source);
  }
  return [
    { version: "0001", name: "initial_collections", checksum: hash.digest("hex"), steps: await initialMigrationSteps() },
    { version: "0002", name: "generation_ledger_amount_constraint", checksum: secondHash, steps: await generationLedgerConstraintSteps() },
    { version: "0003", name: "analytics_rate_and_notification_preferences", checksum: thirdHash, steps: await analyticsAndPreferenceSteps() },
    { version: "0004", name: "job_import_metadata", checksum: fourthHash, steps: await jobImportMetadataSteps() },
    { version: "0005", name: "job_source_ats_providers", checksum: fifthHash, steps: await jobSourceProviderSteps() },
    { version: "0006", name: "career_record_editor", checksum: sixthHash, steps: await careerEditorLedgerSteps() },
    { version: "0007", name: "job_source_boards", checksum: seventhHash, steps: await jobSourceSeedSteps() },
    { version: "0008", name: "career_view_configurations", checksum: eighthHash, steps: await careerViewConfigurationSteps() },
    { version: "0009", name: "agent_conversations", checksum: ninthHash, steps: await agentConversationSteps() },
    { version: "0010", name: "agent_credentials", checksum: tenthHash, steps: await agentCredentialSteps() },
    { version: "0014", name: "career_business_writer_preparation", checksum: businessHash.digest("hex"), steps: await careerBusinessWriterPreparationSteps() },
    { version: "0015", name: "career_property_mutation_preparation", checksum: mutationHash.digest("hex"), steps: await careerPropertyMutationPreparationSteps() },
  ];
}
