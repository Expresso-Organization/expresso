import { createHash, randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

import { applyCareerCommands, encodeDocumentAsYUpdate, reconstructYDocument } from "@expresso/editor";
import { mongoCollections, type CareerRecordDoc } from "@expresso/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createMongoFixture } from "../../../test/support/mongodb.js";
import { MongoIdentityService } from "../identity/index.js";
import { CareerService } from "../career/service.js";
import { CareerViewService } from "../career/views.js";
import { MongoCareerComputationService } from "../career-computation/service.js";
import { CareerDocumentService } from "./service.js";

const enabled = process.env.EXPRESSO_LOAD_TEST === "1" && Boolean(process.env.TEST_MONGODB_ADMIN_URL ?? process.env.TEST_MONGODB_URL);
function percentile(values: readonly number[], value: number) { return values[Math.ceil(values.length * value) - 1]!; }
async function budget(name: string, quantile: "p50" | "p75" | "p95", limitMs: number, work: () => Promise<void> | void) {
  await work(); // warmup
  const samples: number[] = [];
  for (let sample = 0; sample < 30; sample += 1) { const started = performance.now(); await work(); samples.push(performance.now() - started); }
  samples.sort((left, right) => left - right);
  const report = { metric: name, p50: percentile(samples, .5), p75: percentile(samples, .75), p95: percentile(samples, .95), limitMs, quantile };
  console.info(JSON.stringify({ event: "career_editor.performance", ...report }));
  expect(report[quantile]).toBeLessThanOrEqual(limitMs);
}

describe.skipIf(!enabled)("career editor performance budgets", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>; let service: CareerDocumentService; let userId: string; let recordId: string; let viewService: CareerViewService; let viewId: string; let computation: MongoCareerComputationService; let rollupRecordId: string; let relationId: string;
  beforeAll(async () => {
    fixture = await createMongoFixture("careerperf"); service = new CareerDocumentService(fixture.resource, "performance-secret"); userId = (await new MongoIdentityService(fixture.resource).signup({ email: `perf-${randomUUID()}@example.com`, password: "correct-horse-battery", displayName: "성능" })).user.id; recordId = randomUUID();
    const category = await mongoCollections(fixture.resource.db).careerCategories.findOne({ isSystem: true });
    await mongoCollections(fixture.resource.db).careerRecords.insertOne({ _id: recordId, userId, categoryId: category!._id, title: "성능", status: "draft", origin: "manual", properties: {}, bodyMd: Array.from({ length: 4 }, () => "가".repeat(49_998)).join("\n\n"), version: 1, updatedAt: new Date(), deletedAt: null });
    await service.bootstrap(userId, recordId);
    const career = new CareerService(fixture.resource); viewService = new CareerViewService(fixture.resource); computation = new MongoCareerComputationService(fixture.resource);
    const scoreId = randomUUID(); const titleId = randomUUID();
    const viewCategory = await career.createCategory(userId, { key: `perfview_${randomUUID().replaceAll("-", "")}`, name: "성능 뷰", icon: "table", defaultView: "table", propertySchema: { score: { id: scoreId, label: "점수", type: "number", required: false, system: false } } });
    await mongoCollections(fixture.resource.db).careerCategories.updateOne({ _id: viewCategory.id }, { $set: { schemaVersion: 1, propertySchemaV2: [{ id: titleId, key: "title", name: "제목", type: "title", required: true, system: true, config: {}, order: 0, version: 1, deletedAt: null }, { id: scoreId, key: "score", name: "점수", type: "number", required: false, system: false, config: {}, order: 1, version: 1, deletedAt: null }] } });
    await mongoCollections(fixture.resource.db).careerRecords.insertMany(Array.from({ length: 100 }, (_, index): CareerRecordDoc => ({ _id: randomUUID(), userId, categoryId: viewCategory.id, title: `뷰 ${index}`, status: "draft", origin: "manual", properties: { score: { type: "number", value: index } }, bodyMd: "", version: 1, updatedAt: new Date(), deletedAt: null })));
    viewId = (await viewService.create(userId, viewCategory.id, 1, { name: "기본", type: "table", filter: null, sorts: [{ propertyId: scoreId, direction: "asc", nulls: "last" }], groupPropertyId: null, groupOrder: [], visiblePropertyIds: [titleId, scoreId], propertyOrder: [titleId, scoreId], columnWidths: {}, gallery: null, board: null, timeline: null })).id;
    const targetScoreId = randomUUID(); relationId = randomUUID(); const rollupId = randomUUID();
    const sourceCategory = await career.createCategory(userId, { key: `perfrollup_${randomUUID().replaceAll("-", "")}`, name: "성능 롤업", icon: "table", defaultView: "table", propertySchema: {} });
    const targetCategory = await career.createCategory(userId, { key: `perftarget_${randomUUID().replaceAll("-", "")}`, name: "성능 대상", icon: "table", defaultView: "table", propertySchema: { score: { label: "점수", type: "number", required: false, system: false } } });
    await mongoCollections(fixture.resource.db).careerCategories.updateOne({ _id: sourceCategory.id }, { $set: { schemaVersion: 1, propertySchemaV2: [{ id: relationId, key: "targets", name: "대상", type: "relation", required: false, system: false, config: { targetCategoryId: targetCategory.id, inversePropertyId: null, cardinality: "multiple", deletePolicy: "restrict" }, order: 0, version: 1, deletedAt: null }, { id: rollupId, key: "sum", name: "합계", type: "rollup", required: false, system: false, config: { relationPropertyId: relationId, targetPropertyId: targetScoreId, aggregation: "sum" }, order: 1, version: 1, deletedAt: null }] } });
    await mongoCollections(fixture.resource.db).careerCategories.updateOne({ _id: targetCategory.id }, { $set: { schemaVersion: 1, propertySchemaV2: [{ id: targetScoreId, key: "score", name: "점수", type: "number", required: false, system: false, config: {}, order: 0, version: 1, deletedAt: null }] } });
    rollupRecordId = (await career.createRecord(userId, randomUUID(), { categoryId: sourceCategory.id, title: "롤업", properties: {}, bodyMd: "" })).record.id;
    const targets = await Promise.all(Array.from({ length: 100 }, (_, index) => career.createRecord(userId, randomUUID(), { categoryId: targetCategory.id, title: `대상 ${index}`, properties: { score: { type: "number", value: index } }, bodyMd: "" })));
    await mongoCollections(fixture.resource.db).careerRecordRelations.insertMany(targets.map(({ record }) => ({ _id: randomUUID(), userId, sourceRecordId: rollupRecordId, sourcePropertyId: relationId, targetRecordId: record.id, inversePropertyId: null, cardinality: "multiple" as const, deletePolicy: "restrict" as const, createdBy: "user" as const, createdAt: new Date(), updatedAt: new Date() })));
  }, 60_000);
  afterAll(async () => { await fixture?.dispose(); });

  it("prints warmup+30-sample p50/p75/p95 and enforces editor budgets", async () => {
    await budget("bootstrap_200kb", "p95", 300, async () => { await service.bootstrap(userId, recordId); });
    const bootstrap = await service.bootstrap(userId, recordId);
    await budget("keystroke", "p95", 50, () => { applyCareerCommands(bootstrap.document, [{ type: "setText", blockId: bootstrap.document.content[0]!.id, text: "입력" }]); });
    await budget("side_peek_first_editable", "p75", 1_500, async () => { await service.bootstrap(userId, recordId); });
    await budget("view_100_records", "p95", 300, async () => { await viewService.query(userId, viewId, null, 100); });
    await budget("relation_rollup_100", "p95", 1_000, async () => {
      const record = await mongoCollections(fixture.resource.db).careerRecords.findOne({ _id: rollupRecordId });
      await computation.recompute({ eventId: randomUUID(), userId, recordId: rollupRecordId, changedPropertyIds: [relationId], sourceRecordVersion: record!.version });
    });
    const snapshotDocument = { schemaVersion: 1 as const, type: "doc" as const, content: Array.from({ length: 20 }, () => ({ id: randomUUID(), type: "paragraph", attrs: {}, text: [{ text: "x".repeat(50_000) }] })) };
    const snapshotUpdate = encodeDocumentAsYUpdate(snapshotDocument);
    await budget("snapshot_restore_1mb", "p95", 2_000, () => { reconstructYDocument([snapshotUpdate]); });
    let sequence = bootstrap.documentVersion;
    await budget("autosave_ack", "p95", 500, async () => {
      const current = await service.bootstrap(userId, recordId); const next = structuredClone(current.document); next.content[0]!.text = [{ text: `저장 ${sequence}` }];
      const update = encodeDocumentAsYUpdate(next, [encodeDocumentAsYUpdate(current.document)]); sequence = current.documentVersion;
      await service.appendUpdate(userId, { recordId, clientId: randomUUID(), clientSequence: 1, expectedSequence: sequence, updateBase64: Buffer.from(update).toString("base64"), checksum: createHash("sha256").update(update).digest("hex") });
    });
  }, 90_000);
});
