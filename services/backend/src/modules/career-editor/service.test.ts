import { createHash, randomUUID } from "node:crypto";

import { encodeDocumentAsYUpdate, markdownToCareerDocument } from "@expresso/editor";
import type {
  CareerDocumentSnapshotDoc,
  CareerDocumentUpdateDoc,
  CareerRecordDoc,
  CareerRecordRevisionDoc,
} from "@expresso/database";
import { Binary, type ClientSession } from "mongodb";
import { describe, expect, it, vi } from "vitest";

import { CareerDocumentError } from "./errors.js";
import type { CareerDocumentRepository } from "./repository.js";
import { CareerDocumentService } from "./service.js";
import { restoreBlockNote, syncBlockNoteDocument } from "./blocknote-document.js";

class MemoryRepository implements CareerDocumentRepository {
  recordValue: CareerRecordDoc;
  snapshots: CareerDocumentSnapshotDoc[] = [];
  updateRows: CareerDocumentUpdateDoc[] = [];
  revisionRows: CareerRecordRevisionDoc[] = [];

  constructor(userId: string, recordId: string) {
    this.recordValue = {
      _id: recordId, userId, categoryId: randomUUID(), title: "기록", status: "draft",
      origin: "manual", properties: {}, bodyMd: "# 제목\n\n본문", version: 1,
      documentVersion: null, updatedAt: new Date(), deletedAt: null,
    };
  }
  async record(userId: string, recordId: string) { return this.recordValue.userId === userId && this.recordValue._id === recordId ? this.recordValue : null; }
  async recordById(recordId: string) { return this.recordValue._id === recordId ? this.recordValue : null; }
  async snapshot(recordId: string) { return this.snapshots.filter((row) => row.recordId === recordId).sort((a, b) => b.documentVersion - a.documentVersion || b.schemaVersion - a.schemaVersion)[0] ?? null; }
  async snapshotById(userId: string, recordId: string, snapshotId: string) { return this.snapshots.find((row) => row._id === snapshotId && row.userId === userId && row.recordId === recordId) ?? null; }
  async updates(recordId: string, afterSequence = 0) { return this.updateRows.filter((row) => row.recordId === recordId && row.serverSequence > afterSequence && row.compactedAt === null).sort((a, b) => a.serverSequence - b.serverSequence); }
  async byClient(recordId: string, clientId: string, clientSequence: number) { return this.updateRows.find((row) => row.recordId === recordId && row.clientId === clientId && row.clientSequence === clientSequence) ?? null; }
  async insertSnapshot(row: CareerDocumentSnapshotDoc) { this.snapshots.push(row); }
  async insertUpdate(row: CareerDocumentUpdateDoc) { this.updateRows.push(row); }
  async markCompacted(recordId: string, through: number) { for (const row of this.updateRows) if (row.recordId === recordId && row.serverSequence <= through) row.compactedAt = new Date(); }
  async initializeDocument(recordId: string, userId: string, snapshotId: string) {
    if (recordId !== this.recordValue._id || userId !== this.recordValue.userId || this.recordValue.documentVersion !== null) return false;
    this.recordValue.documentVersion = 0; this.recordValue.latestSnapshotId = snapshotId; return true;
  }
  async bumpDocumentVersion(recordId: string, userId: string, expected: number, latestSnapshotId?: string) {
    if (recordId !== this.recordValue._id || userId !== this.recordValue.userId || this.recordValue.documentVersion !== expected) return null;
    this.recordValue.documentVersion = expected + 1;
    if (latestSnapshotId) this.recordValue.latestSnapshotId = latestSnapshotId;
    return expected + 1;
  }
  async setLatestSnapshot(recordId: string, userId: string, expectedVersion: number, snapshotId: string) {
    if (recordId !== this.recordValue._id || userId !== this.recordValue.userId || this.recordValue.documentVersion !== expectedVersion) return false;
    this.recordValue.latestSnapshotId = snapshotId; return true;
  }
  async revisions(userId: string, recordId: string) { return this.revisionRows.filter((row) => row.userId === userId && row.recordId === recordId); }
  async revision(id: string, userId: string) { return this.revisionRows.find((row) => row._id === id && row.userId === userId) ?? null; }
  async insertRevision(row: CareerRecordRevisionDoc) { this.revisionRows.push(row); }
}

function context() {
  const session = { withTransaction: async (action: () => Promise<unknown>) => action() };
  return { client: { withSession: async (action: (value: typeof session) => Promise<unknown>) => action(session) }, db: {} } as never;
}
function updateInput(recordId: string, clientId = randomUUID(), clientSequence = 1, expectedSequence = 0) {
  const update = encodeDocumentAsYUpdate(markdownToCareerDocument("변경"));
  return {
    recordId, clientId, clientSequence, expectedSequence,
    updateBase64: Buffer.from(update).toString("base64"),
    checksum: createHash("sha256").update(update).digest("hex"),
  };
}

