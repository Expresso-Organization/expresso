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
  async snapshot(recordId: string) { return this.snapshots.filter((row) => row.recordId === recordId).sort((a, b) => b.documentVersion - a.documentVersion)[0] ?? null; }
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
    expect((await service.bootstrap(userId, recordId)).document.content[0]?.type).toBe("heading1");
    expect(repository.snapshots).toHaveLength(1);
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
});
