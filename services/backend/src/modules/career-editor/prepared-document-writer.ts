import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  CareerProducerCommitRequestSchema, CareerProducerScopeSchema,
  CareerProducerDocumentResultSchema,
  type CareerProducerCommitRequest, type CareerProducerScope, type CareerProducerIntent,
  type CareerProducerDocumentResult,
} from "@expresso/contracts";
import { applyCareerCommands, encodeDocumentAsYUpdate, encodeDocumentStateVector, encodeDocumentUpdatesStateVector, mergeDocumentYUpdates, markdownToCareerDocument, parseCareerDocument, reconstructYDocument, type CareerDocument, type CareerEditCommand } from "@expresso/editor";
import { mongoCollections } from "@expresso/database";
import { Binary, type ClientSession } from "mongodb";
import { inTransaction, type MongoTransaction } from "../../platform/mongo-transaction.js";
import { readCareerSnapshotUpdate } from "../../platform/career-document-snapshot.js";
import type { MongoContext } from "../../platform/mongodb.js";
import { CareerDocumentError } from "./errors.js";
import { requireActiveUser } from "../identity/index.js";
import { careerProducerSource, validateCareerProducerIntent } from "../career/index.js";
import { binaryBytes, hashUpdate, MongoCareerDocumentRepository } from "./repository.js";
import { BLOCKNOTE_SCHEMA_VERSION, blockNoteToCareerDocument, careerDocumentToBlockNote, type CareerBlockNoteBlock } from "@expresso/editor/blocknote";
import { blockNoteMarkdown, blockNoteStateVector, careerDocumentToBlockNoteState, restoreBlockNote, syncBlockNoteDocument } from "./blocknote-document.js";

function sourceCollection(context: MongoContext, scope: CareerProducerScope) {
  return careerProducerSource(context, scope);
}
function scopeFilter(scope: CareerProducerScope) {
  return { _id: scope.sourceId, userId: scope.userId, "writerIntegration.producer": scope.producer, "writerIntegration.userId": scope.userId, "writerIntegration.sourceId": scope.sourceId, "writerIntegration.operationId": scope.operationId, "writerIntegration.fingerprint": scope.fingerprint };
}
function sameScope(stored: unknown, scope: CareerProducerScope) {
  const parsed = CareerProducerScopeSchema.safeParse(stored);
  return parsed.success && Object.entries(scope).every(([key, value]) => parsed.data[key as keyof CareerProducerScope] === value);
}
function blockIds(document: CareerDocument): Set<string> {
  const ids = new Set<string>();
  const visit = (blocks: CareerDocument["content"]) => { for (const block of blocks) { ids.add(block.id); if (block.content) visit(block.content); } };
  visit(document.content); return ids;
}
function touched(command: CareerEditCommand): string[] {
  if (command.type === "insertBlocks") return command.afterBlockId ? [command.afterBlockId] : [];
  if (command.type === "deleteBlocks") return command.blockIds;
  return [command.blockId, ...(command.type === "moveBlock" && command.afterBlockId ? [command.afterBlockId] : [])];
}