describe("career document service", () => {
  it("creates one migration snapshot and isolates the owner", async () => {
    const userId = randomUUID(); const recordId = randomUUID(); const repository = new MemoryRepository(userId, recordId);
    const service = new CareerDocumentService(context(), "secret-that-is-long-enough", repository);
    const first = await service.bootstrap(userId, recordId);
    expect(first.document.content[0]?.type).toBe("heading1");
    expect(first.editor).toBe("blocknote");
    // 처음 열면 bodyMd를 BlockNote로 읽은 스냅샷 하나만 생기고, 다시 열어도 늘지 않습니다.
    expect(repository.snapshots.map((row) => row.schemaVersion)).toEqual([2]);
    await service.bootstrap(userId, recordId);
    expect(repository.snapshots).toHaveLength(1);
    await expect(service.bootstrap(randomUUID(), recordId)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("acknowledges duplicate updates without incrementing twice and rejects a sequence gap", async () => {
    const userId = randomUUID(); const recordId = randomUUID(); const repository = new MemoryRepository(userId, recordId);
    repository.recordValue.documentVersion = 0;
    const service = new CareerDocumentService(context(), undefined, repository);
    const input = updateInput(recordId);
    expect((await service.appendUpdate(userId, input)).documentVersion).toBe(1);
    expect((await service.appendUpdate(userId, input)).documentVersion).toBe(1);
    expect(repository.updateRows).toHaveLength(1);
    await expect(service.appendUpdate(userId, updateInput(recordId, randomUUID(), 1, 0))).rejects.toMatchObject({ statusCode: 409 });
  });

  it("rejects oversized and checksum-invalid updates before persistence", async () => {
    const userId = randomUUID(); const recordId = randomUUID(); const repository = new MemoryRepository(userId, recordId);
    const service = new CareerDocumentService(context(), undefined, repository);
    const base = updateInput(recordId);
    await expect(service.appendUpdate(userId, { ...base, updateBase64: Buffer.alloc(1_048_577).toString("base64") })).rejects.toBeInstanceOf(CareerDocumentError);
    await expect(service.appendUpdate(userId, { ...base, checksum: "0".repeat(64) })).rejects.toThrow(/checksum/);
  });

  it("enqueues compaction at the configured count threshold", async () => {
    const userId = randomUUID(); const recordId = randomUUID(); const repository = new MemoryRepository(userId, recordId);
    repository.recordValue.documentVersion = 99;
    repository.updateRows = Array.from({ length: 99 }, (_, index) => ({
      _id: randomUUID(), recordId, userId, clientId: randomUUID(), clientSequence: 1,
      serverSequence: index + 1, update: new Binary(), byteLength: 1, updateHash: "a".repeat(64),
      actor: "user", receivedAt: new Date(), compactedAt: null,
    }));
    const enqueue = vi.fn(async () => undefined);
    const service = new CareerDocumentService(context(), undefined, repository, enqueue);
    await service.appendUpdate(userId, updateInput(recordId, randomUUID(), 1, 99));
    expect(enqueue).toHaveBeenCalledWith(recordId, 100);
  });

  it("records an edit revision at most once every ten minutes", async () => {
    const userId = randomUUID(); const recordId = randomUUID(); const repository = new MemoryRepository(userId, recordId);
    const service = new CareerDocumentService(context(), "secret-that-is-long-enough", repository);
    await service.bootstrap(userId, recordId);
    const start = new Date("2026-10-28T00:00:00.000Z");
    expect(await service.recordEditRevision(userId, recordId, 1, start)).toBe(true);
    expect(await service.recordEditRevision(userId, recordId, 1, new Date(start.getTime() + 60_000))).toBe(false);
    expect(await service.recordEditRevision(userId, recordId, 1, new Date(start.getTime() + 11 * 60_000))).toBe(true);
    const edits = repository.revisionRows.filter((row) => row.summary === "편집");
    expect(edits).toHaveLength(2);
    // 이력마다 그 시점 본문을 담은 BlockNote 스냅샷을 가리킵니다.
    for (const edit of edits) expect(repository.snapshots.find((row) => row._id === edit.snapshotId)?.schemaVersion).toBe(2);
  });

  it("편집 이력은 편집을 연 업데이트 직전의 본문을 담는다", async () => {
    // Discord #issue 11-12: 이력이 첫 입력을 반영한 뒤에 찍혀 「저는 ㅅ」처럼 조합 중인 글자로 복원됐다.
    const userId = randomUUID(); const recordId = randomUUID(); const repository = new MemoryRepository(userId, recordId);
    const service = new CareerDocumentService(context(), "secret-that-is-long-enough", repository);
    const boot = await service.bootstrap(userId, recordId);
    const state = Buffer.from(boot.stateBase64!, "base64");
    const blocks = restoreBlockNote(state).blocks;
    const settled = syncBlockNoteDocument(state, [], [{ ...blocks[0]!, content: "끝난 문장" } as never]);
    const typing = syncBlockNoteDocument(state, [settled.update], [{ ...blocks[0]!, content: "끝난 문장 저는 ㅅ" } as never]);
    const clientId = randomUUID();
    const send = async (update: Uint8Array, clientSequence: number, expectedSequence: number) => service.appendUpdate(userId, {
      recordId, clientId, clientSequence, expectedSequence,
      updateBase64: Buffer.from(update).toString("base64"), checksum: createHash("sha256").update(update).digest("hex"),
    });
    const first = await send(settled.update, 1, repository.recordValue.documentVersion ?? 0);
    const second = await send(typing.update, 2, first.documentVersion);
    // 10분 뒤 두 번째 업데이트로 편집을 다시 연 것으로 친다.
    repository.revisionRows.length = 0;
    expect(await service.recordEditRevision(userId, recordId, second.serverSequence, new Date(Date.now() + 11 * 60_000))).toBe(true);
    const edit = repository.revisionRows.find((row) => row.summary === "편집")!;
    const snapshot = repository.snapshots.find((row) => row._id === edit.snapshotId)!;
    expect(JSON.stringify(snapshot.content)).toContain("끝난 문장");
    expect(JSON.stringify(snapshot.content)).not.toContain("저는 ㅅ");
    expect(edit.afterVersion).toBe(second.serverSequence - 1);
    // 지금 본문은 그대로다 — 직전 스냅샷이 최신으로 골라져도 그 뒤 업데이트를 다시 적용한다.
    const reopened = await service.bootstrap(userId, recordId);
    expect(JSON.stringify(reopened)).toContain("저는 ㅅ");
  });
});
