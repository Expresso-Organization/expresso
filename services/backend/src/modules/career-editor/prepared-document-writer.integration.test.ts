import {documentState, encodeDocumentAsYUpdate, reconstructYDocument} from "../../../test/support/career-document-client.js";
import { createHash, randomUUID } from "node:crypto";
import { mongoCollections } from "@expresso/database";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMongoFixture } from "../../../test/support/mongodb.js";
import { MongoIdentityService } from "../identity/index.js";
import { CareerService } from "../career/service.js";
import { AiProposalService } from "./ai-proposals.js";
import { CareerDocumentService } from "./service.js";
import { PreparedCareerDocumentWriter } from "./prepared-document-writer.js";
import { createCareerProducerIntent } from "../career/index.js";

describe.skipIf(!(process.env.TEST_MONGODB_ADMIN_URL ?? process.env.TEST_MONGODB_URL))("prepared document reservations", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
  let userId: string;
  let career: CareerService;
  let document: CareerDocumentService;
  beforeAll(async () => {
    fixture = await createMongoFixture("docreservation");
    userId = (await new MongoIdentityService(fixture.resource).signup({ email: `reserved-${randomUUID()}@example.com`, password: "correct-horse-battery", displayName: "예약" })).user.id;
    career = new CareerService(fixture.resource);
    document = new CareerDocumentService(fixture.resource);
  }, 60_000);
  afterAll(async () => fixture?.dispose());
  async function scenario() {
    const category = await career.createCategory(userId, { key: `reserved_${randomUUID().replaceAll("-", "")}`, name: "예약", icon: "folder", defaultView: "table", propertySchemaV2:[] });
    const record = (await career.createRecord(userId, randomUUID(), { categoryId: category.id, title: "기록", properties: {}, bodyMd: "원문" })).record;
    const bootstrap = await document.bootstrap(userId, record.id);
    const scope = { producer: "ai-proposal", userId, sourceId: randomUUID(), operationId: randomUUID(), fingerprint: "a".repeat(64) };
    return { record, bootstrap, scope };
  }
  async function reserve(recordId: string, scope: object) {
    await fixture.resource.db.collection<import("mongodb").Document & { _id: string }>("career_records").updateOne({ _id: recordId }, { $set: { documentReservation: scope } });
  }
  it("blocks user Yjs writes while an owner reservation holds the document", async () => {
    const { record, bootstrap, scope } = await scenario();
    await reserve(record.id, scope);
    const after = structuredClone(bootstrap.document); after.content[0]!.text = [{ text: "침입" }];
    const update = encodeDocumentAsYUpdate(after, [documentState(bootstrap)]);
    await expect(document.appendUpdate(userId, { recordId: record.id, clientId: randomUUID(), clientSequence: 1, expectedSequence: 0, updateBase64: Buffer.from(update).toString("base64"), checksum: createHash("sha256").update(update).digest("hex") })).rejects.toMatchObject({ statusCode: 409 });
    expect(await mongoCollections(fixture.resource.db).careerDocumentUpdates.countDocuments({ recordId: record.id })).toBe(0);
  });
  it("blocks revision restore under a durable document reservation", async () => {
    const { record, bootstrap, scope } = await scenario();
    const snapshot = await mongoCollections(fixture.resource.db).careerDocumentSnapshots.findOne({ recordId: record.id });
    const revision = await document.createRevision({ id: randomUUID(), userId, recordId: record.id, actor: "user", summary: "초기", beforeVersion: 0, afterVersion: 0, snapshotId: snapshot!._id, createdAt: new Date().toISOString() });
    await reserve(record.id, scope);
    await expect(document.restoreRevision(userId, revision.id, bootstrap.documentVersion, record.id)).rejects.toMatchObject({ statusCode: 409 });
    expect((await document.bootstrap(userId, record.id)).documentVersion).toBe(0);
  });
  it("blocks legacy AI application from taking a prepared document reservation", async () => {
    const { record, bootstrap, scope } = await scenario();
    const ai = new AiProposalService(fixture.resource, document, { async generate() { return { summary: "변경", commands: [{ type: "setText", blockId: bootstrap.document.content[0]!.id, text: "침입" }], propertyChanges: [] }; } });
    const proposal = await ai.create(userId, record.id, { selection: { blockIds: [bootstrap.document.content[0]!.id] }, prompt: "변경" });
    await reserve(record.id, scope);
    await expect(ai.apply(userId, record.id, { recordId: record.id, proposalId: proposal.proposalId, expectedDocumentVersion: 0, commandIndexes: [0], propertyChangeIndexes: [] })).rejects.toMatchObject({ statusCode: 409 });
    expect((await document.bootstrap(userId, record.id)).documentVersion).toBe(0);
  });
  it("blocks legacy body replacement without blocking ordinary property changes", async () => {
    const { record, scope } = await scenario();
    await reserve(record.id, scope);
    await expect(career.updateRecord(userId, record.id, record.version, { bodyMd: "침입" })).rejects.toMatchObject({ statusCode: 409 });
    const changed = await career.updateRecord(userId, record.id, record.version, { title: "이름 변경" });
    expect(changed.title).toBe("이름 변경");
    expect(changed.bodyMd.trim()).toBe("원문");
  });
  async function ownerScenario() {
    const existing = await scenario();
    const ai = new AiProposalService(fixture.resource, document, { async generate() { return { summary: "준비된 변경", commands: [{ type: "setText", blockId: existing.bootstrap.document.content[0]!.id, text: "준비된 본문" }], propertyChanges: [] }; } });
    const proposal = await ai.create(userId, existing.record.id, { selection: { blockIds: [existing.bootstrap.document.content[0]!.id] }, prompt: "변경" });
    const scope = { ...existing.scope, producer: "ai-proposal" as const, sourceId: proposal.proposalId };
    const leaseToken = randomUUID();
    const frozen = createCareerProducerIntent({ ...scope, business: null, document: { kind: "commands", recordId: existing.record.id, expectedVersion: 0, commands: proposal.commands, allowedBlockIds: proposal.selection.blockIds, summary: proposal.summary } });
    scope.fingerprint = frozen.fingerprint;
    const intent = { ...frozen, state: "running" as const, leaseToken, leaseUntil: new Date(Date.now() + 60_000).toISOString(), attempts: 1, fence: 1 };
    await fixture.resource.db.collection<import("mongodb").Document & { _id: string }>("career_ai_proposals").updateOne({ _id: proposal.proposalId }, { $set: { writerIntegration: intent } });
    return { ...existing, scope, leaseToken, intent, writer: new PreparedCareerDocumentWriter(fixture.resource) };
  }
  it("reserves a document idempotently and rejects a different prepared operation", async () => {
    const { record, scope, writer } = await ownerScenario();
    await writer.reserve(scope); await writer.reserve(scope);
    expect((await fixture.resource.db.collection<import("mongodb").Document & { _id: string }>("career_records").findOne({ _id: record.id }))?.documentReservation).toEqual(scope);
    const rival = await ownerScenario();
    await fixture.resource.db.collection<import("mongodb").Document & { _id: string }>("career_ai_proposals").updateOne({ _id: rival.scope.sourceId }, { $set: { "writerIntegration.document.recordId": record.id } });
    await expect(rival.writer.reserve(rival.scope)).rejects.toMatchObject({ statusCode: 409 });
  });
  it("stores Yjs updates, snapshots, revision and replay receipt atomically without business writes", async () => {
    const { record, bootstrap, scope, leaseToken, writer } = await ownerScenario();
    const before = await mongoCollections(fixture.resource.db).careerRecords.findOne({ _id: record.id });
    await writer.reserve(scope);
    const receipt = await writer.commit({ ...scope, leaseToken });
    expect(receipt).toMatchObject({ recordId: record.id, documentVersion: 1 });
    expect(await writer.commit({ ...scope, leaseToken })).toEqual(receipt);
    const stored = await mongoCollections(fixture.resource.db).careerRecords.findOne({ _id: record.id });
    expect(stored?.version).toBe(before?.version); expect(stored?.updatedAt).toEqual(before?.updatedAt); expect(stored?.properties).toEqual(before?.properties); expect(stored?.bodyMd).toContain("준비된 본문");
    expect((stored as unknown as { documentReservation?: unknown }).documentReservation).toBeUndefined();
    expect((await document.bootstrap(userId, record.id)).document.content[0]?.text?.[0]?.text).toBe("준비된 본문");
    const update = await mongoCollections(fixture.resource.db).careerDocumentUpdates.findOne({ recordId: record.id });
    expect(update?.actor).toBe("ai"); expect(update?.clientId).toBe(scope.operationId);
    const reconstructed = reconstructYDocument([documentState(bootstrap), new Uint8Array(update!.update.buffer)]);
    expect(reconstructed.content[0]?.text?.[0]?.text).toBe("준비된 본문");
    expect(await mongoCollections(fixture.resource.db).careerDocumentUpdates.countDocuments({ recordId: record.id })).toBe(1);
    expect(await mongoCollections(fixture.resource.db).careerRecordRevisions.countDocuments({ recordId: record.id })).toBe(1);
    expect((await fixture.resource.db.collection<import("mongodb").Document & { _id: string }>("career_ai_proposals").findOne({ _id: scope.sourceId }))?.writerIntegration.documentResult).toEqual(receipt);
    await expect(writer.cancel(scope)).rejects.toMatchObject({ statusCode: 409 });
  });
  it("rejects expired leases and stale versions without hiding a partial business receipt", async () => {
    const { record, scope, leaseToken, writer } = await ownerScenario();
    await writer.reserve(scope);
    await fixture.resource.db.collection<import("mongodb").Document & { _id: string }>("career_ai_proposals").updateOne({ _id: scope.sourceId }, { $set: { "writerIntegration.leaseUntil": new Date(Date.now() - 100).toISOString() } });
    await expect(writer.commit({ ...scope, leaseToken })).rejects.toMatchObject({ statusCode: 409 });
    expect((await document.bootstrap(userId, record.id)).documentVersion).toBe(0);
    await fixture.resource.db.collection<import("mongodb").Document & { _id: string }>("career_ai_proposals").updateOne({ _id: scope.sourceId }, { $set: { "writerIntegration.leaseUntil": new Date(Date.now() + 60_000).toISOString() } });
    await fixture.resource.db.collection<import("mongodb").Document & { _id: string }>("career_records").updateOne({ _id: record.id }, { $set: { documentVersion: 1 } });
    await expect(writer.commit({ ...scope, leaseToken })).rejects.toMatchObject({ statusCode: 409 });
    expect(await mongoCollections(fixture.resource.db).careerDocumentUpdates.countDocuments({ recordId: record.id })).toBe(0);
  });
  it("cancels only an uncommitted matching reservation and prevents a later owner commit", async () => {
    const { record, scope, leaseToken, writer } = await ownerScenario();
    await writer.reserve(scope); await writer.cancel(scope);
    await expect(writer.commit({ ...scope, leaseToken })).rejects.toMatchObject({ statusCode: 409 });
    expect((await fixture.resource.db.collection<import("mongodb").Document & { _id: string }>("career_records").findOne({ _id: record.id }))?.documentReservation).toBeUndefined();
    expect((await document.bootstrap(userId, record.id)).documentVersion).toBe(0);
  });  it("blocks lazy document initialization while the document is reserved", async () => {
    const { record, scope } = await scenario();
    await mongoCollections(fixture.resource.db).careerDocumentSnapshots.deleteMany({ recordId: record.id });
    await mongoCollections(fixture.resource.db).careerRecords.updateOne({ _id: record.id }, { $unset: { documentVersion: "", latestSnapshotId: "", documentSchemaVersion: "" } });
    await reserve(record.id, scope);
    await expect(document.bootstrap(userId, record.id)).rejects.toMatchObject({ statusCode: 409 });
    expect(await mongoCollections(fixture.resource.db).careerDocumentSnapshots.countDocuments({ recordId: record.id })).toBe(0);
  });
  it.each(["reserve", "commit", "cancel", "replay"] as const)("rejects %s after the actor is revoked", async (action) => {
    const localUser = (await new MongoIdentityService(fixture.resource).signup({ email: `revoked-${randomUUID()}@example.com`, password: "correct-horse-battery", displayName: "철회" })).user.id;
    const previousUser = userId;
    userId = localUser;
    let owner: Awaited<ReturnType<typeof ownerScenario>>;
    try { owner = await ownerScenario(); } finally { userId = previousUser; }
    if (action !== "reserve") await owner.writer.reserve(owner.scope);
    if (action === "replay") await owner.writer.commit({ ...owner.scope, leaseToken: owner.leaseToken });
    await mongoCollections(fixture.resource.db).users.updateOne({ _id: localUser }, { $set: { deletionRequestedAt: new Date() } });
    const request = action === "commit" || action === "replay" ? owner.writer.commit({ ...owner.scope, leaseToken: owner.leaseToken }) : owner.writer[action](owner.scope);
    await expect(request).rejects.toMatchObject({ statusCode: 401 });
  });
  async function interviewOwnerScenario() {
    const { record } = await scenario();
    const db = mongoCollections(fixture.resource.db);
    const sessionId = randomUUID(); const questionId = randomUUID(); const answerId = randomUUID(); const operationId = randomUUID();
    const now = new Date(); const input = { inputType: "text" as const, transcript: "준비된 인터뷰 원문" };
    const requestHash = createHash("sha256").update(JSON.stringify({ kind: "answer", sessionId, questionId, input })).digest("hex");
    await db.interviewSessions.insertOne({ _id: sessionId, userId, brewId: randomUUID(), status: "open", questionCount: 1, currentOrder: 0, answeredCount: 0, version: 1, createdAt: now, updatedAt: now });
    await db.questions.insertOne({ _id: questionId, userId, interviewSessionId: sessionId, orderNo: 0, text: "경험", active: true, skipped: false, variant: 0, basis: {}, createdAt: now });
    await db.answers.insertOne({ _id: answerId, userId, questionId, ...input, createdRecordId: record.id, inputIdempotencyKey: operationId, requestHash, version: 1, writerPending: true, writerOperationId: operationId, updatedAt: now });
    const frozen = createCareerProducerIntent({ producer: "interview", userId, sourceId: operationId, operationId,
      business: { kind: "patch", recordId: record.id, expectedVersion: 1, expectedCategoryVersion: 1, patches: [{ title: "준비된 제목" }] },
      document: { kind: "markdown", recordId: record.id, expectedVersion: 0, markdown: input.transcript, summary: "인터뷰" } });
    const leaseToken = randomUUID();
    const businessResult = { data: { id: record.id, userId, categoryId: record.categoryId, title: "준비된 제목", status: "draft" as const, propertyValues: [], version: 2, updatedAt: now.toISOString() }, replayed: false };
    const intent = { ...frozen, state: "running" as const, leaseToken, leaseUntil: new Date(Date.now() + 60_000).toISOString(), businessResult };
    await db.careerRecords.updateOne({ _id: record.id }, { $set: { version: 2, title: "준비된 제목" } });
    await db.interviewCareerOperations.insertOne({ _id: operationId, userId, sessionId, questionId, answerId, recordId: record.id, expectedAnswerVersion: 0, answerVersion: 1, inputIdempotencyKey: operationId, requestHash, kind: "answer", input, active: true, result: null, writerIntegration: intent, createdAt: now, updatedAt: now });
    return { record, intent, scope: { producer: "interview" as const, userId, sourceId: operationId, operationId, fingerprint: intent.fingerprint }, leaseToken, sessionId, questionId, answerId, writer: new PreparedCareerDocumentWriter(fixture.resource) };
  }
  it.each(["version", "pending", "transcript", "inputType", "record", "requestHash", "question", "session", "ledger"] as const)("rejects stale Interview %s after business commit before document commit", async (change) => {
    const owner = await interviewOwnerScenario(); const db = mongoCollections(fixture.resource.db);
    await owner.writer.reserve(owner.scope);
    if (change === "version") await db.answers.updateOne({ _id: owner.answerId }, { $inc: { version: 1 } });
    if (change === "pending") await db.answers.updateOne({ _id: owner.answerId }, { $set: { writerPending: false } });
    if (change === "transcript") await db.answers.updateOne({ _id: owner.answerId }, { $set: { transcript: "새 원문" } });
    if (change === "inputType") await db.answers.updateOne({ _id: owner.answerId }, { $set: { inputType: "voice" } });
    if (change === "record") await db.answers.updateOne({ _id: owner.answerId }, { $set: { createdRecordId: randomUUID() } });
    if (change === "requestHash") await db.answers.updateOne({ _id: owner.answerId }, { $set: { requestHash: "b".repeat(64) } });
    if (change === "question") await db.questions.updateOne({ _id: owner.questionId }, { $set: { active: false } });
    if (change === "session") await db.interviewSessions.deleteOne({ _id: owner.sessionId });
    if (change === "ledger") await db.interviewCareerOperations.updateOne({ _id: owner.scope.sourceId }, { $set: { requestHash: "b".repeat(64) } });
    await expect(owner.writer.commit({ ...owner.scope, leaseToken: owner.leaseToken })).rejects.toMatchObject({ statusCode: 409 });
    const source = await db.interviewCareerOperations.findOne({ _id: owner.scope.sourceId });
    expect(source?.writerIntegration.documentResult).toBeNull(); expect(source?.writerIntegration.businessResult).toEqual(owner.intent.businessResult);
    expect((await document.bootstrap(userId, owner.record.id)).documentVersion).toBe(0);
    expect(await db.careerDocumentUpdates.countDocuments({ recordId: owner.record.id })).toBe(0);
  });
  it("replays the committed Interview document receipt after the source changes", async () => {
    const owner = await interviewOwnerScenario();
    const receipt = await owner.writer.commit({ ...owner.scope, leaseToken: owner.leaseToken });
    await mongoCollections(fixture.resource.db).answers.updateOne({ _id: owner.answerId }, { $inc: { version: 1 }, $set: { transcript: "새 원문", writerPending: false } });
    expect(await owner.writer.commit({ ...owner.scope, leaseToken: owner.leaseToken })).toEqual(receipt);
    expect(await mongoCollections(fixture.resource.db).careerDocumentUpdates.countDocuments({ recordId: owner.record.id })).toBe(1);
  });
});
