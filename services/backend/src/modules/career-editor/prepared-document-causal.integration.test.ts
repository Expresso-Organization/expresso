import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { mongoCollections } from "@expresso/database";
import { encodeDocumentAsYUpdate, parseCareerDocument, type CareerDocument } from "@expresso/editor";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMongoFixture } from "../../../test/support/mongodb.js";
import { MongoIdentityService } from "../identity/index.js";
import { CareerService } from "../career/service.js";
import { CareerProducerCoordinator } from "../career/index.js";
import { AiProposalService } from "./ai-proposals.js";
import { CareerDocumentService } from "./service.js";
import { PreparedAiProposalService } from "./prepared-ai-proposals.js";
import { PreparedCareerDocumentWriter } from "./prepared-document-writer.js";

// 편집기 패키지가 사용하는 실제 Yjs로 서로 독립된 클라이언트를 구성합니다.
const editorRequire = createRequire(import.meta.resolve("@expresso/editor"));
const yjsPackage = editorRequire.resolve("yjs/package.json");
const Y = await import(new URL(editorRequire(yjsPackage).module, pathToFileURL(yjsPackage)).href);
const documentMap = "expresso-career-document";
const blockId = "00000000-0000-4000-8000-000000000003";
const applyId = "00000000-0000-4000-8000-000000000002";
const undoId = "00000000-0000-4000-8000-000000000003";

function independentUpdate(base: Uint8Array, clientId: number, content: CareerDocument): Uint8Array {
  const client = new Y.Doc();
  client.clientID = clientId;
  Y.applyUpdate(client, base);
  const vector = Y.encodeStateVector(client);
  client.getMap(documentMap).set("json", JSON.stringify(content));
  return Y.encodeStateAsUpdate(client, vector);
}

