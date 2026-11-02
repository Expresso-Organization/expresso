import { createHash, randomUUID } from "node:crypto";

import { defaultCareerCategories, mongoCollections } from "@expresso/database";
import type { CareerBlockNoteBlock } from "@expresso/editor/blocknote";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createMongoFixture } from "../../../test/support/mongodb.js";
import { restoreBlockNote, syncBlockNoteDocument } from "./blocknote-document.js";
import { CareerDocumentService } from "./service.js";

/** 2026-11-02 감사 H4 · H6 · H12 재현 시험입니다. */
describe.skipIf(!(process.env.TEST_MONGODB_ADMIN_URL ?? process.env.TEST_MONGODB_URL))(
  "career document external body · markdown · restore",
  () => {
    let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
    let service: CareerDocumentService;
    const published: Array<{ recordId: string; sequence: number }> = [];
    let userId: string;
    let categoryId: string;

    const createRecord = async (bodyMd: string) => {
      const recordId = randomUUID();
      await mongoCollections(fixture.resource.db).careerRecords.insertOne({
        _id: recordId, userId, categoryId, title: "기록", status: "draft",
        origin: "manual", properties: {}, bodyMd, version: 1, updatedAt: new Date(), deletedAt: null,
      });
      return recordId;
    };
    const blocksOf = async (recordId: string) => {
      const collections = mongoCollections(fixture.resource.db);
      const snapshot = await collections.careerDocumentSnapshots.find({ recordId }).sort({ documentVersion: -1 }).limit(1).next();
      const updates = await collections.careerDocumentUpdates.find({ recordId, serverSequence: { $gt: snapshot!.serverSequence } }).sort({ serverSequence: 1 }).toArray();
      return restoreBlockNote(new Uint8Array(snapshot!.state!.buffer), updates.map((row) => new Uint8Array(row.update.buffer)));
    };
    const textOf = (blocks: readonly CareerBlockNoteBlock[]) => JSON.stringify(blocks);
    /** 편집기에서 문단 하나를 끝에 더한 것과 같은 업데이트를 보냅니다. */
    const appendParagraph = async (recordId: string, text: string, clientSequence: number) => {
      const current = await blocksOf(recordId);
      const target = [...current.blocks, { id: randomUUID(), type: "paragraph", content: [{ type: "text", text, styles: {} }] } as unknown as CareerBlockNoteBlock];
      const collections = mongoCollections(fixture.resource.db);
      const snapshot = await collections.careerDocumentSnapshots.find({ recordId }).sort({ documentVersion: -1 }).limit(1).next();
      const updates = await collections.careerDocumentUpdates.find({ recordId, serverSequence: { $gt: snapshot!.serverSequence } }).sort({ serverSequence: 1 }).toArray();
      const result = syncBlockNoteDocument(new Uint8Array(snapshot!.state!.buffer), updates.map((row) => new Uint8Array(row.update.buffer)), target);
      return service.appendUpdate(userId, {
        recordId, clientId: "00000000-0000-4000-8000-00000000000a", clientSequence,
        updateBase64: Buffer.from(result.update).toString("base64"),
        checksum: createHash("sha256").update(result.update).digest("hex"),
      });
    };

    beforeAll(async () => {
      fixture = await createMongoFixture("career-extbody");
      service = new CareerDocumentService(fixture.resource, "integration-signing-secret");
      service.setAiUpdatePublisher((recordId, _update, sequence) => { published.push({ recordId, sequence }); });
      userId = randomUUID();
      const [category] = defaultCareerCategories(userId, new Date());
      categoryId = category!._id;
      await mongoCollections(fixture.resource.db).careerCategories.insertOne(category!);
    }, 60_000);

    afterAll(async () => { await fixture?.dispose(); });

    it("opens a markdown body without HTML escaping and keeps inline marks and nested lists", async () => {
      const recordId = await createRecord("R&D 예산 <30% 절감, **굵게** 쓴 [링크](https://example.com)\n\n- 상위\n  - 하위\n\n> [evidence:공고 A] 근거 문장");
      await service.bootstrap(userId, recordId);
      const { blocks } = await blocksOf(recordId);
      expect(textOf(blocks)).toContain("R&D 예산 <30% 절감, ");
      expect(textOf(blocks)).not.toContain("&amp;");
      expect(textOf(blocks)).toContain('"bold":true');
      expect((blocks[1] as unknown as { children: unknown[] }).children).toHaveLength(1);
      expect(blocks[2]).toMatchObject({ type: "evidence", props: { source: "공고 A" } });
      const record = await mongoCollections(fixture.resource.db).careerRecords.findOne({ _id: recordId });
      expect(record?.bodyMd).toContain("R&D 예산 <30%");
      expect(record?.bodyMd).toContain("**굵게**");
    }, 30_000);

    it("puts an outside body write into the document, publishes it, and keeps later editor input", async () => {
      const recordId = await createRecord("처음 본문");
      await service.bootstrap(userId, recordId);
      await appendParagraph(recordId, "편집기에서 쓴 문장", 1);
      await mongoCollections(fixture.resource.db).careerRecords.updateOne({ _id: recordId }, { $set: { bodyMd: "인터뷰 재답변 본문" } });

      expect(await service.syncExternalBody(userId, recordId)).toBe(true);
      expect(published.some((item) => item.recordId === recordId)).toBe(true);
      expect(textOf((await blocksOf(recordId)).blocks)).toContain("인터뷰 재답변 본문");

      const revisions = await service.listRevisions(userId, recordId);
      const before = revisions.find((item) => item.summary === "외부 변경 전");
      expect(before?.snapshotId).toBeTruthy();
      const beforeSnapshot = await mongoCollections(fixture.resource.db).careerDocumentSnapshots.findOne({ _id: before!.snapshotId! });
      expect(JSON.stringify(beforeSnapshot?.content)).toContain("편집기에서 쓴 문장");

      // 바깥 쓰기를 문서에 넣은 뒤의 입력은 다음 열기에 덮이지 않습니다.
      await appendParagraph(recordId, "그 뒤에 쓴 문장", 2);
      const reopened = await service.bootstrap(userId, recordId);
      expect(JSON.stringify(reopened.document)).toContain("그 뒤에 쓴 문장");
    }, 30_000);

    it("leaves a before-restore revision so a restore can be undone", async () => {
      const recordId = await createRecord("첫 본문");
      await service.bootstrap(userId, recordId);
      const collections = mongoCollections(fixture.resource.db);
      const first = await collections.careerDocumentSnapshots.findOne({ recordId });
      const initial = await service.createRevision({ id: randomUUID(), userId, recordId, actor: "user", summary: "초기", beforeVersion: 0, afterVersion: 0, snapshotId: first!._id, createdAt: new Date().toISOString() });
      const ack = await appendParagraph(recordId, "복원으로 사라질 문장", 1);
      await service.restoreRevision(userId, initial.id, ack.documentVersion);
      const before = (await service.listRevisions(userId, recordId)).find((item) => item.summary === "복원 전");
      const snapshot = await collections.careerDocumentSnapshots.findOne({ _id: before!.snapshotId! });
      expect(JSON.stringify(snapshot?.content)).toContain("복원으로 사라질 문장");
    }, 30_000);
  },
);
