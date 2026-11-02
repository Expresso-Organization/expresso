import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import {
  encodeDocumentAsYUpdate,
  encodeDocumentStateVector,
  encodeDocumentUpdatesStateVector,
  mergeDocumentYUpdates,
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
  type AgentEditDraft,
  type CreateAiEditProposal,
} from "@expresso/contracts";
import { type CareerDocumentSnapshotDoc, type CareerRecordRevisionDoc, type JsonValue } from "@expresso/database";
import { BLOCKNOTE_SCHEMA_VERSION, blockNoteToCareerDocument, careerDocumentToBlockNote, type CareerBlockNoteBlock } from "@expresso/editor/blocknote";
import { Binary } from "mongodb";

import { inTransaction } from "../../platform/mongo-transaction.js";
import { readCareerSnapshotUpdate } from "../../platform/career-document-snapshot.js";
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
import { blockNoteMarkdown, blockNoteStateVector, careerDocumentToBlockNoteState, restoreBlockNote, syncBlockNoteDocument, type BlockNoteSyncResult } from "./blocknote-document.js";
import type { AiProposalAdapter } from "./ai-adapter.js";
import type { ProductAiProposalIntegration,AiApplyOperationResult,AiUndoOperationResult } from "./product-ai-integration.js";

type CreateRevisionInput = CareerRevision & { userId: string };
type Session = Parameters<CareerDocumentRepository["snapshot"]>[1];
type UpdatePublisher = (recordId: string, updateBase64: string, serverSequence: number) => void;

/** bodyMd를 편집기가 마지막으로 쓴 값인지 가리는 해시입니다. 다르면 편집기 밖에서 바뀐 것입니다. */
const EDIT_REVISION_SUMMARY = "편집";
const EDIT_REVISION_INTERVAL_MS = 10 * 60_000;

export function bodyHash(bodyMd: string): string { return createHash("sha256").update(bodyMd).digest("hex"); }

export interface CareerDocumentApi {
  verifySessionToken(userId: string, recordId: string, token: string): boolean;
  bootstrap(userId: string, recordId: string): Promise<CareerDocumentBootstrap>;
  appendUpdate(userId: string, input: AppendCareerUpdate): Promise<CareerUpdateAck>;
  compact(recordId: string, expectedSequence: number): Promise<unknown>;
  createRevision(input: CreateRevisionInput): Promise<CareerRevision>;
  restoreRevision(userId: string, revisionId: string, expectedVersion: number, expectedRecordId?: string, publish?: UpdatePublisher): Promise<CareerDocumentBootstrap>;
  listRevisions(userId: string, recordId: string): Promise<CareerRevision[]>;
  updatesSince(userId: string, recordId: string, afterSequence: number): Promise<Array<{ serverSequence: number; updateBase64: string; actor: "user" | "ai" | "migration" }>>;
  createPreparedAiProposal(userId: string, recordId: string, input: CreateAiEditProposal, draft: AgentEditDraft): Promise<AiEditProposalDetail>;
  createAiProposal(userId: string, recordId: string, input: CreateAiEditProposal): Promise<AiEditProposalDetail>;
  getAiProposal(userId: string, recordId: string, proposalId: string): Promise<AiEditProposalDetail>;
  applyAiProposal(userId: string, recordId: string, input: unknown): Promise<AiEditProposalDetail>;
  rejectAiProposal(userId: string, recordId: string, input: unknown): Promise<void>;
  cancelAiProposal(userId: string, recordId: string, input: unknown): Promise<void>;
  undoAiProposal(userId: string, recordId: string, input: unknown): Promise<CareerDocumentBootstrap>;
  applyAiProposalOperation?: (userId:string,recordId:string,input:unknown,key?:string)=>Promise<AiApplyOperationResult>;
  undoAiProposalOperation?: (userId:string,recordId:string,input:unknown,key?:string)=>Promise<AiUndoOperationResult>;
  setAiProposalPublisher(publisher: (recordId: string, proposal: AiEditProposalDetail) => void): void;
  setAiUpdatePublisher(publisher: (recordId: string, updateBase64: string, serverSequence: number) => void): void;
}

export class CareerDocumentService implements CareerDocumentApi {
  private readonly repository: CareerDocumentRepository;
  private aiProposals?: AiProposalService;
  private productAi?: ProductAiProposalIntegration;
  private aiPublisher?: (recordId:string,proposal:AiEditProposalDetail)=>void;

