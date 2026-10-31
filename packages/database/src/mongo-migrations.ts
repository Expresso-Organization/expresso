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
import { careerBusinessWriterPreparationSteps } from "./mongodb-migrations/0025/migration.js";
import { careerProducerPreparationSteps } from "./mongodb-migrations/0027/migration.js";
import { careerPropertyMutationPreparationSteps } from "./mongodb-migrations/0026/migration.js";

import { agentCredentialSteps } from "./mongodb-migrations/0010/migration.js";
import { preparationPlanSteps } from "./mongodb-migrations/0011/migration.js";
import { agentConversationSteps } from "./mongodb-migrations/0009/migration.js";
import { identitySessionSlidingExpirySteps } from "./mongodb-migrations/0012/migration.js";
import { identityEmailAndTermsSteps } from "./mongodb-migrations/0013/migration.js";
import { careerCategoryOwnershipSteps } from "./mongodb-migrations/0017/migration.js";
import { notificationProducerSteps } from "./mongodb-migrations/0020/migration.js";
import { generationWaitingRecipeSteps } from "./mongodb-migrations/0021/migration.js";
import { aiUsageAndPlanCreditSteps } from "./mongodb-migrations/0022/migration.js";
import { portfolioPublicSlugSteps } from "./mongodb-migrations/0023/migration.js";
import { adminDummyAccountSteps } from "./mongodb-migrations/0024/migration.js";

import { careerCanonicalPreparationSteps } from "./mongodb-migrations/0028/migration.js";
import { careerRelationPropertyMutationPreparationSteps } from "./mongodb-migrations/0029/migration.js";
import { careerProductOwnerPreparationSteps } from "./mongodb-migrations/0030/migration.js";

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
  const eleventhHash = createHash("sha256").update(await readFile(new URL("./mongodb-migrations/0011/migration.ts", import.meta.url))).digest("hex");
  const twelfthHash = createHash("sha256").update(await readFile(new URL("./mongodb-migrations/0012/migration.ts", import.meta.url))).digest("hex");
  const thirteenthHash = createHash("sha256").update(await readFile(new URL("./mongodb-migrations/0013/migration.ts", import.meta.url))).digest("hex");
  // 0014–0016의 옛 PR 이력과 충돌하지 않도록 새 준비는 0025부터 등록한다. 소유권 템플릿도 실행 입력으로 해시한다.
  const ownershipHash = createHash("sha256");
  for (const name of ["migration.ts", "templates.json"]) ownershipHash.update(await readFile(new URL(`./mongodb-migrations/0017/${name}`, import.meta.url)));
  // 0018 · 0019의 옛 PR 입력은 보존하되 실행 registry에는 등록하지 않는다.
  const notificationProducerHash = createHash("sha256").update(await readFile(new URL("./mongodb-migrations/0020/migration.ts", import.meta.url))).digest("hex");
  const generationWaitingHash = createHash("sha256").update(await readFile(new URL("./mongodb-migrations/0021/migration.ts", import.meta.url))).digest("hex");
  const aiUsageHash = createHash("sha256").update(await readFile(new URL("./mongodb-migrations/0022/migration.ts", import.meta.url))).digest("hex");
  const publicSlugHash = createHash("sha256").update(await readFile(new URL("./mongodb-migrations/0023/migration.ts", import.meta.url))).digest("hex");
  const adminDummyHash = createHash("sha256").update(await readFile(new URL("./mongodb-migrations/0024/migration.ts", import.meta.url))).digest("hex");
  const forward = await Promise.all([
    ["0025", "career_business_writer_preparation", careerBusinessWriterPreparationSteps],
    ["0026", "career_property_mutation_preparation", careerPropertyMutationPreparationSteps],
    ["0027", "career_producer_preparation", careerProducerPreparationSteps],
    ["0028", "career_canonical_preparation", careerCanonicalPreparationSteps],
    ["0029", "career_relation_property_mutation_preparation", careerRelationPropertyMutationPreparationSteps],
    ["0030", "career_product_owner_preparation", careerProductOwnerPreparationSteps],
  ].map(async ([version, name, steps]) => {
    const directory = new URL(`./mongodb-migrations/${version}/`, import.meta.url);
    const manifest = await readFile(new URL("checksum-manifest.json", directory));
    const files = (JSON.parse(manifest.toString("utf8")) as { files: string[] }).files;
    if (new Set(files).size !== files.length || files.some(file => !/^[a-z-]+\.(ts|json)$/.test(file))) throw new Error("invalid forward checksum manifest");
    const hash = createHash("sha256").update(`checksum-manifest.json\0${manifest.byteLength}\0`).update(manifest);
    for (const file of files) {
      const source = await readFile(new URL(file, directory));
      hash.update(`${file}\0${source.byteLength}\0`).update(source);
    }
    return { version: version as string, name: name as string, checksum: hash.digest("hex"), steps: await (steps as () => Promise<MongoMigrationStep[]>)() };
  }));
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
    { version: "0011", name: "preparation_plans", checksum: eleventhHash, steps: await preparationPlanSteps() },
    { version: "0012", name: "identity_session_sliding_expiry", checksum: twelfthHash, steps: await identitySessionSlidingExpirySteps() },
    { version: "0013", name: "identity_email_and_terms", checksum: thirteenthHash, steps: await identityEmailAndTermsSteps() },
    { version: "0017", name: "career_category_ownership", checksum: ownershipHash.digest("hex"), steps: await careerCategoryOwnershipSteps() },
    { version: "0020", name: "notification_producers", checksum: notificationProducerHash, steps: await notificationProducerSteps() },
    { version: "0021", name: "generation_waiting_recipe", checksum: generationWaitingHash, steps: await generationWaitingRecipeSteps() },
    { version: "0022", name: "ai_usage_and_plan_credits", checksum: aiUsageHash, steps: await aiUsageAndPlanCreditSteps() },
    { version: "0023", name: "portfolio_public_slug", checksum: publicSlugHash, steps: await portfolioPublicSlugSteps() },
    { version: "0024", name: "admin_dummy_accounts", checksum: adminDummyHash, steps: await adminDummyAccountSteps() },
    ...forward,
  ];
}
