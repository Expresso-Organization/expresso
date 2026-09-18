import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";

import { Decimal128, type Collection } from "mongodb";
import type { CanonicalCareerPropertyDefinition } from "@expresso/contracts";
import { mongoCollections, type CareerAiProposalDoc } from "@expresso/database";
import { encodeDocumentAsYUpdate, reconstructYDocument } from "@expresso/editor";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { MongoContext } from "../../platform/mongodb.js";
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

  function gate() {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => { resolve = done; });
    return { promise, resolve };
  }

  // Mongo 명령은 실제 실행하고, 응답을 서비스에 돌려주는 시점만 제어합니다.
  function proposalContext(wrap: (collection: Collection<CareerAiProposalDoc>) => Collection<CareerAiProposalDoc>): MongoContext {
    const db = fixture.resource.db;
    return { ...fixture.resource, db: new Proxy(db, {
      get(target, key) {
        if (key === "collection") return (name: string) => name === "career_ai_proposals" ? wrap(target.collection<CareerAiProposalDoc>(name)) : target.collection(name);
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) };
  }

  async function raceRecord() {
    const career = new CareerService(fixture.resource);
    const id = (await career.createRecord(userId, randomUUID(), { categoryId, title: "경합", properties: {}, bodyMd: "경합 전 본문" })).record.id;
    const bootstrap = await documentService.bootstrap(userId, id);
    return { id, bootstrap, input: { selection: { blockIds: [bootstrap.document.content[0]!.id] }, prompt: "경합" } };
  }

  function controllerCount(service: AiProposalService) {
    return (service as unknown as { controllers: Map<string, AbortController> }).controllers.size;
  }

  it("race A: does not start generation after cancellation at the streaming publication boundary", async () => {
    const record = await raceRecord(); const published = gate(); const resume = gate();
    let proposalId = ""; let starts = 0;
    const context = proposalContext((collection) => new Proxy(collection, {
      get(target, key) {
        if (key === "updateOne") {
          const update: typeof collection.updateOne = async (filter, changes, options) => {
            const result = await target.updateOne(filter, changes, options);
            if (!Array.isArray(changes) && changes.$set?.status === "streaming") {
              proposalId = String(filter._id); published.resolve(); await resume.promise;
            }
            return result;
          };
          return update;
        }
        const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
      },
    }));
    const local = new AiProposalService(context, documentService, { async generate() { starts += 1; return { summary: "경합", commands: [], propertyChanges: [] }; } });
    const progress: string[] = []; local.setPublisher((_id, row) => progress.push(row.status));
    const creating = local.create(userId, record.id, record.input);
    try {
      await published.promise;
      await local.reject(userId, record.id, { recordId: record.id, proposalId }, "cancelled");
    } finally { resume.resolve(); }
    expect((await creating).status).toBe("cancelled");
    expect(progress).toEqual(["draft", "cancelled"]);
    expect(starts).toBe(0);
    expect(controllerCount(local)).toBe(0);
  });

  it("race B: preserves applied content and status when cancellation resumes from a stale ready read", async () => {
    const record = await raceRecord(); const read = gate(); const resume = gate();
    let heldId = "";
    const context = proposalContext((collection) => new Proxy(collection, {
      get(target, key) {
        if (key === "findOne") return async (...args: Parameters<typeof collection.findOne>) => {
          const row = await target.findOne(...args);
          if (heldId && row?._id === heldId && !args[1]?.session) {
            heldId = ""; read.resolve(); await resume.promise;
          }
          return row;
        };
        const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
      },
    }));
    const local = new AiProposalService(context, documentService, { async generate(input) { return { summary: "적용", commands: [{ type: "setText", blockId: input.selectionBlockIds[0]!, text: "적용된 본문" }], propertyChanges: [] }; } });
    const proposal = await local.create(userId, record.id, record.input); heldId = proposal.proposalId;
    const cancelling = local.reject(userId, record.id, { recordId: record.id, proposalId: proposal.proposalId }, "cancelled").then(() => null, (error: unknown) => error);
    try {
      await read.promise;
      await local.apply(userId, record.id, { recordId: record.id, proposalId: proposal.proposalId, expectedDocumentVersion: record.bootstrap.documentVersion, commandIndexes: [0], propertyChangeIndexes: [] });
    } finally { resume.resolve(); }
    const cancelError = await cancelling;
    expect(await local.get(userId, record.id, proposal.proposalId)).toMatchObject({ status: "applied", appliedDocumentVersion: 1 });
    const stored = await documentService.bootstrap(userId, record.id);
    expect(stored.documentVersion).toBe(1);
    expect(stored.document.content[0]?.text?.[0]?.text).toBe("적용된 본문");
    expect(cancelError).toMatchObject({ statusCode: 409 });
    expect(controllerCount(local)).toBe(0);
  });

  it.each(["draft", "streaming"] as const)("cleans controllers when cancellation wins at %s publication", async (phase) => {
    const record = await raceRecord(); const published = gate(); const resume = gate(); let proposalId = ""; let starts = 0;
    const context = proposalContext((collection) => new Proxy(collection, {
      get(target, key) {
        if (phase === "draft" && key === "insertOne") {
          const insert: typeof collection.insertOne = async (row, options) => {
            const result = await target.insertOne(row, options); proposalId = row._id; published.resolve(); await resume.promise; return result;
          };
          return insert;
        }
        if (phase === "streaming" && key === "updateOne") {
          const update: typeof collection.updateOne = async (filter, changes, options) => {
            const result = await target.updateOne(filter, changes, options);
            if (!Array.isArray(changes) && changes.$set?.status === "streaming") { proposalId = String(filter._id); published.resolve(); await resume.promise; }
            return result;
          };
          return update;
        }
        const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
      },
    }));
    const local = new AiProposalService(context, documentService, { async generate() { starts += 1; return { summary: "취소", commands: [], propertyChanges: [] }; } });
    const creating = local.create(userId, record.id, record.input);
    try {
      await published.promise;
      expect(controllerCount(local)).toBe(1);
      await local.reject(userId, record.id, { recordId: record.id, proposalId }, "cancelled");
    } finally { resume.resolve(); }
    expect((await creating).status).toBe("cancelled");
    expect(starts).toBe(0); expect(controllerCount(local)).toBe(0);
  });

  it.each(["insert", "transition", "publish", "adapter", "validation", "ready"] as const)("cleans controllers after %s failure", async (phase) => {
    const record = await raceRecord(); const failure = new Error("의도한 lifecycle 실패");
    const context = proposalContext((collection) => new Proxy(collection, {
      get(target, key) {
        if ((phase === "insert" && key === "insertOne") || (phase === "transition" && key === "updateOne")) return async () => { throw failure; };
        const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
      },
    }));
    const local = new AiProposalService(context, documentService, { async generate() {
      if (phase === "adapter") throw failure;
      return { summary: "실패", commands: phase === "validation" ? [{ type: "setText", blockId: randomUUID(), text: "금지" }] : [], propertyChanges: [] };
    } });
    local.setPublisher((_id, row) => { if ((phase === "publish" && row.status === "streaming") || (phase === "ready" && row.status === "ready")) throw failure; });
    await expect(local.create(userId, record.id, record.input)).rejects.toBeDefined();
    expect(controllerCount(local)).toBe(0);
    if (phase === "adapter" || phase === "validation") expect(await mongoCollections(fixture.resource.db).careerAiProposals.findOne({ recordId: record.id })).toMatchObject({ status: "conflicted" });
  });

  it("race B reverse: cancellation winning during apply rolls back document writes", async () => {
    const record = await raceRecord(); const read = gate(); const resume = gate(); let armed = false;
    const context = proposalContext((collection) => new Proxy(collection, {
      get(target, key) {
        if (key === "findOne") return async (...args: Parameters<typeof collection.findOne>) => {
          const row = await target.findOne(...args);
          if (armed && args[1]?.session && row?.status === "ready") { armed = false; read.resolve(); await resume.promise; }
          return row;
        };
        const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
      },
    }));
    const local = new AiProposalService(context, documentService, { async generate(input) { return { summary: "적용", commands: [{ type: "setText", blockId: input.selectionBlockIds[0]!, text: "남으면 안 되는 본문" }], propertyChanges: [] }; } });
    const proposal = await local.create(userId, record.id, record.input);
    const db = mongoCollections(fixture.resource.db); const snapshots = await db.careerDocumentSnapshots.countDocuments({ recordId: record.id }); armed = true;
    const applying = local.apply(userId, record.id, { recordId: record.id, proposalId: proposal.proposalId, expectedDocumentVersion: 0, commandIndexes: [0], propertyChangeIndexes: [] }).then(() => null, (error: unknown) => error);
    try { await read.promise; await local.reject(userId, record.id, { recordId: record.id, proposalId: proposal.proposalId }, "cancelled"); }
    finally { resume.resolve(); }
    expect(await applying).toMatchObject({ statusCode: 409 });
    expect((await local.get(userId, record.id, proposal.proposalId)).status).toBe("cancelled");
    expect((await documentService.bootstrap(userId, record.id)).document).toEqual(record.bootstrap.document);
    expect(await db.careerRecords.findOne({ _id: record.id })).toMatchObject({ documentVersion: 0 });
    expect(await db.careerDocumentSnapshots.countDocuments({ recordId: record.id })).toBe(snapshots);
    expect(await db.careerDocumentUpdates.countDocuments({ recordId: record.id })).toBe(0);
    expect(await db.careerRecordRevisions.countDocuments({ recordId: record.id, actor: "ai" })).toBe(0);
  });

  it("preserves normal rejection and reports conflicting terminal cancellation", async () => {
    const record = await raceRecord();
    const local = new AiProposalService(fixture.resource, documentService, { async generate() { return { summary: "거절", commands: [], propertyChanges: [] }; } });
    const proposal = await local.create(userId, record.id, record.input);
    const request = { recordId: record.id, proposalId: proposal.proposalId };
    await local.reject(userId, record.id, request);
    await local.reject(userId, record.id, request);
    await expect(local.reject(userId, record.id, request, "cancelled")).rejects.toMatchObject({ statusCode: 409 });
    expect((await local.get(userId, record.id, proposal.proposalId)).status).toBe("rejected");
    expect((await documentService.bootstrap(userId, record.id)).documentVersion).toBe(0);
    expect(controllerCount(local)).toBe(0);
  });

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
    let aborted = false; const adapterStarted = gate();
    const slow: AiProposalAdapter = { async generate(input) { await new Promise<void>((resolve, reject) => { input.signal.addEventListener("abort", () => { aborted = true; reject(new DOMException("취소", "AbortError")); }, { once: true }); void waiting.then(resolve); adapterStarted.resolve(); }); return { summary: "늦음", commands: [], propertyChanges: [] }; } };
    const delayed = new AiProposalService(fixture.resource, documentService, slow);
    const bootstrap = await documentService.bootstrap(userId, recordId); const creating = delayed.create(userId, recordId, { selection: { blockIds: [bootstrap.document.content[0]!.id] }, prompt: "취소" });
    await adapterStarted.promise;
    const row = await mongoCollections(fixture.resource.db).careerAiProposals.findOne({ userId, recordId, status: "streaming" }, { projection: { _id: 1 } });
    await delayed.reject(userId, recordId, { recordId, proposalId: row!._id }, "cancelled"); release();
    expect((await creating).status).toBe("cancelled");
    expect(aborted).toBe(true);
    expect(controllerCount(delayed)).toBe(0);
    await delayed.reject(userId, recordId, { recordId, proposalId: row!._id }, "cancelled");
  });

  it("rejects forbidden block and system-property changes before a proposal becomes ready", async () => {
    const systemPropertyId = randomUUID();
    await mongoCollections(fixture.resource.db).careerCategories.updateOne({ _id: categoryId }, { $set: { propertySchemaV2: [{ id: systemPropertyId, key: "systemNote", name: "시스템", type: "text", required: false, system: true, config: {}, order: 0, version: 1, deletedAt: null }], propertyDefinitions: [{ id: systemPropertyId, key: "systemNote", name: "시스템", type: "text", required: false, system: true, config: {}, order: 0, version: 1, deletedAt: null }] } });
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
    await mongoCollections(fixture.resource.db).careerCategories.updateOne({ _id: categoryId }, { $set: { propertySchemaV2: [{ id: propertyId, key: propertyKey, name: "메모", type: "text", required: false, system: false, config: {}, order: 0, version: 1, deletedAt: null }], propertyDefinitions: [{ id: propertyId, key: propertyKey, name: "메모", type: "text", required: false, system: false, config: {}, order: 0, version: 1, deletedAt: null }] } });
    const career = new CareerService(fixture.resource); const propertyRecordId = (await career.createRecord(userId, randomUUID(), { categoryId, title: "프로퍼티", properties: {}, bodyMd: "본문" })).record.id;
    const bootstrap = await documentService.bootstrap(userId, propertyRecordId); const blockId = bootstrap.document.content[0]!.id;
    const adapter: AiProposalAdapter = { async generate() { return { summary: "프로퍼티", commands: [], propertyChanges: [{ propertyId, previousValue: null, nextValue: { type: "text", value: "AI 메모" } }] }; } };
    const local = new AiProposalService(fixture.resource, documentService, adapter); const proposal = await local.create(userId, propertyRecordId, { selection: { blockIds: [blockId] }, prompt: "메모" });
    await local.apply(userId, propertyRecordId, { recordId: propertyRecordId, proposalId: proposal.proposalId, expectedDocumentVersion: bootstrap.documentVersion, commandIndexes: [], propertyChangeIndexes: [0] });
    const stored = await mongoCollections(fixture.resource.db).careerRecords.findOne({ _id: propertyRecordId });
    expect(stored?.properties[propertyKey]).toEqual({ type: "text", value: "AI 메모" });
    expect(stored?.propertyValues).toEqual([{ propertyDefinitionId: propertyId, type: "text", value: "AI 메모" }]);
    expect(await mongoCollections(fixture.resource.db).outboxEvents.countDocuments({ topic: "career.computation", "payload.recordId": propertyRecordId, "payload.changedPropertyIds": propertyId })).toBe(1);
  });

  async function propertyScenario() {
    const career = new CareerService(fixture.resource);
    const category = await career.createCategory(userId, { key: `preserve_${randomUUID().replaceAll("-", "")}`, name: "보존", icon: "folder", defaultView: "table", propertySchema: {} });
    const noteId = randomUUID(); const keepId = randomUUID();
    const definitions: CanonicalCareerPropertyDefinition[] = [
      { id: noteId, key: "note", name: "메모", type: "text", required: false, system: false, config: {}, order: 0, version: 1, deletedAt: null },
      { id: keepId, key: "keep", name: "정밀 숫자", type: "number", required: false, system: false, config: {}, order: 1, version: 1, deletedAt: null },
    ];
    const db = mongoCollections(fixture.resource.db);
    await db.careerCategories.updateOne({ _id: category.id }, { $set: { propertySchemaV2: definitions, propertyDefinitions: definitions } });
    const record = (await career.createRecord(userId, randomUUID(), { categoryId: category.id, title: "보존", properties: {}, bodyMd: "본문" })).record;
    const bootstrap = await documentService.bootstrap(userId, record.id);
    const keep = { propertyDefinitionId: keepId, type: "number" as const, value: Decimal128.fromString("12345678901234567890.123400") };
    const note = { propertyDefinitionId: noteId, type: "text" as const, value: "canonical" };
    await db.careerRecords.updateOne({ _id: record.id }, { $set: { properties: { note: { type: "text", value: "legacy" } }, propertyValues: [note, keep] } });
    return { db, recordId: record.id, noteId, note, keep, bootstrap };
  }

  it.each([false, true])("preserves canonical properties during body-only apply (empty=%s)", async (empty) => {
    const { db, recordId, note, keep, bootstrap } = await propertyScenario();
    const values = empty ? [] : [note, keep];
    await db.careerRecords.updateOne({ _id: recordId }, { $set: { propertyValues: values } });
    const before = await db.careerRecords.findOne({ _id: recordId });
    const proposal = await ai.create(userId, recordId, { selection: { blockIds: [bootstrap.document.content[0]!.id] }, prompt: "본문만" });
    await ai.apply(userId, recordId, { recordId, proposalId: proposal.proposalId, expectedDocumentVersion: bootstrap.documentVersion, commandIndexes: [0], propertyChangeIndexes: [] });
    const after = await db.careerRecords.findOne({ _id: recordId });
    expect(after?.propertyValues).toEqual(values);
    expect(after?.properties).toEqual(before?.properties);
    expect(await db.outboxEvents.countDocuments({ topic: "career.computation", "payload.recordId": recordId })).toBe(0);
  });

  it.each([false, true])("changes only the selected canonical property (delete=%s)", async (remove) => {
    const { db, recordId, noteId, note, keep, bootstrap } = await propertyScenario();
    const local = new AiProposalService(fixture.resource, documentService, { async generate() {
      return { summary: "메모만", commands: [], propertyChanges: [{ propertyId: noteId, previousValue: { type: "text", value: note.value }, nextValue: remove ? null : { type: "text", value: "changed" } }] };
    } });
    const proposal = await local.create(userId, recordId, { selection: { blockIds: [bootstrap.document.content[0]!.id] }, prompt: "메모만" });
    await local.apply(userId, recordId, { recordId, proposalId: proposal.proposalId, expectedDocumentVersion: bootstrap.documentVersion, commandIndexes: [], propertyChangeIndexes: [0] });
    const stored = await db.careerRecords.findOne({ _id: recordId });
    expect(stored?.propertyValues).toEqual(remove ? [keep] : [{ ...note, value: "changed" }, keep]);
    expect((await db.outboxEvents.findOne({ topic: "career.computation", "payload.recordId": recordId }))?.payload.changedPropertyIds).toEqual([noteId]);
  });

  it("uses canonical absence instead of stale legacy values for a property proposal", async () => {
    const { db, recordId, noteId, bootstrap } = await propertyScenario();
    await db.careerRecords.updateOne({ _id: recordId }, { $set: { propertyValues: [] } });
    const local = new AiProposalService(fixture.resource, documentService, { async generate() {
      return { summary: "추가", commands: [], propertyChanges: [{ propertyId: noteId, previousValue: null, nextValue: { type: "text", value: "new" } }] };
    } });
    const proposal = await local.create(userId, recordId, { selection: { blockIds: [bootstrap.document.content[0]!.id] }, prompt: "추가" });
    await local.apply(userId, recordId, { recordId, proposalId: proposal.proposalId, expectedDocumentVersion: bootstrap.documentVersion, commandIndexes: [], propertyChangeIndexes: [0] });
    expect((await db.careerRecords.findOne({ _id: recordId }))?.propertyValues).toEqual([{ propertyDefinitionId: noteId, type: "text", value: "new" }]);
  });

  it("rejects a canonical value changed after proposal creation and rolls back apply", async () => {
    const { db, recordId, noteId, note, keep, bootstrap } = await propertyScenario();
    const local = new AiProposalService(fixture.resource, documentService, { async generate() {
      return { summary: "메모", commands: [], propertyChanges: [{ propertyId: noteId, previousValue: { type: "text", value: note.value }, nextValue: { type: "text", value: "AI" } }] };
    } });
    const proposal = await local.create(userId, recordId, { selection: { blockIds: [bootstrap.document.content[0]!.id] }, prompt: "메모" });
    await db.careerRecords.updateOne({ _id: recordId }, { $set: { propertyValues: [{ ...note, value: "external" }, keep] }, $inc: { version: 1 } });
    const before = await db.careerRecords.findOne({ _id: recordId });
    const snapshots = await db.careerDocumentSnapshots.countDocuments({ recordId });
    await expect(local.apply(userId, recordId, { recordId, proposalId: proposal.proposalId, expectedDocumentVersion: bootstrap.documentVersion, commandIndexes: [], propertyChangeIndexes: [0] })).rejects.toMatchObject({ statusCode: 409 });
    expect(await db.careerRecords.findOne({ _id: recordId })).toEqual(before);
    expect(await db.careerDocumentSnapshots.countDocuments({ recordId })).toBe(snapshots);
    expect(await db.careerDocumentUpdates.countDocuments({ recordId })).toBe(0);
    expect(await db.outboxEvents.countDocuments({ topic: "career.computation", "payload.recordId": recordId })).toBe(0);
  });

  it.each([false, true])("keeps legacy-only compatibility (property change=%s)", async (changeProperty) => {
    const { db, recordId, noteId, bootstrap } = await propertyScenario();
    await db.careerRecords.updateOne({ _id: recordId }, { $unset: { propertyValues: "" } });
    const local = new AiProposalService(fixture.resource, documentService, { async generate() {
      return { summary: "호환", commands: changeProperty ? [] : [{ type: "setText", blockId: bootstrap.document.content[0]!.id, text: "본문 변경" }], propertyChanges: changeProperty ? [{ propertyId: noteId, previousValue: { type: "text", value: "legacy" }, nextValue: { type: "text", value: "changed" } }] : [] };
    } });
    const proposal = await local.create(userId, recordId, { selection: { blockIds: [bootstrap.document.content[0]!.id] }, prompt: "호환" });
    await local.apply(userId, recordId, { recordId, proposalId: proposal.proposalId, expectedDocumentVersion: bootstrap.documentVersion, commandIndexes: changeProperty ? [] : [0], propertyChangeIndexes: changeProperty ? [0] : [] });
    expect((await db.careerRecords.findOne({ _id: recordId }))?.propertyValues).toEqual([{ propertyDefinitionId: noteId, type: "text", value: changeProperty ? "changed" : "legacy" }]);
  });

});
