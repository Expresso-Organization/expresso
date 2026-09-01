import { createHash } from "node:crypto";

import type {
  CareerDocumentSnapshotDoc,
  CareerDocumentUpdateDoc,
  CareerRecordDoc,
  CareerRecordRevisionDoc,
} from "@expresso/database";
import { mongoCollections } from "@expresso/database";
import { Binary, type ClientSession } from "mongodb";

import type { MongoContext } from "../../platform/mongodb.js";

export interface CareerDocumentRepository {
  record(userId: string, recordId: string, session?: ClientSession): Promise<CareerRecordDoc | null>;
  recordById(recordId: string, session?: ClientSession): Promise<CareerRecordDoc | null>;
  snapshot(recordId: string, session?: ClientSession): Promise<CareerDocumentSnapshotDoc | null>;
  snapshotById(userId: string, recordId: string, snapshotId: string, session?: ClientSession): Promise<CareerDocumentSnapshotDoc | null>;
  updates(recordId: string, afterSequence?: number, session?: ClientSession): Promise<CareerDocumentUpdateDoc[]>;
  byClient(recordId: string, clientId: string, clientSequence: number, session?: ClientSession): Promise<CareerDocumentUpdateDoc | null>;
  insertSnapshot(row: CareerDocumentSnapshotDoc, session?: ClientSession): Promise<void>;
  insertUpdate(row: CareerDocumentUpdateDoc, session?: ClientSession): Promise<void>;
  markCompacted(recordId: string, through: number, session?: ClientSession): Promise<void>;
  initializeDocument(recordId: string, userId: string, snapshotId: string, session?: ClientSession): Promise<boolean>;
  bumpDocumentVersion(recordId: string, userId: string, expected: number, latestSnapshotId?: string, session?: ClientSession): Promise<number | null>;
  setLatestSnapshot(recordId: string, userId: string, expectedVersion: number, snapshotId: string, session?: ClientSession): Promise<boolean>;
  revisions(userId: string, recordId: string, session?: ClientSession): Promise<CareerRecordRevisionDoc[]>;
  revision(id: string, userId: string, session?: ClientSession): Promise<CareerRecordRevisionDoc | null>;
  insertRevision(row: CareerRecordRevisionDoc, session?: ClientSession): Promise<void>;
}

export const hashUpdate = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");

export class MongoCareerDocumentRepository implements CareerDocumentRepository {
  constructor(private readonly context: MongoContext) {}
  private collections() { return mongoCollections(this.context.db); }
  private options(session?: ClientSession) { return session ? { session } : {}; }

  record(userId: string, recordId: string, session?: ClientSession) {
    return this.collections().careerRecords.findOne({ _id: recordId, userId, deletedAt: null }, this.options(session));
  }
  recordById(recordId: string, session?: ClientSession) {
    return this.collections().careerRecords.findOne({ _id: recordId, deletedAt: null }, this.options(session));
  }
  snapshot(recordId: string, session?: ClientSession) {
    return this.collections().careerDocumentSnapshots.findOne(
      { recordId },
      { sort: { documentVersion: -1 }, ...this.options(session) },
    );
  }
  snapshotById(userId: string, recordId: string, snapshotId: string, session?: ClientSession) {
    return this.collections().careerDocumentSnapshots.findOne(
      { _id: snapshotId, userId, recordId },
      this.options(session),
    );
  }
  updates(recordId: string, afterSequence = 0, session?: ClientSession) {
    return this.collections().careerDocumentUpdates
      .find({ recordId, serverSequence: { $gt: afterSequence }, compactedAt: null }, this.options(session))
      .sort({ serverSequence: 1 })
      .limit(10_001)
      .toArray();
  }
  byClient(recordId: string, clientId: string, clientSequence: number, session?: ClientSession) {
    return this.collections().careerDocumentUpdates.findOne(
      { recordId, clientId, clientSequence },
      this.options(session),
    );
  }
  async insertSnapshot(row: CareerDocumentSnapshotDoc, session?: ClientSession) {
    await this.collections().careerDocumentSnapshots.insertOne(row, this.options(session));
  }
  async insertUpdate(row: CareerDocumentUpdateDoc, session?: ClientSession) {
    await this.collections().careerDocumentUpdates.insertOne(row, this.options(session));
  }
  async markCompacted(recordId: string, through: number, session?: ClientSession) {
    await this.collections().careerDocumentUpdates.updateMany(
      { recordId, serverSequence: { $lte: through }, compactedAt: null },
      { $set: { compactedAt: new Date() } },
      this.options(session),
    );
  }
  async initializeDocument(recordId: string, userId: string, snapshotId: string, session?: ClientSession) {
    const result = await this.collections().careerRecords.updateOne(
      { _id: recordId, userId, $or: [{ documentVersion: { $exists: false } }, { documentVersion: null }] },
      { $set: { documentVersion: 0, documentSchemaVersion: 1, latestSnapshotId: snapshotId } },
      this.options(session),
    );
    return result.modifiedCount === 1;
  }
  async bumpDocumentVersion(
    recordId: string,
    userId: string,
    expected: number,
    latestSnapshotId?: string,
    session?: ClientSession,
  ) {
    const row = await this.collections().careerRecords.findOneAndUpdate(
      { _id: recordId, userId, documentVersion: expected },
      { $set: { documentVersion: expected + 1, ...(latestSnapshotId ? { latestSnapshotId } : {}) } },
      { returnDocument: "after", ...this.options(session) },
    );
    return row?.documentVersion ?? null;
  }
  async setLatestSnapshot(
    recordId: string,
    userId: string,
    expectedVersion: number,
    snapshotId: string,
    session?: ClientSession,
  ) {
    const result = await this.collections().careerRecords.updateOne(
      { _id: recordId, userId, documentVersion: expectedVersion },
      { $set: { latestSnapshotId: snapshotId } },
      this.options(session),
    );
    return result.matchedCount === 1;
  }
  revisions(userId: string, recordId: string, session?: ClientSession) {
    return this.collections().careerRecordRevisions
      .find({ userId, recordId }, this.options(session))
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();
  }
  revision(id: string, userId: string, session?: ClientSession) {
    return this.collections().careerRecordRevisions.findOne({ _id: id, userId }, this.options(session));
  }
  async insertRevision(row: CareerRecordRevisionDoc, session?: ClientSession) {
    await this.collections().careerRecordRevisions.insertOne(row, this.options(session));
  }
}

export function binaryBytes(value: Binary | Uint8Array): Uint8Array {
  return value instanceof Binary ? new Uint8Array(value.buffer) : value;
}