/** 손실 있는 호환 투영의 변경분만 적용합니다. 대응이 모호하면 원본 메타데이터를 버리지 않고 중단합니다. */
function nativeContentDelta(original: unknown, before: unknown, after: unknown): unknown {
  if (isDeepStrictEqual(before, after)) return structuredClone(original);
  const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
  const conflict = () => { throw new CareerDocumentError(409, "native document content cannot be preserved for this edit"); };
  if (Array.isArray(original) && typeof before === "string" && typeof after === "string") {
    const inline = (text: string) => text ? [{ type: "text", text, styles: {} }] : [];
    return nativeContentDelta(original, inline(before), inline(after));
  }
  // 표 셀의 호환 값은 인라인 배열이지만 native 셀은 props와 content를 가진 객체입니다.
  if (object(original) && original.type === "tableCell" && Array.isArray(before) && Array.isArray(after)) {
    return { ...structuredClone(original), content: nativeContentDelta(original.content, before, after) };
  }
  if (Array.isArray(before) && Array.isArray(after)) {
    if (!Array.isArray(original)) return conflict();
    const ids = (values: unknown[]) => values.every(value => object(value) && typeof value.id === "string") && new Set(values.map(value => (value as Record<string, unknown>).id)).size === values.length;
    if (ids(before) && ids(after) && ids(original)) {
      const originals = new Map(original.map(value => [(value as Record<string, unknown>).id, value]));
      const previous = new Map(before.map(value => [(value as Record<string, unknown>).id, value]));
      if (originals.size !== previous.size || [...previous.keys()].some(id => !originals.has(id))) return conflict();
      return after.map(value => { const id = (value as Record<string, unknown>).id; return previous.has(id) ? nativeContentDelta(originals.get(id), previous.get(id), value) : structuredClone(value); });
    }
    if (before.length === after.length && original.length === before.length) return after.map((value, index) => nativeContentDelta(original[index], before[index], value));
    if (isDeepStrictEqual(original, before)) return structuredClone(after);
    return conflict();
  }
  if (object(before) && object(after)) {
    if (!object(original)) return conflict();
    if (before.type !== after.type) return isDeepStrictEqual(original, before) ? structuredClone(after) : conflict();
    const result = structuredClone(original);
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (isDeepStrictEqual(before[key], after[key])) continue;
      if (!Object.hasOwn(after, key)) delete result[key];
      else result[key] = nativeContentDelta(original[key], before[key], after[key]);
    }
    return result;
  }
  if (object(before) || object(after) || Array.isArray(before) || Array.isArray(after)) return isDeepStrictEqual(original, before) ? structuredClone(after) : conflict();
  return structuredClone(after);
}

/** 호환 문서에서 실제로 바뀐 필드만 native 원본에 반영합니다. 투영이 표현하지 못한 서식·미디어는 보존합니다. */
function nativeCommandTarget(original: readonly CareerBlockNoteBlock[], before: CareerDocument, after: CareerDocument): CareerBlockNoteBlock[] {
  type Block = CareerDocument["content"][number];
  type Entry = { block: Block; parent?: Block };
  const index = (document: CareerDocument) => {
    const result = new Map<string, Entry>();
    const visit = (blocks: readonly Block[], parent?: Block) => { for (const block of blocks) { result.set(block.id, { block, ...(parent ? { parent } : {}) }); visit(block.content ?? [], block); } };
    visit(document.content); return result;
  };
  const previous = index(before), next = index(after), native = new Map<string, CareerBlockNoteBlock>();
  const visitNative = (blocks: readonly CareerBlockNoteBlock[]) => { for (const block of blocks) { if (block.id) native.set(block.id, block); visitNative(block.children ?? []); } };
  visitNative(original);
  const convert = ({ block, parent }: Entry) => careerDocumentToBlockNote({ schemaVersion: 1, type: "doc", content: block.type === "listItem" && parent ? [{ ...parent, content: [block] }] : [block] }).blocks;
  const target = (converted: CareerBlockNoteBlock): CareerBlockNoteBlock => {
    const prior = converted.id ? previous.get(converted.id) : undefined;
    const current = converted.id ? next.get(converted.id) : undefined;
    const source = converted.id ? native.get(converted.id) : undefined;
    if (source && prior && current && isDeepStrictEqual(prior.block, current.block) && (prior.block.type !== "listItem" || prior.parent?.type === current.parent?.type)) return structuredClone(source);
    let result = structuredClone(converted);
    if (source && prior && current) {
      const oldProjection = convert(prior).find(block => block.id === converted.id)!;
      const newProjection = convert(current).find(block => block.id === converted.id)!;
      const sameType = oldProjection.type === newProjection.type;
      result = { ...structuredClone(source), type: sameType ? source.type : newProjection.type };
      if (sameType) {
        const props = { ...source.props };
        for (const key of new Set([...Object.keys(oldProjection.props ?? {}), ...Object.keys(newProjection.props ?? {})])) {
          if (isDeepStrictEqual(oldProjection.props?.[key], newProjection.props?.[key])) continue;
          if (Object.hasOwn(newProjection.props ?? {}, key)) props[key] = newProjection.props![key]!;
          else delete props[key];
        }
        if (source.props || Object.keys(props).length) result.props = props;
      } else if (newProjection.props) result.props = structuredClone(newProjection.props);
      else delete result.props;
      if (!sameType || !isDeepStrictEqual(oldProjection.content, newProjection.content)) {
        if (newProjection.content !== undefined) result.content = sameType ? nativeContentDelta(source.content, oldProjection.content, newProjection.content) : structuredClone(newProjection.content);
        else delete result.content;
      }
    }
    // 호환 변환기가 문단의 중첩 자식을 생략해도 선택한 자식의 변경은 원래 native 계층에 반영합니다.
    const children = (current?.block.content ?? []).filter(block => !["tableRow", "tableCell", "tableHeader"].includes(block.type));
    if (children.length || source?.children?.length || converted.children?.length) result.children = children.flatMap(block => convert(next.get(block.id)!)).map(target);
    return result;
  };
  return careerDocumentToBlockNote(after).blocks.map(target);
}

