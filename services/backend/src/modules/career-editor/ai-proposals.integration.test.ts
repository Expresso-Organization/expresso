import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";

import { mongoCollections } from "@expresso/database";
import { encodeDocumentAsYUpdate, reconstructYDocument } from "@expresso/editor";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createMongoFixture } from "../../../test/support/mongodb.js";
import { MongoIdentityService } from "../identity/index.js";
import { CareerService } from "../career/service.js";
import { AiProposalService } from "./ai-proposals.js";
import type { AiProposalAdapter } from "./ai-adapter.js";
import { CareerDocumentService } from "./service.js";

describe.skipIf(!(process.env.TEST_MONGODB_ADMIN_URL ?? process.env.TEST_MONGODB_URL))("career AI proposal persistence", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
  let userId: string; let otherUserId: string; let categoryId: string; let recordId: string; let documentService: CareerDocumentService; let ai: AiProposalService;
  beforeAll(async () => {
    fixture = await createMongoFixture("careerai");
    const identity = new MongoIdentityService(fixture.resource); userId = (await identity.signup({ email: `ai-${randomUUID()}@example.com`, password: "correct-horse-battery", displayName: "AI" })).user.id; otherUserId = (await identity.signup({ email: `ai-other-${randomUUID()}@example.com`, password: "correct-horse-battery", displayName: "다른 AI" })).user.id;
    const career = new CareerService(fixture.resource); categoryId = (await career.createCategory(userId, { key: `ai_${randomUUID().replaceAll("-", "")}`, name: "AI", icon: "folder", defaultView: "table", propertySchema: {} })).id;
    recordId = (await career.createRecord(userId, randomUUID(), { categoryId, title: "기록", properties: {}, bodyMd: "초기 본문" })).record.id;
    documentService = new CareerDocumentService(fixture.resource, "ai-test-secret");
    const adapter: AiProposalAdapter = { async generate(input) { return { summary: "문장 개선", commands: [{ type: "setText", blockId: input.selectionBlockIds[0]!, text: "AI 변경" }], propertyChanges: [] }; } };
    ai = new AiProposalService(fixture.resource, documentService, adapter);
  }, 60_000);
  afterAll(async () => { await fixture?.dispose(); });

  it("keeps proposals separate, streams progress, rebases stable IDs, applies a partial selection and restores the exact before snapshot", async () => {
    const initial = await documentService.bootstrap(userId, recordId); const blockId = initial.document.content[0]!.id;
    const progress: string[] = []; ai.setPublisher((_recordId, proposal) => progress.push(proposal.status));
    const adapter: AiProposalAdapter = { async generate(input) { expect(input.selectedBlocks).toHaveLength(1); expect(input.selectedBlocks[0]?.id).toBe(blockId); return { summary: "문장 개선", commands: [{ type: "setText", blockId, text: "AI 변경" }, { type: "setText", blockId, text: "선택하지 않은 두 번째 변경" }], propertyChanges: [] }; } };
    const local = new AiProposalService(fixture.resource, documentService, adapter); const updates: Array<{ sequence: number; base64: string }> = []; local.setPublisher((_recordId, proposal) => progress.push(proposal.status)); local.setUpdatePublisher((_recordId, base64, sequence) => updates.push({ base64, sequence }));
    const proposal = await local.create(userId, recordId, { selection: { blockIds: [blockId] }, prompt: "문장을 다듬어" });
    expect(proposal.status).toBe("ready");
    expect(progress).toEqual(expect.arrayContaining(["draft", "streaming", "ready"]));
    expect(await mongoCollections(fixture.resource.db).careerDocumentUpdates.countDocuments({ recordId })).toBe(0);
    const external = structuredClone(initial.document); external.content[0]!.text = [{ text: "사용자 변경" }];
    const update = encodeDocumentAsYUpdate(external, [encodeDocumentAsYUpdate(initial.document)]);
    await documentService.appendUpdate(userId, { recordId, clientId: randomUUID(), clientSequence: 1, expectedSequence: initial.documentVersion, updateBase64: Buffer.from(update).toString("base64"), checksum: createHash("sha256").update(update).digest("hex") });
    const applied = await local.apply(userId, recordId, { recordId, proposalId: proposal.proposalId, expectedDocumentVersion: 1, commandIndexes: [0], propertyChangeIndexes: [] });
    expect(applied).toMatchObject({ status: "applied", appliedDocumentVersion: 2 });
    expect((await documentService.bootstrap(userId, recordId)).document.content[0]?.text?.[0]?.text).toBe("AI 변경");
    expect(await local.apply(userId, recordId, { recordId, proposalId: proposal.proposalId, expectedDocumentVersion: 1, commandIndexes: [0], propertyChangeIndexes: [] })).toMatchObject({ status: "applied" });
    expect(await mongoCollections(fixture.resource.db).careerDocumentUpdates.findOne({ recordId, actor: "ai" })).toBeTruthy();
    expect(updates[0]).toMatchObject({ sequence: 2 });
    const liveUpdates = [encodeDocumentAsYUpdate(initial.document), update, Buffer.from(updates[0]!.base64, "base64")];
    expect(reconstructYDocument(liveUpdates).content[0]?.text?.[0]?.text).toBe("AI 변경");
    await expect(local.get(otherUserId, recordId, proposal.proposalId)).rejects.toMatchObject({ statusCode: 404 });
    await expect(local.undo(userId, recordId, { recordId, proposalId: proposal.proposalId, expectedDocumentVersion: 1 })).rejects.toMatchObject({ statusCode: 409 });
    const restored = await local.undo(userId, recordId, { recordId, proposalId: proposal.proposalId, expectedDocumentVersion: 2 });
    expect(restored.document.content[0]?.text?.[0]?.text).toBe("사용자 변경");
    expect(updates).toHaveLength(2);
    expect(reconstructYDocument([...liveUpdates, Buffer.from(updates[1]!.base64, "base64")]).content[0]?.text?.[0]?.text).toBe("사용자 변경");
  });

  it("rejects inaccessible selection and keeps a cancellation that races the adapter", async () => {
    await expect(ai.create(userId, recordId, { selection: { blockIds: [randomUUID()] }, prompt: "침입" })).rejects.toMatchObject({ statusCode: 409 });
    let release!: () => void; const waiting = new Promise<void>((resolve) => { release = resolve; });
    let aborted = false;
    const slow: AiProposalAdapter = { async generate(input) { await new Promise<void>((resolve, reject) => { input.signal.addEventListener("abort", () => { aborted = true; reject(new DOMException("취소", "AbortError")); }, { once: true }); void waiting.then(resolve); }); return { summary: "늦음", commands: [], propertyChanges: [] }; } };
    const delayed = new AiProposalService(fixture.resource, documentService, slow);
    const bootstrap = await documentService.bootstrap(userId, recordId); const creating = delayed.create(userId, recordId, { selection: { blockIds: [bootstrap.document.content[0]!.id] }, prompt: "취소" });
    let row: { _id: string } | null = null;
    for (let attempt = 0; attempt < 20 && !row; attempt += 1) { row = await mongoCollections(fixture.resource.db).careerAiProposals.findOne({ userId, recordId, status: "streaming" }, { projection: { _id: 1 } }); if (!row) await new Promise((resolve) => setTimeout(resolve, 10)); }
    await delayed.reject(userId, recordId, { recordId, proposalId: row!._id }, "cancelled"); release();
    expect((await creating).status).toBe("cancelled");
    expect(aborted).toBe(true);
    await delayed.reject(userId, recordId, { recordId, proposalId: row!._id }, "cancelled");
  });

  it("rejects forbidden block and system-property changes before a proposal becomes ready", async () => {
    const systemPropertyId = randomUUID();
    await mongoCollections(fixture.resource.db).careerCategories.updateOne({ _id: categoryId }, { $set: { propertySchemaV2: [{ id: systemPropertyId, key: "systemNote", name: "시스템", type: "text", required: false, system: true, config: {}, order: 0, version: 1, deletedAt: null }] } });
    const bootstrap = await documentService.bootstrap(userId, recordId); const blockId = bootstrap.document.content[0]!.id;
    const foreignBlock: AiProposalAdapter = { async generate() { return { summary: "금지", commands: [{ type: "setText", blockId: randomUUID(), text: "침입" }], propertyChanges: [] }; } };
    const systemProperty: AiProposalAdapter = { async generate() { return { summary: "금지", commands: [], propertyChanges: [{ propertyId: systemPropertyId, previousValue: null, nextValue: { type: "text", value: "침입" } }] }; } };
    await expect(new AiProposalService(fixture.resource, documentService, foreignBlock).create(userId, recordId, { selection: { blockIds: [blockId] }, prompt: "침입" })).rejects.toMatchObject({ statusCode: 409 });
    await expect(new AiProposalService(fixture.resource, documentService, systemProperty).create(userId, recordId, { selection: { blockIds: [blockId] }, prompt: "침입" })).rejects.toMatchObject({ statusCode: 409 });
    expect(await mongoCollections(fixture.resource.db).careerAiProposals.countDocuments({ userId, recordId, status: "conflicted" })).toBeGreaterThanOrEqual(2);
  });

  it("marks a proposal conflicted when a base-drifted selected block was deleted", async () => {
    const current = await documentService.bootstrap(userId, recordId); const blockId = current.document.content[0]!.id;
    const adapter: AiProposalAdapter = { async generate() { return { summary: "삭제 충돌", commands: [{ type: "setText", blockId, text: "변경" }], propertyChanges: [] }; } };
    const local = new AiProposalService(fixture.resource, documentService, adapter);
    const proposal = await local.create(userId, recordId, { selection: { blockIds: [blockId] }, prompt: "변경" });
    const deleted = structuredClone(current.document); deleted.content = [];
    const update = encodeDocumentAsYUpdate(deleted, [encodeDocumentAsYUpdate(current.document)]);
    await documentService.appendUpdate(userId, { recordId, clientId: randomUUID(), clientSequence: 9, expectedSequence: current.documentVersion, updateBase64: Buffer.from(update).toString("base64"), checksum: createHash("sha256").update(update).digest("hex") });
    await expect(local.apply(userId, recordId, { recordId, proposalId: proposal.proposalId, expectedDocumentVersion: current.documentVersion + 1, commandIndexes: [0], propertyChangeIndexes: [] })).rejects.toMatchObject({ statusCode: 409 });
    expect((await local.get(userId, recordId, proposal.proposalId)).status).toBe("conflicted");
  });

  it("applies selected property changes atomically and emits computation work", async () => {
    const propertyId = randomUUID(); const propertyKey = "note";
    await mongoCollections(fixture.resource.db).careerCategories.updateOne({ _id: categoryId }, { $set: { propertySchemaV2: [{ id: propertyId, key: propertyKey, name: "메모", type: "text", required: false, system: false, config: {}, order: 0, version: 1, deletedAt: null }] } });
    const career = new CareerService(fixture.resource); const propertyRecordId = (await career.createRecord(userId, randomUUID(), { categoryId, title: "프로퍼티", properties: {}, bodyMd: "본문" })).record.id;
    const bootstrap = await documentService.bootstrap(userId, propertyRecordId); const blockId = bootstrap.document.content[0]!.id;
    const adapter: AiProposalAdapter = { async generate() { return { summary: "프로퍼티", commands: [], propertyChanges: [{ propertyId, previousValue: null, nextValue: { type: "text", value: "AI 메모" } }] }; } };
    const local = new AiProposalService(fixture.resource, documentService, adapter); const proposal = await local.create(userId, propertyRecordId, { selection: { blockIds: [blockId] }, prompt: "메모" });
    await local.apply(userId, propertyRecordId, { recordId: propertyRecordId, proposalId: proposal.proposalId, expectedDocumentVersion: bootstrap.documentVersion, commandIndexes: [], propertyChangeIndexes: [0] });
    expect((await mongoCollections(fixture.resource.db).careerRecords.findOne({ _id: propertyRecordId }))?.properties[propertyKey]).toEqual({ type: "text", value: "AI 메모" });
    expect(await mongoCollections(fixture.resource.db).outboxEvents.countDocuments({ topic: "career.computation", "payload.recordId": propertyRecordId, "payload.changedPropertyIds": propertyId })).toBe(1);
  });
});