  constructor(
    private readonly context: MongoContext,
    private readonly signingSecret = "expresso-career-editor-secret",
    repository?: CareerDocumentRepository,
    private readonly enqueueCompaction?: (recordId: string, expectedSequence: number) => Promise<void>,
    private readonly aiProposalAdapter?: AiProposalAdapter,
    private readonly enqueueProjection?: (userId: string, recordId: string) => Promise<void>,
  ) {
    this.repository = repository ?? new MongoCareerDocumentRepository(context);
  }
  private updatePublisher?: UpdatePublisher;

  private proposalService(adapter?: AiProposalAdapter) { const service=this.aiProposals ??= new AiProposalService(this.context, this, adapter ?? this.aiProposalAdapter);if(this.productAi)service.setProductWriter(this.productAi.reads);return service; }
  setProductAiIntegration(integration:ProductAiProposalIntegration){this.productAi=integration;this.proposalService().setProductWriter(integration.reads);if(this.aiPublisher)integration.setPublisher(this.aiPublisher);}
  setAiProposalPublisher(publisher: (recordId: string, proposal: AiEditProposalDetail) => void) { this.aiPublisher=publisher;this.proposalService().setPublisher(publisher);this.productAi?.setPublisher(publisher); }
  setAiUpdatePublisher(publisher: (recordId: string, updateBase64: string, serverSequence: number) => void) { this.updatePublisher = publisher; this.proposalService().setUpdatePublisher(publisher); }
  async createPreparedAiProposal(userId: string, recordId: string, input: CreateAiEditProposal, draft: AgentEditDraft) {
    // 에이전트가 만든 명령도 기존 제안 검증과 저장 절차를 거칩니다.
    return new AiProposalService(this.context, this, { generate: async () => draft }).create(userId, recordId, input);
  }
  createAiProposal(userId: string, recordId: string, input: CreateAiEditProposal) { return this.proposalService().create(userId, recordId, input); }
  getAiProposal(userId: string, recordId: string, proposalId: string) { return this.proposalService().get(userId, recordId, proposalId); }
  async applyAiProposal(userId: string, recordId: string, input: unknown) { if(!this.productAi)return this.proposalService().apply(userId,recordId,input);const result=await this.productAi.applyOperation(userId,recordId,input);if(result.status!==200)throw new CareerDocumentError(503,"AI operation is pending");return result.body.data;}
  async applyAiProposalOperation(userId:string,recordId:string,input:unknown,key?:string):Promise<AiApplyOperationResult>{return this.productAi?this.productAi.applyOperation(userId,recordId,input,key):{status:200,body:{data:await this.proposalService().apply(userId,recordId,input)}};}
  async rejectAiProposal(userId: string, recordId: string, input: unknown) { if(this.productAi&&await this.productAi.terminate(userId,recordId,input,"rejected"))return;return this.proposalService().reject(userId,recordId,input);}
  async cancelAiProposal(userId: string, recordId: string, input: unknown) { if(this.productAi&&await this.productAi.terminate(userId,recordId,input,"cancelled"))return;return this.proposalService().reject(userId,recordId,input,"cancelled");}
  async undoAiProposal(userId: string, recordId: string, input: unknown) { if(this.productAi)throw new CareerDocumentError(409,"Use the AI owner operation response for Undo");return this.proposalService().undo(userId,recordId,input); }
  async undoAiProposalOperation(userId:string,recordId:string,input:unknown,key?:string):Promise<AiUndoOperationResult>{return this.productAi?this.productAi.undoOperation(userId,recordId,input,key):{status:200,body:await this.proposalService().undo(userId,recordId,input)};}

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
    const published: Array<{ base64: string; sequence: number }> = [];
    return inTransaction(this.context, async (tx) => {
      const record = await this.repository.record(userId, recordId, tx.session);
      if (!record) throw new CareerDocumentError(404, "career record not found");
      let snapshot = await this.repository.snapshot(recordId, tx.session);
      if (!snapshot) {
        if (record.documentReservation) throw new CareerDocumentError(409, "document is reserved by a prepared writer");
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
          stateVector: new Binary(Buffer.from(encodeDocumentUpdatesStateVector([canonicalUpdate]))),
          stateUpdate: new Binary(Buffer.from(canonicalUpdate)),
          serverSequence: 0,
          checksum: hashUpdate(canonicalUpdate),
          actor: "migration",
          createdAt: new Date(),
        };
        await this.repository.insertSnapshot(snapshot, tx.session);
      }
      if (snapshot.schemaVersion !== BLOCKNOTE_SCHEMA_VERSION) snapshot = await this.migrateToBlockNote(record, snapshot, tx.session);
      // 인터뷰 답변처럼 편집기 밖에서 bodyMd가 바뀌었으면 문서를 그 내용으로 맞춥니다.
      if (record.documentBodyHash && record.documentBodyHash !== bodyHash(record.bodyMd)) {
        const target = careerDocumentToBlockNote(markdownToCareerDocument(record.bodyMd)).blocks;
        const applied = await this.appendServerUpdate(userId, recordId, record.documentVersion ?? 0, target, "migration", tx.session);
        await this.repository.setBodyMarkdown?.(recordId, userId, record.bodyMd, { session: tx.session });
        if (applied) published.push(applied);
        const latest = await this.repository.record(userId, recordId, tx.session);
        const latestSnapshot = await this.repository.snapshot(recordId, tx.session);
        if (latest && latestSnapshot) return this.blockNoteBootstrap(userId, latest, latestSnapshot, tx.session);
      }
      return this.blockNoteBootstrap(userId, record, snapshot, tx.session);
    }).finally(() => {
      for (const update of published.splice(0)) this.updatePublisher?.(recordId, update.base64, update.sequence);
    });
  }

  /**
   * 서버가 만든 문서 변경(AI 적용 · 이력 복원 · 외부 bodyMd 반영)을 업데이트 원장에 더합니다.
   * expectedVersion이 현재 문서 버전과 다르면 409입니다. 바뀐 것이 없고 스냅샷도 필요 없으면 null입니다.
   */
  async appendServerUpdate(
    userId: string,
    recordId: string,
    expectedVersion: number,
    target: readonly CareerBlockNoteBlock[],
    actor: "user" | "ai" | "migration",
    session: Session,
    options: { snapshot?: boolean } = {},
  ): Promise<{ base64: string; sequence: number; result: BlockNoteSyncResult; snapshotId: string | null } | null> {
    const record = await this.repository.record(userId, recordId, session);
    if (!record) throw new CareerDocumentError(404, "career record not found");
    if ((record.documentVersion ?? 0) !== expectedVersion) throw new CareerDocumentError(409, "document version is stale");
    const snapshot = await this.repository.snapshot(recordId, session);
    if (!snapshot?.state || snapshot.schemaVersion !== BLOCKNOTE_SCHEMA_VERSION) throw new CareerDocumentError(409, "career document is not a BlockNote document");
    const pending = await this.repository.updates(recordId, snapshot.serverSequence, session);
    const result = syncBlockNoteDocument(binaryBytes(snapshot.state), pending.map((row) => binaryBytes(row.update)), target);
    if (!result.changed && !options.snapshot) return null;
    const snapshotId = options.snapshot ? randomUUID() : null;
    const nextVersion = await this.repository.bumpDocumentVersion(recordId, userId, expectedVersion, snapshotId ?? undefined, session);
    if (nextVersion === null) throw new CareerDocumentError(409, "document version is stale");
    await this.repository.insertUpdate({
      _id: randomUUID(), recordId, userId, clientId: randomUUID(), clientSequence: 1, serverSequence: nextVersion,
      update: new Binary(Buffer.from(result.update)), byteLength: result.update.byteLength, updateHash: hashUpdate(result.update),
      actor, receivedAt: new Date(), compactedAt: null,
    }, session);
    if (snapshotId) {
      await this.repository.insertSnapshot({
        _id: snapshotId, userId, recordId, documentVersion: nextVersion, version: nextVersion,
        schemaVersion: BLOCKNOTE_SCHEMA_VERSION, content: result.blocks as unknown as JsonValue,
        stateVector: new Binary(Buffer.from(blockNoteStateVector(result.state))), state: new Binary(Buffer.from(result.state)),
        serverSequence: nextVersion, checksum: hashUpdate(result.state), actor, createdAt: new Date(),
      }, session);
    }
    this.scheduleBodyProjection(userId, recordId);
    return { base64: Buffer.from(result.update).toString("base64"), sequence: nextVersion, result, snapshotId };
  }

  /**
   * 사용자 편집을 「편집」 이력으로 남깁니다. 마지막 「편집」 이력이 10분 안이면 남기지 않습니다.
   * 이력의 스냅샷은 그 시점의 본문이라, 복원하면 그 시점으로 돌아갑니다.
   */
  async recordEditRevision(userId: string, recordId: string, now = new Date()): Promise<boolean> {
    const last = (await this.repository.revisions(userId, recordId)).find((row) => row.summary === EDIT_REVISION_SUMMARY);
    if (last && now.getTime() - last.createdAt.getTime() < EDIT_REVISION_INTERVAL_MS) return false;
    return inTransaction(this.context, async (tx) => {
      const record = await this.repository.record(userId, recordId, tx.session);
      const snapshot = await this.repository.snapshot(recordId, tx.session);
      if (!record || snapshot?.schemaVersion !== BLOCKNOTE_SCHEMA_VERSION) return false;
      const { snapshotId } = await this.captureBlockNoteSnapshot(userId, recordId, tx.session);
      const version = record.documentVersion ?? 0;
      await this.repository.insertRevision({
        _id: randomUUID(), userId, recordId, actor: "user", summary: EDIT_REVISION_SUMMARY,
        beforeVersion: version, afterVersion: version, snapshotId, createdAt: now,
      }, tx.session);
      return true;
    });
  }

  /** 지금 문서 상태를 v2 스냅샷으로 남깁니다. AI 적용 전 상태처럼 나중에 되돌릴 지점에 씁니다. */
  async captureBlockNoteSnapshot(userId: string, recordId: string, session: Session): Promise<{ snapshotId: string; blocks: CareerBlockNoteBlock[] }> {
    const record = await this.repository.record(userId, recordId, session);
    const snapshot = await this.repository.snapshot(recordId, session);
    if (!record || !snapshot?.state) throw new CareerDocumentError(409, "career document is not a BlockNote document");
    const restored = await this.restoreBlockNoteSnapshot(recordId, snapshot, session);
    const documentVersion = record.documentVersion ?? 0;
    const snapshotId = randomUUID();
    // 현재 상태 전체를 담으므로 최신 스냅샷으로 골라져도 맞습니다. 같은 업데이트를 다시 적용해도 Yjs 결과는 같습니다.
    await this.repository.insertSnapshot({
      _id: snapshotId, userId, recordId, documentVersion, version: documentVersion, schemaVersion: BLOCKNOTE_SCHEMA_VERSION,
      content: restored.blocks as unknown as JsonValue, stateVector: new Binary(Buffer.from(blockNoteStateVector(restored.state))),
      state: new Binary(Buffer.from(restored.state)), serverSequence: restored.pending.at(-1)?.serverSequence ?? snapshot.serverSequence,
      checksum: hashUpdate(restored.state), actor: "user", createdAt: new Date(),
    }, session);
    return { snapshotId, blocks: restored.blocks };
  }


  /** v1 문서를 처음 열 때 BlockNote 스냅샷으로 옮깁니다. 이후 v1 업데이트는 압축 처리해 다시 보내지 않습니다. */
  private async migrateToBlockNote(
    record: { _id: string; userId: string; documentVersion?: number | null },
    snapshot: CareerDocumentSnapshotDoc,
    session: Parameters<CareerDocumentRepository["snapshot"]>[1],
  ): Promise<CareerDocumentSnapshotDoc> {
    const pending = await this.repository.updates(record._id, snapshot.serverSequence, session);
    let source;
    try {
      source = reconstructYDocument([encodeDocumentAsYUpdate(parseCareerDocument(snapshot.content)), ...pending.map((row) => binaryBytes(row.update))]);
    } catch {
      throw new CareerDocumentError(422, "invalid document update");
    }
    const migrated = careerDocumentToBlockNoteState(source);
    const documentVersion = record.documentVersion ?? 0;
    const through = pending.at(-1)?.serverSequence ?? snapshot.serverSequence;
    const next: CareerDocumentSnapshotDoc = {
      _id: randomUUID(), userId: record.userId, recordId: record._id, documentVersion, version: documentVersion,
      schemaVersion: BLOCKNOTE_SCHEMA_VERSION, content: migrated.blocks as unknown as JsonValue,
      stateVector: new Binary(Buffer.from(blockNoteStateVector(migrated.state))), state: new Binary(Buffer.from(migrated.state)),
      serverSequence: through, checksum: hashUpdate(migrated.state), actor: "migration", createdAt: new Date(),
    };
    await this.repository.insertSnapshot(next, session);
    if (!await this.repository.setLatestSnapshot(record._id, record.userId, documentVersion, next._id, session)) {
      throw new CareerDocumentError(409, "career document migration conflicted");
    }
    await this.repository.markCompacted(record._id, through, session);
    // 옛 bodyMd 쓰기 경로(career 모듈)가 BlockNote 기록을 알아보게 표시합니다.
    await this.repository.markBlockNote?.(record._id, record.userId, session);
    // v1 편집기는 bodyMd를 갱신하지 않았으므로 옮기는 자리에서 본문 텍스트를 맞춥니다.
    await this.repository.setBodyMarkdown?.(record._id, record.userId, await blockNoteMarkdown(migrated.blocks), { session });
    return next;
  }

  private async restoreBlockNoteSnapshot(recordId: string, snapshot: CareerDocumentSnapshotDoc, session?: Parameters<CareerDocumentRepository["snapshot"]>[1]) {
    if (!snapshot.state) throw new CareerDocumentError(422, "BlockNote snapshot has no state");
    const pending = await this.repository.updates(recordId, snapshot.serverSequence, session);
    if (pending.length > 10_000) throw new CareerDocumentError(503, "document compaction is required before bootstrap");
    try {
      return { pending, ...restoreBlockNote(binaryBytes(snapshot.state), pending.map((row) => binaryBytes(row.update))) };
    } catch {
      throw new CareerDocumentError(422, "invalid document update");
    }
  }

  private async blockNoteBootstrap(
    userId: string,
    record: NonNullable<Awaited<ReturnType<CareerDocumentRepository["record"]>>>,
    snapshot: CareerDocumentSnapshotDoc,
    session?: Parameters<CareerDocumentRepository["snapshot"]>[1],
  ): Promise<CareerDocumentBootstrap> {
    const restored = await this.restoreBlockNoteSnapshot(record._id, snapshot, session);
    // AI 제안 · 비교 화면 · 에이전트 채팅은 v1 모양 document를 읽습니다. 블록 ID를 그대로 둔 사본입니다.
    const document = blockNoteToCareerDocument(restored.blocks);
    return CareerDocumentBootstrapSchema.parse({
      record: this.productAi ? await this.productAi.reads.mapRecord(record,undefined,session) : {
        id: record._id, categoryId: record.categoryId, title: record.title, status: record.status, origin: record.origin,
        properties: record.properties, bodyMd: record.bodyMd, version: record.version, updatedAt: record.updatedAt.toISOString(),
      },
      document,
      snapshotVersion: snapshot.documentVersion,
      documentVersion: record.documentVersion ?? snapshot.documentVersion + restored.pending.length,
      stateVectorBase64: Buffer.from(blockNoteStateVector(restored.state)).toString("base64"),
      pendingUpdateCount: restored.pending.length,
      sessionToken: this.token(userId, record._id),
      editor: "blocknote",
      stateBase64: Buffer.from(restored.state).toString("base64"),
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
      if ("documentReservation" in record && record.documentReservation != null) throw new CareerDocumentError(409, "document is reserved by a prepared writer");
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

    this.scheduleBodyProjection(userId, input.recordId);
    // 이력은 보조 기능이라 저장 응답을 기다리게 하지 않고, 실패해도 저장을 실패시키지 않습니다.
    void this.recordEditRevision(userId, input.recordId).catch(() => undefined);
    if (this.enqueueCompaction) {
      const pending = await this.repository.updates(input.recordId);
      const byteLength = pending.reduce((total, update) => total + update.byteLength, 0);
      if (pending.length >= 100 || byteLength >= 512 * 1024) {
        await this.enqueueCompaction(input.recordId, acknowledgement.serverSequence);
      }
    }
    return acknowledgement;
  }

  private readonly projectionTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** 본문 저장 뒤 bodyMd를 BlockNote 본문의 Markdown으로 맞춥니다. API는 Worker 작업으로 넘기고, 큐가 없으면 이 프로세스에서 2초 뒤 처리합니다. */
  private scheduleBodyProjection(userId: string, recordId: string) {
    if (this.enqueueProjection) { void this.enqueueProjection(userId, recordId).catch(() => undefined); return; }
    if (!this.repository.setBodyMarkdown) return;
    const previous = this.projectionTimers.get(recordId);
    if (previous) clearTimeout(previous);
    const timer = setTimeout(() => {
      this.projectionTimers.delete(recordId);
      void this.projectBodyMarkdown(userId, recordId).catch(() => undefined);
    }, 2_000);
    timer.unref?.();
    this.projectionTimers.set(recordId, timer);
  }

  async projectBodyMarkdown(userId: string, recordId: string): Promise<string | null> {
    const record = await this.repository.record(userId, recordId);
    const snapshot = await this.repository.snapshot(recordId);
    if (!record || !snapshot || snapshot.schemaVersion !== BLOCKNOTE_SCHEMA_VERSION) return null;
    // 편집기 밖에서 바뀐 bodyMd는 덮지 않습니다. 다음 bootstrap이 문서를 그 내용으로 맞춥니다.
    if (record.documentBodyHash && record.documentBodyHash !== bodyHash(record.bodyMd)) return null;
    const restored = await this.restoreBlockNoteSnapshot(recordId, snapshot);
    const markdown = await blockNoteMarkdown(restored.blocks);
    await this.repository.setBodyMarkdown?.(recordId, userId, markdown, { expectedBodyMd: record.bodyMd });
    return markdown;
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
    publish: UpdatePublisher | undefined = this.updatePublisher,
  ): Promise<CareerDocumentBootstrap> {
    const published: Array<{ base64: string; sequence: number }> = [];
    let restoredRecordId: string | undefined;
    await inTransaction(this.context, async (tx) => {
      const revision = await this.repository.revision(revisionId, userId, tx.session);
      if (!revision?.snapshotId) throw new CareerDocumentError(404, "career revision not found");
      if (expectedRecordId && revision.recordId !== expectedRecordId) {
        throw new CareerDocumentError(404, "career revision not found");
      }
      const record = await this.repository.record(userId, revision.recordId, tx.session);
      if (!record) throw new CareerDocumentError(404, "career record not found");
      if ("documentReservation" in record && record.documentReservation != null) throw new CareerDocumentError(409, "document is reserved by a prepared writer");
      if ((record.documentVersion ?? 0) !== expectedVersion) {
        throw new CareerDocumentError(409, "document version is stale");
      }
      const source = await this.repository.snapshotById(userId, record._id, revision.snapshotId, tx.session);
      if (!source) throw new CareerDocumentError(404, "career revision snapshot not found");
      const latest = await this.repository.snapshot(record._id, tx.session);
      if (latest?.schemaVersion === BLOCKNOTE_SCHEMA_VERSION) {
        // BlockNote 문서는 스냅샷 블록을 목표로 증분 업데이트를 만들어 열린 편집기에도 바로 보냅니다.
        const target = source.schemaVersion === BLOCKNOTE_SCHEMA_VERSION
          ? source.content as unknown as CareerBlockNoteBlock[]
          : careerDocumentToBlockNote(parseCareerDocument(source.content)).blocks;
        const applied = await this.appendServerUpdate(userId, record._id, expectedVersion, target, "user", tx.session, { snapshot: true });
        if (!applied) throw new CareerDocumentError(409, "career revision restore produced no change");
        await this.repository.insertRevision({
          _id: randomUUID(), userId, recordId: record._id, actor: "user",
          summary: "리비전 복원", beforeVersion: expectedVersion, afterVersion: applied.sequence,
          snapshotId: applied.snapshotId, createdAt: new Date(),
        }, tx.session);
        published.push(applied);
        return;
      }
      const document = parseCareerDocument(source.content);
      const updates = await this.repository.updates(record._id, latest?.serverSequence ?? 0, tx.session);
      if (updates.length > 10_000) throw new CareerDocumentError(503, "document compaction is required before restore");
      const priorUpdates = [...(latest ? [readCareerSnapshotUpdate(latest)] : []), ...updates.map(row => binaryBytes(row.update)), readCareerSnapshotUpdate(source)];
      const newSnapshotId = randomUUID();
      const stateUpdate = encodeDocumentAsYUpdate(document, priorUpdates, `restore:${newSnapshotId}`);
      const newVersion = await this.repository.bumpDocumentVersion(
        record._id, userId, expectedVersion, newSnapshotId, tx.session,
      );
      if (newVersion === null) throw new CareerDocumentError(409, "document version is stale");
      const canonicalUpdate = encodeDocumentAsYUpdate(document);
      await this.repository.insertSnapshot({
        _id: newSnapshotId, userId, recordId: record._id, documentVersion: newVersion,
        version: newVersion, schemaVersion: 1, content: document as unknown as JsonValue,
        stateVector: new Binary(Buffer.from(encodeDocumentUpdatesStateVector([stateUpdate]))),
        stateUpdate: new Binary(Buffer.from(stateUpdate)),
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
    restoredRecordId = revision.recordId;
    for (const update of published) publish?.(restoredRecordId, update.base64, update.sequence);
    return this.bootstrap(userId, revision.recordId);
  }
}

export { CareerDocumentService as DocumentService };