describe.skipIf(!(process.env.TEST_MONGODB_ADMIN_URL ?? process.env.TEST_MONGODB_URL))("prepared document causal updates", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
  let userId: string;
  let career: CareerService;
  let documents: CareerDocumentService;
  beforeAll(async () => {
    fixture = await createMongoFixture("documentcausal");
    userId = (await new MongoIdentityService(fixture.resource).signup({ email: `causal-${randomUUID()}@example.com`, password: "correct-horse-battery", displayName: "인과" })).user.id;
    career = new CareerService(fixture.resource);
    documents = new CareerDocumentService(fixture.resource);
  }, 60_000);
  afterAll(async () => fixture?.dispose());

  it.each([
    { label: "bootstrap", concurrent: false, compact: false, lateBootstrap: false, lateEdit: false, restoreBeforeAi: false, repeatCompaction: false },
    { label: "independent concurrent client updates", concurrent: true, compact: false, lateBootstrap: false, lateEdit: false, restoreBeforeAi: false, repeatCompaction: false },
    { label: "compacted concurrent client updates", concurrent: true, compact: true, lateBootstrap: false, lateEdit: false, restoreBeforeAi: false, repeatCompaction: false },
    { label: "a late client bootstrap from the Apply snapshot", concurrent: false, compact: false, lateBootstrap: true, lateEdit: false, restoreBeforeAi: false, repeatCompaction: false },
    { label: "an incremental late-client edit after compaction", concurrent: true, compact: true, lateBootstrap: true, lateEdit: true, restoreBeforeAi: false, repeatCompaction: false },
    { label: "public revision restore without an update row", concurrent: true, compact: true, lateBootstrap: true, lateEdit: false, restoreBeforeAi: true, repeatCompaction: false },
    { label: "two compactions with incremental late-client edits", concurrent: true, compact: true, lateBootstrap: true, lateEdit: true, restoreBeforeAi: false, repeatCompaction: true },
  ])("keeps the live update stream equal to server snapshots through apply and undo after $label", async ({ concurrent, compact, lateBootstrap, lateEdit, restoreBeforeAi, repeatCompaction }) => {
    const category = await career.createCategory(userId, { key: `causal_${randomUUID().replaceAll("-", "")}`, name: "인과", icon: "folder", defaultView: "table", propertySchema: {} });
    const original: CareerDocument = { schemaVersion: 1, type: "doc", content: [{ id: blockId, type: "paragraph", attrs: {}, text: [{ text: "원문" }] }] };
    const record = (await career.createRecord(userId, randomUUID(), { categoryId: category.id, title: "기록", properties: {}, bodyMd: `\`\`\`expresso-block\n${JSON.stringify(original.content[0])}\n\`\`\`` })).record;
    const bootstrap = await documents.bootstrap(userId, record.id);
    const db = mongoCollections(fixture.resource.db);
    const initialSnapshot = await db.careerDocumentSnapshots.findOne({ recordId: record.id, serverSequence: 0 });
    const initialRevision = restoreBeforeAi ? await documents.createRevision({ id: randomUUID(), userId, recordId: record.id, actor: "user", summary: "초기 원문", beforeVersion: 0, afterVersion: 0, snapshotId: initialSnapshot!._id, createdAt: new Date().toISOString() }) : undefined;
    const base = encodeDocumentAsYUpdate(bootstrap.document);
    const live = new Y.Doc();
    Y.applyUpdate(live, base);
    let expectedVersion = 0;
    let expectedBefore = "원문";
    if (concurrent) {
      const first = structuredClone(original); first.content[0]!.text = [{ text: "첫 클라이언트 본문" }];
      const second = structuredClone(original); second.content[0]!.text = [{ text: "둘째 클라이언트 본문" }];
      const firstUpdate = independentUpdate(base, 4_294_967_294, first);
      const secondUpdate = independentUpdate(base, 4_294_967_293, second);
      for (const bytes of [secondUpdate, firstUpdate]) {
        await documents.appendUpdate(userId, { recordId: record.id, clientId: randomUUID(), clientSequence: 1, expectedSequence: expectedVersion, updateBase64: Buffer.from(bytes).toString("base64"), checksum: createHash("sha256").update(bytes).digest("hex") });
        expectedVersion += 1;
        Y.applyUpdate(live, bytes);
      }
      expectedBefore = "첫 클라이언트 본문";
      if (compact) await documents.compact(record.id, expectedVersion);
    }
    const historicalAliases: Uint8Array[] = [];
    if (lateEdit) {
      for (let round = 0; round < (repeatCompaction ? 2 : 1); round += 1) {
        if (round) await documents.compact(record.id, expectedVersion);
        const compactedBootstrap = await documents.bootstrap(userId, record.id);
        const lateBase = encodeDocumentAsYUpdate(compactedBootstrap.document);
        historicalAliases.push(lateBase);
        const lateContent = structuredClone(compactedBootstrap.document);
        expectedBefore = round ? "두 번째 늦은 본문" : "늦은 클라이언트 본문";
        lateContent.content[0]!.text = [{ text: expectedBefore }];
        // 상태 벡터 이후의 delta만 보내므로 압축된 JSON 기준 item이 없으면 이 편집은 pending 상태로 남습니다.
        const delta = independentUpdate(lateBase, 4_294_967_292 - round, lateContent);
        await documents.appendUpdate(userId, { recordId: record.id, clientId: randomUUID(), clientSequence: 1, expectedSequence: expectedVersion, updateBase64: Buffer.from(delta).toString("base64"), checksum: createHash("sha256").update(delta).digest("hex") });
        expectedVersion += 1;
        Y.applyUpdate(live, delta);
      }
    }
    if (restoreBeforeAi) {
      const countBeforeRestore = await db.careerDocumentUpdates.countDocuments({ recordId: record.id });
      const restored = await documents.restoreRevision(userId, initialRevision!.id, expectedVersion, record.id);
      expectedVersion += 1;
      expect(restored.documentVersion).toBe(expectedVersion);
      expect(await db.careerDocumentUpdates.countDocuments({ recordId: record.id })).toBe(countBeforeRestore);
      expectedBefore = "원문";
    }
    expect((await documents.bootstrap(userId, record.id)).document.content[0]?.text?.[0]?.text).toBe(expectedBefore);
    const ai = new AiProposalService(fixture.resource, documents, { async generate() { return { summary: "인과 변경", commands: [{ type: "setText", blockId, text: "AI 본문" }], propertyChanges: [] }; } });
    const proposal = await ai.create(userId, record.id, { selection: { blockIds: [blockId] }, prompt: "변경" });
    const published: Array<{ bytes: Uint8Array; sequence: number }> = [];
    const owner = new PreparedCareerDocumentWriter(fixture.resource, (_recordId, base64, sequence) => published.push({ bytes: Buffer.from(base64, "base64"), sequence }));
    const coordinator = new CareerProducerCoordinator(fixture.resource, { async commit() { throw new Error("body-only operation must not write business fields"); } }, owner);
    const producer = new PreparedAiProposalService(fixture.resource, documents, coordinator);
    const scope = await producer.prepare(userId, record.id, { recordId: record.id, proposalId: proposal.proposalId, operationId: applyId, expectedDocumentVersion: expectedVersion, commandIndexes: [0], propertyChangeIndexes: [] });
    const applied = await producer.execute(scope);
    expect(applied.documentResult?.documentVersion).toBe(expectedVersion + 1);
    expect(published).toHaveLength(1);
    const beforeSnapshot = await db.careerDocumentSnapshots.findOne({ _id: applied.documentResult!.beforeSnapshotId });
    expect(parseCareerDocument(beforeSnapshot?.content).content[0]?.text?.[0]?.text).toBe(expectedBefore);
    Y.applyUpdate(live, published[0]!.bytes);
    const serverAfter = await documents.bootstrap(userId, record.id);
    expect(serverAfter.document.content[0]?.text?.[0]?.text).toBe("AI 본문");
    expect(JSON.parse(live.getMap(documentMap).get("json"))).toEqual(serverAfter.document);

    const late = new Y.Doc();
    if (lateBootstrap) Y.applyUpdate(late, encodeDocumentAsYUpdate(serverAfter.document));
    if (compact) await documents.compact(record.id, expectedVersion + 1);
    const undoScope = await producer.prepareUndo(userId, record.id, { recordId: record.id, proposalId: proposal.proposalId, operationId: undoId, expectedDocumentVersion: expectedVersion + 1 });
    const undone = await producer.execute(undoScope);
    expect(undone.documentResult?.documentVersion).toBe(expectedVersion + 2);
    expect(published).toHaveLength(2);
    Y.applyUpdate(live, published[1]!.bytes);
    const serverUndo = await documents.bootstrap(userId, record.id);
    expect(serverUndo.document.content[0]?.text?.[0]?.text).toBe(expectedBefore);
    expect(JSON.parse(live.getMap(documentMap).get("json"))).toEqual(serverUndo.document);
    for (const alias of historicalAliases) Y.applyUpdate(live, alias);
    expect(JSON.parse(live.getMap(documentMap).get("json"))).toEqual(serverUndo.document);
    if (lateBootstrap) {
      Y.applyUpdate(late, published[1]!.bytes);
      expect(JSON.parse(late.getMap(documentMap).get("json"))).toEqual(serverUndo.document);
    }
    expect(published.map((item) => item.sequence)).toEqual([expectedVersion + 1, expectedVersion + 2]);
    expect(await db.careerDocumentUpdates.countDocuments({ recordId: record.id })).toBe(expectedVersion + 2 - (restoreBeforeAi ? 1 : 0));
    expect(await db.careerRecordRevisions.countDocuments({ recordId: record.id })).toBe(restoreBeforeAi ? 4 : 2);
    expect((await db.careerRecords.findOne({ _id: record.id }))?.version).toBe(record.version);
    expect((await db.careerDocumentSnapshots.findOne({ _id: applied.documentResult!.beforeSnapshotId }))?.content).toEqual(serverUndo.document);
    expect(await producer.execute(undoScope)).toEqual(undone);
    expect(published).toHaveLength(2);
  });
});