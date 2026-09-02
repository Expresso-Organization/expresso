import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

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
  type AiEditProposalDetail,
  type CreateAiEditProposal,
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
import { AiProposalService } from "./ai-proposals.js";
import type { AiProposalAdapter } from "./ai-adapter.js";

type CreateRevisionInput = CareerRevision & { userId: string };

export interface CareerDocumentApi {
  verifySessionToken(userId: string, recordId: string, token: string): boolean;
  bootstrap(userId: string, recordId: string): Promise<CareerDocumentBootstrap>;
  appendUpdate(userId: string, input: AppendCareerUpdate): Promise<CareerUpdateAck>;
  compact(recordId: string, expectedSequence: number): Promise<unknown>;
  createRevision(input: CreateRevisionInput): Promise<CareerRevision>;
  restoreRevision(userId: string, revisionId: string, expectedVersion: number, expectedRecordId?: string): Promise<CareerDocumentBootstrap>;
  listRevisions(userId: string, recordId: string): Promise<CareerRevision[]>;
  updatesSince(userId: string, recordId: string, afterSequence: number): Promise<Array<{ serverSequence: number; updateBase64: string; actor: "user" | "ai" | "migration" }>>;
  createAiProposal(userId: string, recordId: string, input: CreateAiEditProposal): Promise<AiEditProposalDetail>;
  getAiProposal(userId: string, recordId: string, proposalId: string): Promise<AiEditProposalDetail>;
  applyAiProposal(userId: string, recordId: string, input: unknown): Promise<AiEditProposalDetail>;
  rejectAiProposal(userId: string, recordId: string, input: unknown): Promise<void>;
  cancelAiProposal(userId: string, recordId: string, input: unknown): Promise<void>;
  undoAiProposal(userId: string, recordId: string, input: unknown): Promise<CareerDocumentBootstrap>;
  setAiProposalPublisher(publisher: (recordId: string, proposal: AiEditProposalDetail) => void): void;
  setAiUpdatePublisher(publisher: (recordId: string, updateBase64: string, serverSequence: number) => void): void;
}

export class CareerDocumentService implements CareerDocumentApi {
  private readonly repository: CareerDocumentRepository;
  private aiProposals?: AiProposalService;

  constructor(
    private readonly context: MongoContext,
    private readonly signingSecret = "expresso-career-editor-secret",
    repository?: CareerDocumentRepository,
    private readonly enqueueCompaction?: (recordId: string, expectedSequence: number) => Promise<void>,
    private readonly aiProposalAdapter?: AiProposalAdapter,
  ) {
    this.repository = repository ?? new MongoCareerDocumentRepository(context);
  }

  private proposalService(adapter?: AiProposalAdapter) { return this.aiProposals ??= new AiProposalService(this.context, this, adapter ?? this.aiProposalAdapter); }
  setAiProposalPublisher(publisher: (recordId: string, proposal: AiEditProposalDetail) => void) { this.proposalService().setPublisher(publisher); }
  setAiUpdatePublisher(publisher: (recordId: string, updateBase64: string, serverSequence: number) => void) { this.proposalService().setUpdatePublisher(publisher); }
  createAiProposal(userId: string, recordId: string, input: CreateAiEditProposal) { return this.proposalService().create(userId, recordId, input); }
  getAiProposal(userId: string, recordId: string, proposalId: string) { return this.proposalService().get(userId, recordId, proposalId); }
  applyAiProposal(userId: string, recordId: string, input: unknown) { return this.proposalService().apply(userId, recordId, input); }
  rejectAiProposal(userId: string, recordId: string, input: unknown) { return this.proposalService().reject(userId, recordId, input); }
  cancelAiProposal(userId: string, recordId: string, input: unknown) { return this.proposalService().reject(userId, recordId, input, "cancelled"); }
  undoAiProposal(userId: string, recordId: string, input: unknown) { return this.proposalService().undo(userId, recordId, input); }

  private token(userId: string, recordId: string) {
    const body = `${userId}.${recordId}.${Date.now() + 15 * 60_000}`;
    return `${body}.${createHmac("sha256", this.signingSecret).update(body).digest("hex")}`;
  }

  /** WebSocket 첫 sync에서만 확인하는 짧은 수명 기록 전용 서명이다. */
  verifySessionToken(userId: string, recordId: string, token: string): boolean {
    const parts = token.split(".");
    if (parts.length !== 4 || parts[0] !== userId || parts[1] !== recordId) return false;
    const expiresAt = Number(parts[2]);
    const signature = parts[3];
    if (!Number.isFinite(expiresAt) || expiresAt < Date.now() || !signature) return false;
    const expected = createHmac("sha256", this.signingSecret).update(`${parts[0]}.${parts[1]}.${parts[2]}`).digest("hex");
    return signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
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
      if (pending.length > 10_000) throw new CareerDocumentError(503, "document compaction is required before bootstrap");
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

  async updatesSince(userId: string, recordId: string, afterSequence: number) {
    const record = await this.repository.record(userId, recordId);
    if (!record) throw new CareerDocumentError(404, "career record not found");
    const updates = await this.repository.updates(recordId, afterSequence);
    if (updates.length > 10_000) throw new CareerDocumentError(503, "document compaction is required before synchronization");
    return updates.map((row) => ({
      serverSequence: row.serverSequence,
      updateBase64: Buffer.from(binaryBytes(row.update)).toString("base64"),
      actor: row.actor,
    }));
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
