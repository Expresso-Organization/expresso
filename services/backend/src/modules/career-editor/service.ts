import { createHmac, randomUUID } from "node:crypto";

import {
  encodeDocumentAsYUpdate,
  encodeDocumentStateVector,
  markdownToCareerDocument,
  parseCareerDocument,
  reconstructYDocument,
} from "@expresso/editor";
import {
  AppendCareerUpdateSchema,
  CareerDocumentBootstrapSchema,
  type AppendCareerUpdate,
  type CareerDocumentBootstrap,
  type CareerRevision,
  type CareerUpdateAck,
} from "@expresso/contracts";
import type { CareerRecordRevisionDoc, JsonValue } from "@expresso/database";
import { Binary } from "mongodb";

import { inTransaction } from "../../platform/mongo-transaction.js";
import type { MongoContext } from "../../platform/mongodb.js";
import { compactDocument } from "./compaction.js";
import { CareerDocumentError } from "./errors.js";
import {
  MongoCareerDocumentRepository,
  binaryBytes,
  hashUpdate,
  type CareerDocumentRepository,
} from "./repository.js";

type CreateRevisionInput = CareerRevision & { userId: string };

export interface CareerDocumentApi {
  bootstrap(userId: string, recordId: string): Promise<CareerDocumentBootstrap>;
  appendUpdate(userId: string, input: AppendCareerUpdate): Promise<CareerUpdateAck>;
  compact(recordId: string, expectedSequence: number): Promise<unknown>;
  createRevision(input: CreateRevisionInput): Promise<CareerRevision>;
  restoreRevision(userId: string, revisionId: string, expectedVersion: number, expectedRecordId?: string): Promise<CareerDocumentBootstrap>;
  listRevisions(userId: string, recordId: string): Promise<CareerRevision[]>;
}

export class CareerDocumentService implements CareerDocumentApi {
  private readonly repository: CareerDocumentRepository;

  constructor(
    private readonly context: MongoContext,
    private readonly signingSecret = "expresso-career-editor-secret",
    repository?: CareerDocumentRepository,
    private readonly enqueueCompaction?: (recordId: string, expectedSequence: number) => Promise<void>,
  ) {
    this.repository = repository ?? new MongoCareerDocumentRepository(context);
  }

  private token(userId: string, recordId: string) {
    const body = `${userId}.${recordId}.${Date.now() + 15 * 60_000}`;
    return `${body}.${createHmac("sha256", this.signingSecret).update(body).digest("hex")}`;
  }

  async bootstrap(userId: string, recordId: string): Promise<CareerDocumentBootstrap> {
    return inTransaction(this.context, async (tx) => {
      const record = await this.repository.record(userId, recordId, tx.session);
      if (!record) throw new CareerDocumentError(404, "career record not found");
      let snapshot = await this.repository.snapshot(recordId, tx.session);
      if (!snapshot) {
        const document = markdownToCareerDocument(record.bodyMd);
        const canonicalUpdate = encodeDocumentAsYUpdate(document);
        const snapshotId = randomUUID();
        if (!await this.repository.initializeDocument(recordId, userId, snapshotId, tx.session)) {
          throw new CareerDocumentError(409, "career document initialization conflicted");
        }
        snapshot = {
          _id: snapshotId,
          userId,
          recordId,
          documentVersion: 0,
          version: 0,
          schemaVersion: 1,
          content: document as unknown as JsonValue,
          stateVector: new Binary(Buffer.from(encodeDocumentStateVector(document))),
          serverSequence: 0,
          checksum: hashUpdate(canonicalUpdate),
          actor: "migration",
          createdAt: new Date(),
        };
        await this.repository.insertSnapshot(snapshot, tx.session);
      }
      const pending = await this.repository.updates(recordId, snapshot.serverSequence, tx.session);
      let document;
      try {
        document = reconstructYDocument([
          encodeDocumentAsYUpdate(parseCareerDocument(snapshot.content)),
          ...pending.map((row) => binaryBytes(row.update)),
        ]);
      } catch {
        throw new CareerDocumentError(422, "invalid document update");
      }
      const documentVersion = record.documentVersion ?? snapshot.documentVersion + pending.length;
      return CareerDocumentBootstrapSchema.parse({
        record: {
          id: record._id,
          categoryId: record.categoryId,
          title: record.title,
          status: record.status,
          origin: record.origin,
          properties: record.properties,
          bodyMd: record.bodyMd,
          version: record.version,
          updatedAt: record.updatedAt.toISOString(),
        },
        document,
        snapshotVersion: snapshot.documentVersion,
        documentVersion,
        stateVectorBase64: Buffer.from(encodeDocumentStateVector(document)).toString("base64"),
        pendingUpdateCount: pending.length,
        sessionToken: this.token(userId, recordId),
      });
    });
  }