/** 준비한 operation만 문서 원장에 반영하며 business 필드는 변경하지 않습니다. */
export class PreparedCareerDocumentWriter {
  constructor(readonly context: MongoContext, private readonly publish?: (recordId: string, base64: string, sequence: number) => void) {}

  private async intent(scope: CareerProducerScope, session: ClientSession): Promise<CareerProducerIntent> {
    const source = await sourceCollection(this.context, scope).findOne(scopeFilter(scope), { session });
    if (!source?.writerIntegration) throw new CareerDocumentError(409, "prepared document scope changed");
    const intent = validateCareerProducerIntent(source.writerIntegration);
    if (scope.producer === "ai-proposal" && intent.document && source.recordId !== intent.document.recordId) throw new CareerDocumentError(409, "prepared document record binding changed");
    return intent;
  }
  private async guardInterviewSource(tx: MongoTransaction, scope: CareerProducerScope, intent: CareerProducerIntent) {
    if (scope.producer !== "interview") return;
    const db = mongoCollections(tx.db); const options = { session: tx.session };
    const source = await db.interviewCareerOperations.findOne(scopeFilter(scope), options);
    const document = intent.document;
    if (!source || source.kind !== "answer" || !source.active || source._id !== scope.operationId
      || document?.kind !== "markdown" || document.recordId !== source.recordId || document.markdown !== source.input.transcript
      || source.answerVersion !== (source.expectedAnswerVersion ?? 0) + 1
      || (source.recordId === null ? intent.business?.kind !== "create" : intent.business?.kind !== "patch" || intent.business.recordId !== source.recordId)) throw new CareerDocumentError(409, "prepared Interview source changed");
    const requestHash = createHash("sha256").update(JSON.stringify({ kind: "answer", sessionId: source.sessionId, questionId: source.questionId, input: source.input })).digest("hex");
    if (requestHash !== source.requestHash) throw new CareerDocumentError(409, "prepared Interview payload changed");
    const answerFilter = { _id: source.answerId, userId: scope.userId, questionId: source.questionId, version: source.answerVersion,
      writerPending: true, writerOperationId: source._id, createdRecordId: source.recordId, inputType: source.input.inputType,
      transcript: source.input.transcript, requestHash: source.requestHash, inputIdempotencyKey: source.inputIdempotencyKey };
    const questionFilter = { _id: source.questionId, userId: scope.userId, interviewSessionId: source.sessionId, active: true };
    const sessionFilter = { _id: source.sessionId, userId: scope.userId };
    // 읽은 원문·질문·세션이 commit 사이에 바뀌면 같은 문서의 쓰기 충돌로 재검사합니다.
    const session = await db.interviewSessions.updateOne(sessionFilter, { $inc: { writeVersion: 1 } }, options);
    const question = await db.questions.updateOne(questionFilter, { $inc: { writeVersion: 1 } }, options);
    const answer = await db.answers.updateOne(answerFilter, { $inc: { writeVersion: 1 } }, options);
    if (!session.matchedCount || !question.matchedCount || !answer.matchedCount) throw new CareerDocumentError(409, "prepared Interview answer changed");
  }
  private recordId(intent: CareerProducerIntent): string | null {
    if (!intent.document) return null;
    return intent.document.recordId ?? intent.businessResult?.data.id ?? null;
  }
  private requireLease(intent: CareerProducerIntent, token?: string) {
    if (intent.state !== "running" || !intent.leaseUntil || new Date(intent.leaseUntil).getTime() <= Date.now() || (token !== undefined && intent.leaseToken !== token)) throw new CareerDocumentError(409, "prepared document lease lost");
  }
  private async reserveIn(tx: MongoTransaction, scope: CareerProducerScope, intent: CareerProducerIntent) {
    if (!intent.document || intent.documentResult) return;
    const recordId = this.recordId(intent);
    if (!recordId) return;
    const records = mongoCollections(tx.db).careerRecords;
    const record = await records.findOne({ _id: recordId, userId: scope.userId, deletedAt: null }, { session: tx.session });
    if (!record) throw new CareerDocumentError(404, "career record not found");
    if ((record.documentVersion ?? 0) !== intent.document.expectedVersion) throw new CareerDocumentError(409, "document version is stale");
    if (record.documentReservation && !sameScope(record.documentReservation, scope)) throw new CareerDocumentError(409, "document is reserved by another prepared writer");
    const changed = await records.updateOne({ _id: recordId, userId: scope.userId, deletedAt: null, ...(record.documentReservation ? { documentReservation: record.documentReservation } : { documentReservation: { $exists: false } }) }, { $set: { documentReservation: scope } }, { session: tx.session });
    if (!changed.matchedCount) throw new CareerDocumentError(409, "document reservation changed");
  }
  async reserve(raw: CareerProducerScope): Promise<void> {
    const scope = CareerProducerScopeSchema.parse(raw);
    await inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, scope.userId);
      const intent = await this.intent(scope, tx.session);
      if (intent.documentResult || !intent.document) return;
      this.requireLease(intent);
      await this.guardInterviewSource(tx, scope, intent);
      await this.reserveIn(tx, scope, intent);
      const held = await sourceCollection(tx, scope).updateOne({ ...scopeFilter(scope), "writerIntegration.state": "running", "writerIntegration.leaseToken": intent.leaseToken, "writerIntegration.leaseUntil": { $gt: new Date().toISOString() } }, { $set: { "writerIntegration.updatedAt": new Date().toISOString() } }, { session: tx.session });
      if (!held.matchedCount) throw new CareerDocumentError(409, "prepared document lease lost");
    });
  }
  async commit(raw: CareerProducerCommitRequest): Promise<CareerProducerDocumentResult> {
    const request = CareerProducerCommitRequestSchema.parse(raw);
    const { leaseToken: _leaseToken, ...scopeInput } = request;
    const scope = CareerProducerScopeSchema.parse(scopeInput);
    let published: { recordId: string; bytes: Uint8Array; version: number } | undefined;
    const result = await inTransaction(this.context, async (tx) => {
      published = undefined;
      await requireActiveUser(tx, scope.userId);
      const intent = await this.intent(scope, tx.session);
      if (intent.documentResult) return CareerProducerDocumentResultSchema.parse(intent.documentResult);
      this.requireLease(intent, request.leaseToken);
      if (!intent.document || (intent.business && !intent.businessResult)) throw new CareerDocumentError(409, "prepared document owner is not ready");
      const recordId = this.recordId(intent);
      if (!recordId) throw new CareerDocumentError(409, "created record receipt is missing");
      if (intent.businessResult && intent.businessResult.data.userId !== scope.userId) throw new CareerDocumentError(409, "created record owner changed");
      await this.guardInterviewSource(tx, scope, intent);
      await this.reserveIn(tx, scope, intent);
      const repository = new MongoCareerDocumentRepository(tx);
      const record = await repository.record(scope.userId, recordId, tx.session);
      if (!record) throw new CareerDocumentError(404, "career record not found");
      let snapshot = await repository.snapshot(recordId, tx.session);
      if (!snapshot) {
        const initial = careerDocumentToBlockNoteState(markdownToCareerDocument(record.bodyMd));
        const initialId = randomUUID();
        if (!await repository.initializeDocument(recordId, scope.userId, initialId, tx.session)) throw new CareerDocumentError(409, "document initialization conflicted");
        snapshot = { _id: initialId, userId: scope.userId, recordId, documentVersion: 0, version: 0, schemaVersion: BLOCKNOTE_SCHEMA_VERSION, content: initial.blocks as never, state: new Binary(Buffer.from(initial.state)), stateVector: new Binary(Buffer.from(blockNoteStateVector(initial.state))), serverSequence: 0, checksum: hashUpdate(initial.state), actor: "migration", createdAt: new Date() };
        await repository.insertSnapshot(snapshot, tx.session);
        await repository.markBlockNote(recordId, scope.userId, tx.session);
      }
      const updates = await repository.updates(recordId, snapshot.serverSequence, tx.session);
      if (updates.length > 10_000) throw new CareerDocumentError(503, "document compaction required");
      // 본문과 Undo 기준은 공개 bootstrap과 같은 최신 스냅샷·pending update 정책으로 읽습니다.
      const blockNote = snapshot.schemaVersion === BLOCKNOTE_SCHEMA_VERSION && snapshot.state !== undefined;
      const restored = blockNote ? restoreBlockNote(binaryBytes(snapshot.state!), updates.map(update => binaryBytes(update.update))) : null;
      const beforeState = restored?.state ?? mergeDocumentYUpdates([readCareerSnapshotUpdate(snapshot), ...updates.map((update) => binaryBytes(update.update))]);
      const before = restored ? blockNoteToCareerDocument(restored.blocks) : reconstructYDocument([beforeState]);
      // JSON 스냅샷 재인코딩은 원래 CRDT item을 잃으므로 압축된 update도 원장에서 이어 붙입니다.
      const collections = mongoCollections(tx.db);
      const priorUpdates: Uint8Array[] = [];
      if (!blockNote) {
      const causalBase = await collections.careerDocumentSnapshots.findOne(
        { recordId, userId: scope.userId, serverSequence: 0 },
        { sort: { createdAt: 1 }, session: tx.session },
      );
      if (!causalBase) throw new CareerDocumentError(409, "document causal base snapshot is missing");
      priorUpdates.push(readCareerSnapshotUpdate(causalBase));
      const history = collections.careerDocumentUpdates.find(
        { recordId, userId: scope.userId, serverSequence: { $gt: 0, $lte: record.documentVersion ?? 0 } },
        { session: tx.session },
      ).sort({ serverSequence: 1 });
      for await (const update of history) priorUpdates.push(binaryBytes(update.update));
      // 과거 압축 JSON으로 접속한 클라이언트의 증분 update도 원래 기준 item을 찾아야 합니다.
      const snapshotHistory = collections.careerDocumentSnapshots.find(
        { recordId, userId: scope.userId, serverSequence: { $lte: record.documentVersion ?? 0 } },
        { session: tx.session },
      ).sort({ serverSequence: 1, createdAt: 1 });
      for await (const historicalSnapshot of snapshotHistory) priorUpdates.push(readCareerSnapshotUpdate(historicalSnapshot), encodeDocumentAsYUpdate(parseCareerDocument(historicalSnapshot.content)));
      }
      let after: CareerDocument;
      let nativeAfter: CareerBlockNoteBlock[] | undefined;
      if (intent.document.kind === "commands") {
        const known = blockIds(before); const allowed = new Set(intent.document.allowedBlockIds);
        for (const command of intent.document.commands) for (const id of touched(command)) {
          if (!known.has(id)) throw new CareerDocumentError(409, "prepared document block disappeared");
          if (!allowed.has(id)) throw new CareerDocumentError(403, "prepared document edits outside selection");
        }
        try { after = applyCareerCommands(before, intent.document.commands); }
        catch { throw new CareerDocumentError(409, "prepared document commands conflict"); }
        if (restored) nativeAfter = nativeCommandTarget(restored.blocks, before, after);
      } else if (intent.document.kind === "markdown") after = markdownToCareerDocument(intent.document.markdown);
      else {
        const revision = await repository.revision(intent.document.revisionId, scope.userId, tx.session);
        if (!revision || revision.recordId !== recordId || revision.snapshotId !== intent.document.snapshotId || revision.afterVersion !== intent.document.expectedVersion) throw new CareerDocumentError(409, "prepared undo is stale");
        const source = await repository.snapshotById(scope.userId, recordId, intent.document.snapshotId, tx.session);
        if (!source) throw new CareerDocumentError(409, "prepared undo snapshot is missing");
        if (source.schemaVersion === BLOCKNOTE_SCHEMA_VERSION) nativeAfter = source.content as unknown as CareerBlockNoteBlock[];
        after = source.schemaVersion === BLOCKNOTE_SCHEMA_VERSION
          ? blockNoteToCareerDocument(source.content as unknown as import("@expresso/editor/blocknote").CareerBlockNoteBlock[])
          : parseCareerDocument(source.content);
      }
      const beforeSnapshotId = randomUUID(); const afterSnapshotId = randomUUID(); const revisionId = randomUUID();
      const canonicalBefore = encodeDocumentAsYUpdate(before);
      // 늦게 접속한 클라이언트의 JSON bootstrap 기준도 실제 원장과 함께 새 변경의 인과 기준으로 둡니다.
      const blockNoteResult = blockNote ? syncBlockNoteDocument(beforeState, [], nativeAfter ?? careerDocumentToBlockNote(after).blocks) : null;
      const bytes = blockNoteResult?.update ?? encodeDocumentAsYUpdate(after, [...priorUpdates, beforeState, canonicalBefore], `prepared:${scope.producer}:${scope.operationId}`);
      const expected = intent.document.expectedVersion;
      const beforeStorage = restored
        ? { schemaVersion: BLOCKNOTE_SCHEMA_VERSION, content: restored.blocks as never, state: new Binary(Buffer.from(beforeState)), stateVector: new Binary(Buffer.from(blockNoteStateVector(beforeState))), checksum: hashUpdate(beforeState) }
        : { schemaVersion: 1, content: before as never, stateUpdate: new Binary(Buffer.from(beforeState)), stateVector: new Binary(Buffer.from(encodeDocumentUpdatesStateVector([beforeState]))), checksum: hashUpdate(canonicalBefore) };
      await repository.insertSnapshot({ _id: beforeSnapshotId, userId: scope.userId, recordId, documentVersion: expected, version: expected, ...beforeStorage, serverSequence: expected, actor: "ai", createdAt: new Date() }, tx.session);
      const version = await repository.bumpDocumentVersion(recordId, scope.userId, expected, afterSnapshotId, tx.session);
      if (version === null) throw new CareerDocumentError(409, "document version is stale");
      await repository.insertUpdate({ _id: randomUUID(), recordId, userId: scope.userId, clientId: scope.operationId, clientSequence: 1, serverSequence: version, update: new Binary(bytes), byteLength: bytes.byteLength, updateHash: hashUpdate(bytes), actor: "ai", receivedAt: new Date(), compactedAt: null }, tx.session);
      const afterStorage = blockNoteResult
        ? { schemaVersion: BLOCKNOTE_SCHEMA_VERSION, content: blockNoteResult.blocks as never, state: new Binary(Buffer.from(blockNoteResult.state)), stateVector: new Binary(Buffer.from(blockNoteStateVector(blockNoteResult.state))), checksum: hashUpdate(blockNoteResult.state) }
        : { schemaVersion: 1, content: after as never, stateUpdate: new Binary(Buffer.from(bytes)), stateVector: new Binary(Buffer.from(encodeDocumentUpdatesStateVector([bytes]))), checksum: hashUpdate(encodeDocumentAsYUpdate(after)) };
      await repository.insertSnapshot({ _id: afterSnapshotId, userId: scope.userId, recordId, documentVersion: version, version, ...afterStorage, serverSequence: version, actor: "ai", createdAt: new Date() }, tx.session);
      if (blockNoteResult) await repository.setBodyMarkdown(recordId, scope.userId, await blockNoteMarkdown(blockNoteResult.blocks), { session: tx.session });
      await repository.insertRevision({ _id: revisionId, userId: scope.userId, recordId, actor: "ai", summary: intent.document.summary, beforeVersion: expected, afterVersion: version, snapshotId: beforeSnapshotId, ...(scope.producer === "ai-proposal" ? { proposalId: scope.sourceId } : {}), createdAt: new Date() }, tx.session);
      const receipt = CareerProducerDocumentResultSchema.parse({ recordId, documentVersion: version, beforeSnapshotId, afterSnapshotId, revisionId });
      const saved = await sourceCollection(tx, scope).updateOne({ ...scopeFilter(scope), "writerIntegration.state": "running", "writerIntegration.leaseToken": request.leaseToken, "writerIntegration.leaseUntil": { $gt: new Date().toISOString() }, "writerIntegration.documentResult": null }, { $set: { "writerIntegration.documentResult": receipt, "writerIntegration.updatedAt": new Date().toISOString() } }, { session: tx.session });
      if (!saved.matchedCount) throw new CareerDocumentError(409, "prepared document lease lost");
      const released = await mongoCollections(tx.db).careerRecords.updateOne({ _id: recordId, userId: scope.userId, documentReservation: scope }, { $unset: { documentReservation: "" } }, { session: tx.session });
      if (!released.matchedCount) throw new CareerDocumentError(409, "document reservation changed");
      published = { recordId, bytes, version };
      return receipt;
    });
    if (published) this.publish?.(published.recordId, Buffer.from(published.bytes).toString("base64"), published.version);
    return result;
  }
  /** Owner conflict로 종료된 operation의 예약만 같은 transaction에서 해제합니다. */
  async releaseBlocked(raw: CareerProducerScope, tx: MongoTransaction): Promise<void> {
    const scope = CareerProducerScopeSchema.parse(raw);
    await requireActiveUser(tx, scope.userId);
    const intent = await this.intent(scope, tx.session);
    if (intent.state !== "blocked") throw new CareerDocumentError(409, "prepared operation is not blocked");
    const recordId = this.recordId(intent);
    if (!recordId) return;
    await mongoCollections(tx.db).careerRecords.updateOne(
      { _id: recordId, userId: scope.userId, documentReservation: scope },
      { $unset: { documentReservation: "" } }, { session: tx.session },
    );
  }
  async cancel(raw: CareerProducerScope): Promise<void> {
    const scope = CareerProducerScopeSchema.parse(raw);
    if (scope.producer === "interview") throw new CareerDocumentError(409, "prepared Interview cancellation is unsupported");
    await inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, scope.userId);
      const intent = await this.intent(scope, tx.session);
      if (intent.document?.kind === "restore") throw new CareerDocumentError(409, "prepared undo cancellation is unsupported");
      if (intent.businessResult || intent.documentResult || intent.state === "completed") throw new CareerDocumentError(409, "committed prepared document cannot be cancelled");
      const changed = await sourceCollection(tx, scope).updateOne({ ...scopeFilter(scope), "writerIntegration.businessResult": null, "writerIntegration.documentResult": null, "writerIntegration.state": { $in: ["pending", "running", "retry", "blocked", "cancelled"] } }, { $set: { "writerIntegration.state": "cancelled", "writerIntegration.leaseToken": null, "writerIntegration.leaseUntil": null, "writerIntegration.updatedAt": new Date().toISOString() } }, { session: tx.session });
      if (!changed.matchedCount) throw new CareerDocumentError(409, "prepared document cancellation raced owner");
      const recordId = this.recordId(intent);
      if (recordId) await mongoCollections(tx.db).careerRecords.updateOne({ _id: recordId, userId: scope.userId, documentReservation: scope }, { $unset: { documentReservation: "" } }, { session: tx.session });
    });
  }
}
