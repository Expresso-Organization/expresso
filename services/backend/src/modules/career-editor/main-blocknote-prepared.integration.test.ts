import { createHash, randomUUID } from "node:crypto";
import { mongoCollections } from "@expresso/database";
import { blockNoteToCareerDocument, type CareerBlockNoteBlock } from "@expresso/editor/blocknote";
import type { CareerEditCommand } from "@expresso/editor";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMongoFixture } from "../../../test/support/mongodb.js";
import { MongoIdentityService } from "../identity/index.js";
import { CareerService } from "../career/service.js";
import { createCareerProducerIntent } from "../career/prepared-producer.js";
import { CareerDocumentService } from "./service.js";
import { PreparedCareerDocumentWriter } from "./prepared-document-writer.js";
import { AiProposalService } from "./ai-proposals.js";
import { CareerProducerCoordinator } from "../career/prepared-producer.js";
import { PreparedCareerProductWrites } from "../career/prepared-product-writes.js";
import { PreparedAiProposalService } from "./prepared-ai-proposals.js";
import { restoreBlockNote, syncBlockNoteDocument } from "./blocknote-document.js";

describe.skipIf(!process.env.TEST_MONGODB_URL)("main BlockNote prepared owner integration", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
  let userId: string;
  beforeAll(async () => {
    fixture = await createMongoFixture("main-blocknote-owner");
    userId = (await new MongoIdentityService(fixture.resource).signup({ email: `bn-${randomUUID()}@example.com`, password: "correct-horse-battery", displayName: "통합" })).user.id;
  }, 60_000);
  afterAll(async () => { await fixture?.dispose(); });

  it.each(["text", "heading-level", "inline-style", "table-cell", "ambiguous-inline"] as const)("preserves rich native blocks and untargeted attributes through prepared %s apply and undo", async (change) => {
    const db = mongoCollections(fixture.resource.db);
    const category = await db.careerCategories.findOne({ userId, key: "experience" });
    const record = (await new CareerService(fixture.resource).createRecord(userId, randomUUID(), { categoryId: category!._id, title: "서식 보존", properties: {}, bodyMd: "" })).record;
    const documents = new CareerDocumentService(fixture.resource);
    const initial = await documents.bootstrap(userId, record.id);
    const selectedId = randomUUID();
    const blocks: CareerBlockNoteBlock[] = [
      { id: randomUUID(), type: "paragraph", props: { textAlignment: "center", textColor: "blue", backgroundColor: "yellow" }, content: [{ type: "text", text: "색과 굵기 보존", styles: { bold: true, textColor: "red", backgroundColor: "green" } }] },
      { id: randomUUID(), type: "video", props: { url: "https://example.com/native-video.mp4", name: "원본 영상", previewWidth: 420, showPreview: true } },
      { id: randomUUID(), type: "callout", props: { icon: "🚀" }, content: [{ type: "text", text: "아이콘 보존", styles: { italic: true, textColor: "purple" } }] },
      change === "table-cell"
        ? { id: selectedId, type: "table", content: { type: "tableContent", columnWidths: [180, 260], headerRows: 1, headerCols: 1, rows: [{ cells: [
          { type: "tableCell", props: { backgroundColor: "yellow", textColor: "red", textAlignment: "right" }, content: [{ type: "text", text: "선택한 셀", styles: { bold: true, textColor: "purple" } }] },
          { type: "tableCell", props: { backgroundColor: "green", textColor: "blue", textAlignment: "center" }, content: [{ type: "text", text: "보존할 셀", styles: { italic: true, textColor: "pink" } }] },
        ] }, { cells: [
          { type: "tableCell", props: { backgroundColor: "orange", textColor: "purple", textAlignment: "center" }, content: [{ type: "text", text: "보존할 행 제목", styles: { underline: true, textColor: "blue" } }] },
          { type: "tableCell", props: { backgroundColor: "pink", textColor: "green", textAlignment: "right" }, content: [{ type: "text", text: "보존할 행 본문", styles: { bold: true, textColor: "red" } }] },
        ] }] } }
        : { id: selectedId, type: change === "heading-level" ? "heading" : "paragraph", props: { textAlignment: "right", textColor: "orange", backgroundColor: "blue", ...(change === "heading-level" ? { level: 1 } : {}) }, content: [{ type: "text", text: "선택한 문단", styles: { bold: true, italic: true, textColor: "pink" } }] },
    ];
    const seed = syncBlockNoteDocument(Buffer.from(initial.stateBase64!, "base64"), [], blocks);
    await documents.appendUpdate(userId, { recordId: record.id, clientId: randomUUID(), clientSequence: 1, expectedSequence: 0, updateBase64: Buffer.from(seed.update).toString("base64"), checksum: createHash("sha256").update(seed.update).digest("hex") });
    await documents.compact(record.id, 1);
    const before = restoreBlockNote(Buffer.from((await documents.bootstrap(userId, record.id)).stateBase64!, "base64")).blocks;
    if (change === "table-cell") expect(before.find(block => block.id === selectedId)?.content).toMatchObject({ columnWidths: [180, 260], headerRows: 1, headerCols: 1 });
    const selected = blockNoteToCareerDocument(before).content.find(block => block.id === selectedId)!;
    const replacement = structuredClone(selected);
    if (change === "heading-level") replacement.type = "heading2";
    if (change === "inline-style") replacement.text = replacement.text!.map(span => ({ ...span, marks: span.marks?.filter(mark => mark.type !== "bold") }));
    if (change === "ambiguous-inline") replacement.text = [{ text: "새 첫 조각", marks: [{ type: "bold" }] }, { text: "새 둘째 조각", marks: [{ type: "italic" }] }];
    if (change === "table-cell") replacement.content![0]!.content![0]!.text![0]!.text = "변경한 셀";
    const command: CareerEditCommand = change === "text" ? { type: "setText", blockId: selectedId, text: "준비된 새 본문" } : { type: "replaceBlock", blockId: selectedId, block: replacement };
    const ai = new AiProposalService(fixture.resource, documents, { async generate() { return { summary: "선택 변경", commands: [command], propertyChanges: [] }; } });
    const proposal = await ai.create(userId, record.id, { selection: { blockIds: [selectedId] }, prompt: "선택 변경" });
    const coordinator = new CareerProducerCoordinator(fixture.resource, { async commit() { throw new Error("document-only changes must not write business fields"); } }, new PreparedCareerDocumentWriter(fixture.resource));
    const producer = new PreparedAiProposalService(fixture.resource, documents, coordinator);
    const scope = await producer.prepare(userId, record.id, { recordId: record.id, proposalId: proposal.proposalId, operationId: randomUUID(), expectedDocumentVersion: 1, commandIndexes: [0], propertyChangeIndexes: [] });
    if (change === "ambiguous-inline") {
      await expect(producer.execute(scope)).rejects.toMatchObject({ statusCode: 409 });
      expect(restoreBlockNote(Buffer.from((await documents.bootstrap(userId, record.id)).stateBase64!, "base64")).blocks).toEqual(before);
      expect(await db.careerRecords.findOne({ _id: record.id })).toMatchObject({ version: record.version, documentVersion: 1 });
      expect(await db.careerDocumentUpdates.countDocuments({ recordId: record.id })).toBe(1);
      expect((await db.careerAiProposals.findOne({ _id: proposal.proposalId }))?.writerIntegration?.documentResult).toBeNull();
      return;
    }
    const applied = await producer.execute(scope);
    expect(applied.documentResult?.documentVersion).toBe(2);
    const after = restoreBlockNote(Buffer.from((await documents.bootstrap(userId, record.id)).stateBase64!, "base64")).blocks;
    expect(JSON.stringify(after.filter(block => block.id !== selectedId))).toBe(JSON.stringify(before.filter(block => block.id !== selectedId)));
    const beforeSelected = before.find(block => block.id === selectedId)!;
    const afterSelected = after.find(block => block.id === selectedId)!;
    expect(afterSelected.props).toEqual({ ...beforeSelected.props, ...(change === "heading-level" ? { level: 2 } : {}) });
    if (change === "heading-level") expect(afterSelected.content).toEqual(beforeSelected.content);
    else if (change === "inline-style") {
      const expected = structuredClone(beforeSelected.content) as Array<{ styles: Record<string, unknown> }>;
      delete expected[0]!.styles.bold;
      expect(afterSelected.content).toEqual(expected);
    } else if (change === "table-cell") {
      const expected = structuredClone(beforeSelected.content) as { rows: Array<{ cells: Array<{ content: Array<{ text: string }> }> }> };
      expected.rows[0]!.cells[0]!.content[0]!.text = "변경한 셀";
      expect(afterSelected.content).toEqual(expected);
    } else expect(blockNoteToCareerDocument([afterSelected]).content[0]?.text?.[0]?.text).toBe("준비된 새 본문");
    const undo = await producer.prepareUndo(userId, record.id, { recordId: record.id, proposalId: proposal.proposalId, operationId: randomUUID(), expectedDocumentVersion: 2 });
    expect((await producer.execute(undo)).documentResult?.documentVersion).toBe(3);
    const undone = restoreBlockNote(Buffer.from((await documents.bootstrap(userId, record.id)).stateBase64!, "base64")).blocks;
    expect(JSON.stringify(undone)).toBe(JSON.stringify(before));
    expect((await db.careerRecords.findOne({ _id: record.id }))?.version).toBe(record.version);
  });

  it("initializes a new prepared document directly as schema 2", async () => {
    const db = mongoCollections(fixture.resource.db);
    const category = await db.careerCategories.findOne({ userId, key: "experience" });
    const record = (await new CareerService(fixture.resource).createRecord(userId, randomUUID(), { categoryId: category!._id, title: "새 본문", properties: {}, bodyMd: "" })).record;
    const owner = new PreparedCareerDocumentWriter(fixture.resource);
    const writes = new PreparedCareerProductWrites(fixture.resource, new CareerProducerCoordinator(fixture.resource, {async commit(){throw new Error("body-only command must not write business fields");}}, owner));
    const scope = await writes.prepare(userId, randomUUID(), "a".repeat(64), null, {kind:"markdown",recordId:record.id,expectedVersion:0,markdown:"새 준비 본문",summary:"생성"}, {kind:"patch",recordId:record.id,expectedBusinessVersion:1});
    await writes.execute(scope);
    const stored = await db.careerRecords.findOne({_id:record.id});
    expect(stored?.documentSchemaVersion).toBe(2);
    expect((await db.careerDocumentSnapshots.findOne({_id:stored!.latestSnapshotId!}))?.schemaVersion).toBe(2);
    expect(stored?.bodyMd).toContain("새 준비 본문");
  });

  it("commits and replays a prepared edit without replacing schema 2 or business fields", async () => {
    const db = mongoCollections(fixture.resource.db);
    const category = await db.careerCategories.findOne({ userId, key: "experience" });
    const career = new CareerService(fixture.resource);
    const record = (await career.createRecord(userId, randomUUID(), { categoryId: category!._id, title: "main 유지", properties: {}, bodyMd: "원문" })).record;
    const documents = new CareerDocumentService(fixture.resource);
    const current = await documents.bootstrap(userId, record.id);
    expect(current.editor).toBe("blocknote");
    const proposal = await new AiProposalService(fixture.resource, documents, { async generate() { return { summary: "통합 변경", commands: [{ type: "setText" as const, blockId: current.document.content[0]!.id, text: "통합 본문" }], propertyChanges: [] }; } }).create(userId, record.id, {selection:{blockIds:[current.document.content[0]!.id]},prompt:"변경"});
    const sourceId = proposal.proposalId;
    const scope = { producer: "ai-proposal" as const, userId, sourceId, operationId: randomUUID() };
    const leaseToken = randomUUID();
    const intent = createCareerProducerIntent({ ...scope, business: null, document: { kind: "commands", recordId: record.id, expectedVersion: current.documentVersion, allowedBlockIds: [current.document.content[0]!.id], commands: [{ type: "setText", blockId: current.document.content[0]!.id, text: "통합 본문" }], summary: "통합 변경" } });
    await db.careerAiProposals.updateOne({_id:sourceId},{$set:{writerIntegration:{ ...intent, state: "running", leaseToken, leaseUntil: new Date(Date.now() + 60_000).toISOString(), attempts: 1, fence: 1 }}});
    const writer = new PreparedCareerDocumentWriter(fixture.resource);
    const request = { ...scope, fingerprint: intent.fingerprint, leaseToken };
    const before = await db.careerRecords.findOne({ _id: record.id });
    const receipt = await writer.commit(request);
    expect(await writer.commit(request)).toEqual(receipt);
    const after = await documents.bootstrap(userId, record.id);
    expect(after.editor).toBe("blocknote");
    expect(after.document.content[0]?.text?.[0]?.text).toBe("통합 본문");
    const stored = await db.careerRecords.findOne({ _id: record.id });
    expect(stored?.version).toBe(before?.version);
    expect(stored?.title).toBe(before?.title);
    expect(stored?.properties).toEqual(before?.properties);
    expect(stored?.documentSchemaVersion).toBe(2);
    await documents.projectBodyMarkdown(userId, record.id);
    expect((await db.careerRecords.findOne({ _id: record.id }))?.bodyMd).toContain("통합 본문");
  });
});