  async appendUpdate(userId: string, raw: AppendCareerUpdate): Promise<CareerUpdateAck> {
    const input = AppendCareerUpdateSchema.parse(raw);
    const bytes = Buffer.from(input.updateBase64, "base64");
    if (bytes.length > 1_048_576) throw new CareerDocumentError(413, "document update exceeds 1MB");
    if (hashUpdate(bytes) !== input.checksum) throw new CareerDocumentError(422, "document update checksum mismatch");

    const acknowledgement = await inTransaction(this.context, async (tx) => {
      const record = await this.repository.record(userId, input.recordId, tx.session);
      if (!record) throw new CareerDocumentError(404, "career record not found");
      const duplicate = await this.repository.byClient(input.recordId, input.clientId, input.clientSequence, tx.session);
      if (duplicate) {
        return {
          recordId: input.recordId,
          clientId: input.clientId,
          clientSequence: input.clientSequence,
          serverSequence: duplicate.serverSequence,
          documentVersion: duplicate.serverSequence,
        };
      }
      const currentVersion = record.documentVersion ?? 0;
      if (input.expectedSequence !== undefined && input.expectedSequence !== currentVersion) {
        throw new CareerDocumentError(409, "document sequence is stale");
      }
      const version = await this.repository.bumpDocumentVersion(
        input.recordId, userId, currentVersion, undefined, tx.session,
      );
      if (version === null) throw new CareerDocumentError(409, "document version is stale");
      await this.repository.insertUpdate({
        _id: randomUUID(), recordId: input.recordId, userId, clientId: input.clientId,
        clientSequence: input.clientSequence, serverSequence: version, update: new Binary(bytes),
        byteLength: bytes.length, updateHash: input.checksum, actor: "user",
        receivedAt: new Date(), compactedAt: null,
      }, tx.session);
      return {
        recordId: input.recordId,
        clientId: input.clientId,
        clientSequence: input.clientSequence,
        serverSequence: version,
        documentVersion: version,
      };
    });

    if (this.enqueueCompaction) {
      const pending = await this.repository.updates(input.recordId);
      const byteLength = pending.reduce((total, update) => total + update.byteLength, 0);
      if (pending.length >= 100 || byteLength >= 512 * 1024) {
        await this.enqueueCompaction(input.recordId, acknowledgement.serverSequence);
      }
    }
    return acknowledgement;
  }

  compact(recordId: string, expectedSequence: number) {
    return inTransaction(this.context, (tx) =>
      compactDocument(this.repository, recordId, expectedSequence, tx.session));
  }

  async createRevision(input: CreateRevisionInput): Promise<CareerRevision> {
    const row: CareerRecordRevisionDoc = {
      _id: input.id,
      userId: input.userId,
      recordId: input.recordId,
      actor: input.actor,
      summary: input.summary,
      beforeVersion: input.beforeVersion,
      afterVersion: input.afterVersion,
      snapshotId: input.snapshotId ?? null,
      createdAt: new Date(input.createdAt),
    };
    await this.repository.insertRevision(row);
    return input;
  }

  async listRevisions(userId: string, recordId: string): Promise<CareerRevision[]> {
    return (await this.repository.revisions(userId, recordId)).map((row) => ({
      id: row._id, recordId: row.recordId, actor: row.actor, summary: row.summary,
      beforeVersion: row.beforeVersion, afterVersion: row.afterVersion,
      snapshotId: row.snapshotId ?? null, createdAt: row.createdAt.toISOString(),
    }));
  }

  async restoreRevision(
    userId: string,
    revisionId: string,
    expectedVersion: number,
    expectedRecordId?: string,
  ): Promise<CareerDocumentBootstrap> {
    await inTransaction(this.context, async (tx) => {
      const revision = await this.repository.revision(revisionId, userId, tx.session);
      if (!revision?.snapshotId) throw new CareerDocumentError(404, "career revision not found");
      if (expectedRecordId && revision.recordId !== expectedRecordId) {
        throw new CareerDocumentError(404, "career revision not found");
      }
      const record = await this.repository.record(userId, revision.recordId, tx.session);
      if (!record) throw new CareerDocumentError(404, "career record not found");
      if ((record.documentVersion ?? 0) !== expectedVersion) {
        throw new CareerDocumentError(409, "document version is stale");
      }
      const source = await this.repository.snapshotById(userId, record._id, revision.snapshotId, tx.session);
      if (!source) throw new CareerDocumentError(404, "career revision snapshot not found");
      const document = parseCareerDocument(source.content);
      const newSnapshotId = randomUUID();
      const newVersion = await this.repository.bumpDocumentVersion(
        record._id, userId, expectedVersion, newSnapshotId, tx.session,
      );
      if (newVersion === null) throw new CareerDocumentError(409, "document version is stale");
      const canonicalUpdate = encodeDocumentAsYUpdate(document);
      await this.repository.insertSnapshot({
        _id: newSnapshotId, userId, recordId: record._id, documentVersion: newVersion,
        version: newVersion, schemaVersion: 1, content: document as unknown as JsonValue,
        stateVector: new Binary(Buffer.from(encodeDocumentStateVector(document))),
        serverSequence: newVersion, checksum: hashUpdate(canonicalUpdate), actor: "user", createdAt: new Date(),
      }, tx.session);
      await this.repository.insertRevision({
        _id: randomUUID(), userId, recordId: record._id, actor: "user",
        summary: "리비전 복원", beforeVersion: expectedVersion, afterVersion: newVersion,
        snapshotId: newSnapshotId, createdAt: new Date(),
      }, tx.session);
    });
    const revision = await this.repository.revision(revisionId, userId);
    if (!revision) throw new CareerDocumentError(404, "career revision not found");
    return this.bootstrap(userId, revision.recordId);
  }
}

export { CareerDocumentService as DocumentService };
