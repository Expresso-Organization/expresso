import { randomUUID } from "node:crypto";
import { mongoCollections } from "@expresso/database";
import { Collection, Decimal128 } from "mongodb";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createMongoFixture } from "../../../test/support/mongodb.js";
import { MongoIdentityService } from "../identity/index.js";
import { CareerService } from "../career/service.js";
import { AiProposalService } from "./ai-proposals.js";
import { CareerDocumentService } from "./service.js";
import { PreparedAiProposalService } from "./prepared-ai-proposals.js";
import { PreparedCareerDocumentWriter } from "./prepared-document-writer.js";
import { CareerProducerCoordinator, careerProducerScopeFilter, validateCareerProducerIntent } from "../career/index.js";
import { inTransaction } from "../../platform/mongo-transaction.js";
import type { CareerProducerBusinessPort } from "../career/index.js";

describe.skipIf(!(process.env.TEST_MONGODB_ADMIN_URL ?? process.env.TEST_MONGODB_URL))("prepared AI proposal producers", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
  let userId: string;
  let document: CareerDocumentService;
  let career: CareerService;
  beforeAll(async () => {
    fixture = await createMongoFixture("preparedai");
    userId = (await new MongoIdentityService(fixture.resource).signup({ email: `prepared-ai-${randomUUID()}@example.com`, password: "correct-horse-battery", displayName: "준비" })).user.id;
    career = new CareerService(fixture.resource); document = new CareerDocumentService(fixture.resource);
  }, 60_000);
  afterAll(async () => fixture?.dispose());
  async function scenario() {
    const propertyId = randomUUID(); const keepId = randomUUID();
    const category = await career.createCategory(userId, { key: `prepared_${randomUUID().replaceAll("-", "")}`, name: "준비", icon: "folder", defaultView: "table", propertySchemaV2:[] });
    const definition = { id: propertyId, key: "note", name: "메모", type: "text" as const, required: false, system: false, config: {}, order: 0, version: 1, deletedAt: null };
    await mongoCollections(fixture.resource.db).careerCategories.updateOne({ _id: category.id }, { $set: { propertySchemaV2: [definition] } });
    const record = (await career.createRecord(userId, randomUUID(), { categoryId: category.id, title: "기록", properties: { note: { type: "text", value: "before" } }, bodyMd: "원문" })).record;
    await mongoCollections(fixture.resource.db).careerRecords.updateOne({ _id: record.id }, { $set: { propertyValues: [{ propertyDefinitionId: propertyId, type: "text", value: "before" }, { propertyDefinitionId: keepId, type: "number", value: Decimal128.fromString("12345678901234567890.123400") }] } });
    const bootstrap = await document.bootstrap(userId, record.id);
    const blockId = bootstrap.document.content[0]!.id;
    const ai = new AiProposalService(fixture.resource, document, { async generate() { return { summary: "준비된 변경", commands: [{ type: "setText", blockId, text: "첫 변경" }, { type: "setText", blockId, text: "선택하지 않은 변경" }], propertyChanges: [{ propertyId, previousValue: { type: "text", value: "before" }, nextValue: { type: "text", value: "after" } }] }; } });
    const proposal = await ai.create(userId, record.id, { selection: { blockIds: [blockId] }, prompt: "변경" });
    const prepared = new PreparedAiProposalService(fixture.resource, document);
    const input = { recordId: record.id, proposalId: proposal.proposalId, operationId: randomUUID(), expectedDocumentVersion: 0, commandIndexes: [0], propertyChangeIndexes: [] };
    return { record, proposal, input, prepared, category, propertyId, keepId, ai };
  }
  it("freezes a body-only operation without reading or rebuilding canonical business values", async () => {
    const { record, input, prepared } = await scenario();
    await mongoCollections(fixture.resource.db).careerRecords.updateOne({ _id: record.id }, { $unset: { propertyValues: "" } });
    const scope = await prepared.prepare(userId, record.id, input);
    const stored = await mongoCollections(fixture.resource.db).careerAiProposals.findOne({ _id: input.proposalId });
    expect(stored?.writerIntegration).toMatchObject({ ...scope, state: "pending", business: null, document: { kind: "commands", expectedVersion: 0, commands: [{ type: "setText", text: "첫 변경" }] } });
    expect(await mongoCollections(fixture.resource.db).careerDocumentUpdates.countDocuments({ recordId: record.id })).toBe(0);
    expect((await mongoCollections(fixture.resource.db).careerRecords.findOne({ _id: record.id }))?.version).toBe(1);
  });
  it("freezes a business-only selected canonical delta without artificial document writes", async () => {
    const { record, input, prepared, propertyId } = await scenario();
    const scope = await prepared.prepare(userId, record.id, { ...input, commandIndexes: [], propertyChangeIndexes: [0] });
    const stored = await mongoCollections(fixture.resource.db).careerAiProposals.findOne({ _id: input.proposalId });
    expect(stored?.writerIntegration).toMatchObject({ ...scope, document: null, business: { kind: "patch", recordId: record.id, expectedVersion: 1, expectedCategoryVersion: 1, patches: [{ propertyValues: { set: [{ propertyDefinitionId: propertyId, type: "text", value: "after" }], unsetPropertyIds: [] } }] } });
    expect((await document.bootstrap(userId, record.id)).documentVersion).toBe(0);
  });
  it("freezes both owners for mixed selection and replays only identical preparation", async () => {
    const { record, input, prepared, propertyId } = await scenario();
    const request = { ...input, propertyChangeIndexes: [0] };
    const scope = await prepared.prepare(userId, record.id, request);
    expect(await prepared.prepare(userId, record.id, request)).toEqual(scope);
    const stored = await mongoCollections(fixture.resource.db).careerAiProposals.findOne({ _id: input.proposalId });
    expect(stored?.writerIntegration?.business?.kind).toBe("patch"); expect(stored?.writerIntegration?.document?.kind).toBe("commands");
    expect(JSON.stringify(stored?.writerIntegration)).not.toContain("12345678901234567890");
    expect(JSON.stringify(stored?.writerIntegration)).toContain(propertyId);
    await expect(prepared.prepare(userId, record.id, { ...request, commandIndexes: [1] })).rejects.toMatchObject({ statusCode: 409 });
    await expect(prepared.prepare(userId, record.id, { ...request, operationId: randomUUID() })).rejects.toMatchObject({ statusCode: 409 });
  });
  it("requires selected canonical storage for a business mutation and rejects empty preparation", async () => {
    const { record, input, prepared } = await scenario();
    await mongoCollections(fixture.resource.db).careerRecords.updateOne({ _id: record.id }, { $unset: { propertyValues: "" } });
    await expect(prepared.prepare(userId, record.id, { ...input, commandIndexes: [], propertyChangeIndexes: [0] })).rejects.toMatchObject({ statusCode: 409 });
    await expect(prepared.prepare(userId, record.id, { ...input, commandIndexes: [] })).rejects.toMatchObject({ statusCode: 400 });
  });
  function businessPort(failAfterCommit = false): CareerProducerBusinessPort {
    return { async commit(request) {
      const receipt = await inTransaction(fixture.resource, async (tx) => {
        const db = mongoCollections(tx.db);
        const source = await db.careerAiProposals.findOne(careerProducerScopeFilter(request), { session: tx.session });
        const intent = validateCareerProducerIntent(source!.writerIntegration);
        if (intent.businessResult) return intent.businessResult;
        if (intent.state !== "running" || intent.leaseToken !== request.leaseToken || intent.business?.kind !== "patch") throw new Error("business fence lost");
        const before = await db.careerRecords.findOne({ _id: intent.business.recordId, userId, version: intent.business.expectedVersion }, { session: tx.session });
        if (!before?.propertyValues) throw new Error("business version stale");
        const patch = intent.business.patches[0]!;
        if (!("propertyValues" in patch) || !patch.propertyValues) throw new Error("selected delta missing");
        const delta = patch.propertyValues;
        const values = before.propertyValues.filter((value) => !delta.unsetPropertyIds.includes(value.propertyDefinitionId) && !delta.set.some((next) => next.propertyDefinitionId === value.propertyDefinitionId));
        const updated = await db.careerRecords.findOneAndUpdate({ _id: before._id, userId, version: before.version }, { $set: { propertyValues: [...values, ...delta.set] as never, updatedAt: new Date() }, $inc: { version: 1 } }, { session: tx.session, returnDocument: "after" });
        const result = { data: { id: updated!._id, userId, categoryId: updated!.categoryId, title: updated!.title, propertyValues: updated!.propertyValues!.map((value) => value.type === "number" ? { ...value, value: value.value.toString() } : value), status: updated!.status, version: updated!.version, updatedAt: updated!.updatedAt.toISOString() }, replayed: false };
        await db.careerAiProposals.updateOne({ ...careerProducerScopeFilter(request), "writerIntegration.leaseToken": request.leaseToken }, { $set: { "writerIntegration.businessResult": result } }, { session: tx.session });
        return result;
      });
      if (failAfterCommit) { failAfterCommit = false; throw new Error("lost business acknowledgement"); }
      return receipt;
    } };
  }
  it("executes body-only through document ownership without a business fallback", async () => {
    const { record, input } = await scenario();
    const owner = new PreparedCareerDocumentWriter(fixture.resource);
    const coordinator = new CareerProducerCoordinator(fixture.resource, { async commit() { throw new Error("unexpected business call"); } }, owner);
    const producer = new PreparedAiProposalService(fixture.resource, document, coordinator);
    const scope = await producer.prepare(userId, record.id, input);
    const intent = await producer.execute(scope);
    expect(intent.state).toBe("completed"); expect(intent.businessResult).toBeNull();
    expect((await mongoCollections(fixture.resource.db).careerRecords.findOne({ _id: record.id }))?.version).toBe(1);
    expect((await mongoCollections(fixture.resource.db).careerAiProposals.findOne({ _id: input.proposalId }))?.status).toBe("applied");
    expect((await document.bootstrap(userId, record.id)).document.content[0]?.text?.[0]?.text).toBe("첫 변경");
    expect(await producer.execute(scope)).toEqual(intent);
  });
  it("retries a mixed operation after a committed business response is lost", async () => {
    const { record, input, propertyId, keepId } = await scenario();
    const owner = new PreparedCareerDocumentWriter(fixture.resource);
    const coordinator = new CareerProducerCoordinator(fixture.resource, businessPort(true), owner);
    const producer = new PreparedAiProposalService(fixture.resource, document, coordinator);
    const scope = await producer.prepare(userId, record.id, { ...input, propertyChangeIndexes: [0] });
    await expect(producer.execute(scope)).rejects.toThrow("lost business acknowledgement");
    const partial = await coordinator.pending(scope);
    expect(partial).toMatchObject({ state: "retry", documentResult: null, businessResult: { data: { version: 2 } } });
    await expect(producer.cancel(scope)).rejects.toMatchObject({ statusCode: 409 });
    const intent = await producer.execute(scope);
    expect(intent.state).toBe("completed");
    const stored = await mongoCollections(fixture.resource.db).careerRecords.findOne({ _id: record.id });
    expect(stored?.version).toBe(2);
    expect(stored?.propertyValues?.find((value) => value.propertyDefinitionId === propertyId)).toMatchObject({ value: "after" });
    expect(stored?.propertyValues?.find((value) => value.propertyDefinitionId === keepId)?.value?.toString()).toBe("12345678901234567890.123400");
    expect(await mongoCollections(fixture.resource.db).careerDocumentUpdates.countDocuments({ recordId: record.id })).toBe(1);
  });
  it("undoes only the bounded document operation and preserves canonical changes and historical receipt", async () => {
    const { record, input, propertyId } = await scenario();
    const owner = new PreparedCareerDocumentWriter(fixture.resource);
    const coordinator = new CareerProducerCoordinator(fixture.resource, businessPort(), owner);
    const producer = new PreparedAiProposalService(fixture.resource, document, coordinator);
    const appliedScope = await producer.prepare(userId, record.id, { ...input, propertyChangeIndexes: [0] });
    const applied = await producer.execute(appliedScope);
    const undoRequest = { recordId: record.id, proposalId: input.proposalId, operationId: randomUUID(), expectedDocumentVersion: applied.documentResult!.documentVersion };
    const undoScope = await producer.prepareUndo(userId, record.id, undoRequest);
    const undo = await producer.execute(undoScope);
    expect(undo.documentResult?.documentVersion).toBe(2); expect(undo.business).toBeNull();
    expect((await document.bootstrap(userId, record.id)).document.content[0]?.text?.[0]?.text).toBe("원문");
    const stored = await mongoCollections(fixture.resource.db).careerRecords.findOne({ _id: record.id });
    expect(stored?.version).toBe(2); expect(stored?.propertyValues?.find((value) => value.propertyDefinitionId === propertyId)?.value).toBe("after");
    expect(await producer.prepareUndo(userId, record.id, undoRequest)).toEqual(undoScope);
    expect(await producer.execute(undoScope)).toEqual(undo);
    expect(await coordinator.pending(appliedScope)).toEqual(applied);
    expect(await producer.prepare(userId, record.id, { ...input, propertyChangeIndexes: [0] })).toEqual(appliedScope);
    expect(await producer.execute(appliedScope)).toEqual(applied);
    await expect(producer.prepare(userId, record.id, { ...input, propertyChangeIndexes: [0], commandIndexes: [1] })).rejects.toMatchObject({ statusCode: 409 });
    expect((await document.bootstrap(userId, record.id)).documentVersion).toBe(2);
    await expect(producer.prepareUndo(userId, record.id, { ...undoRequest, operationId: randomUUID() })).rejects.toMatchObject({ statusCode: 409 });
    expect(await mongoCollections(fixture.resource.db).careerDocumentUpdates.countDocuments({ recordId: record.id })).toBe(2);
  });
  it.each(["cancel", "reject"] as const)("fences %s before owner commit and rejects execution", async (method) => {
    const { record, input } = await scenario();
    const owner = new PreparedCareerDocumentWriter(fixture.resource);
    const coordinator = new CareerProducerCoordinator(fixture.resource, businessPort(), owner);
    const producer = new PreparedAiProposalService(fixture.resource, document, coordinator);
    const scope = await producer.prepare(userId, record.id, input);
    await producer[method](scope);
    expect((await mongoCollections(fixture.resource.db).careerAiProposals.findOne({ _id: input.proposalId }))?.status).toBe(method === "cancel" ? "cancelled" : "rejected");
    await expect(producer.execute(scope)).rejects.toMatchObject({ statusCode: 409 });
    expect((await document.bootstrap(userId, record.id)).documentVersion).toBe(0);
  });  it.each(["cancel", "reject"] as const)("fences legacy %s on a prepared business-only source", async (action) => {
    const { record, input, prepared, ai } = await scenario();
    await prepared.prepare(userId, record.id, { ...input, commandIndexes: [], propertyChangeIndexes: [0] });
    await expect(ai.reject(userId, record.id, { recordId: record.id, proposalId: input.proposalId }, action === "cancel" ? "cancelled" : "rejected")).rejects.toMatchObject({ statusCode: 409 });
    const source = await mongoCollections(fixture.resource.db).careerAiProposals.findOne({ _id: input.proposalId });
    expect(source?.status).toBe("ready"); expect(source?.writerIntegration?.state).toBe("pending");
  });
  it("fences legacy apply on a prepared business-only source without a document reservation", async () => {
    const { record, input, prepared, ai } = await scenario();
    const selected = { ...input, commandIndexes: [], propertyChangeIndexes: [0] };
    await prepared.prepare(userId, record.id, selected);
    const { operationId: _operationId, ...legacyInput } = selected;
    await expect(ai.apply(userId, record.id, legacyInput)).rejects.toMatchObject({ statusCode: 409 });
    expect((await mongoCollections(fixture.resource.db).careerRecords.findOne({ _id: record.id }))?.version).toBe(1);
    expect((await document.bootstrap(userId, record.id)).documentVersion).toBe(0);
  });
  it("does not expire the visible proposal of a durable prepared operation", async () => {
    const { record, input, prepared, ai } = await scenario();
    await prepared.prepare(userId, record.id, input);
    await mongoCollections(fixture.resource.db).careerAiProposals.updateOne({ _id: input.proposalId }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await ai.get(userId, record.id, input.proposalId)).status).toBe("ready");
    expect((await mongoCollections(fixture.resource.db).careerAiProposals.findOne({ _id: input.proposalId }))?.writerIntegration?.state).toBe("pending");
  });
  it.each(["cancel", "reject"] as const)("fences legacy %s when preparation wins after its source read", async (action) => {
    const { record, input, prepared, ai } = await scenario();
    const original = Collection.prototype.updateOne;
    let raced = false;
    const spy = vi.spyOn(Collection.prototype, "updateOne").mockImplementation(async function (this: Collection, filter, update, options) {
      if (!raced && this.collectionName === "career_ai_proposals" && filter._id === input.proposalId && !Array.isArray(update) && update.$set?.status === (action === "cancel" ? "cancelled" : "rejected")) {
        raced = true;
        await prepared.prepare(userId, record.id, { ...input, commandIndexes: [], propertyChangeIndexes: [0] });
      }
      return original.call(this, filter, update, options);
    });
    try {
      await expect(ai.reject(userId, record.id, { recordId: record.id, proposalId: input.proposalId }, action === "cancel" ? "cancelled" : "rejected")).rejects.toMatchObject({ statusCode: 409 });
    } finally { spy.mockRestore(); }
    expect(raced).toBe(true);
    const source = await mongoCollections(fixture.resource.db).careerAiProposals.findOne({ _id: input.proposalId });
    expect(source?.status).toBe("ready"); expect(source?.writerIntegration?.state).toBe("pending");
  });
  it("fences lazy expiry when preparation wins after its source read", async () => {
    const { record, input, prepared, ai } = await scenario();
    await prepared.prepare(userId, record.id, input);
    const source = await mongoCollections(fixture.resource.db).careerAiProposals.findOne({ _id: input.proposalId });
    const intent = source!.writerIntegration!;
    await mongoCollections(fixture.resource.db).careerAiProposals.updateOne({ _id: input.proposalId }, { $unset: { writerIntegration: "" }, $set: { expiresAt: new Date(Date.now() - 1000) } });
    const original = Collection.prototype.updateOne;
    let raced = false;
    const spy = vi.spyOn(Collection.prototype, "updateOne").mockImplementation(async function (this: Collection, filter, update, options) {
      if (!raced && this.collectionName === "career_ai_proposals" && filter._id === input.proposalId && !Array.isArray(update) && update.$set?.status === "expired") {
        raced = true;
        await original.call(this, { _id: input.proposalId }, { $set: { writerIntegration: intent } });
      }
      return original.call(this, filter, update, options);
    });
    let visible;
    try { visible = await ai.get(userId, record.id, input.proposalId); }
    finally { spy.mockRestore(); }
    expect(raced).toBe(true); expect(visible.status).toBe("ready");
    const after = await mongoCollections(fixture.resource.db).careerAiProposals.findOne({ _id: input.proposalId });
    expect(after?.status).toBe("ready"); expect(after?.writerIntegration).toEqual(intent);
  });
});
