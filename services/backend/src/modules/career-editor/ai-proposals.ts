import { createHash, randomUUID } from "node:crypto";

import {
  AiEditProposalDetailSchema,
  AiEditProposalSchema,
  AiProposalApplyRequestSchema,
  AiProposalCancelRequestSchema,
  AiProposalRejectRequestSchema,
  AiProposalUndoRequestSchema,
  CareerPropertyValueV2Schema,
  CreateAiEditProposalSchema,
  type AiEditProposal,
  type AiEditProposalDetail,
  type CreateAiEditProposal,
} from "@expresso/contracts";
import { applyCareerCommands, encodeDocumentAsYUpdate, encodeDocumentStateVector, parseCareerDocument, reconstructYDocument, type CareerDocument, type CareerEditCommand } from "@expresso/editor";
import { mongoCollections, type CareerAiProposalDoc } from "@expresso/database";
import { BLOCKNOTE_SCHEMA_VERSION, blockNoteToCareerDocument, careerDocumentToBlockNote, type CareerBlockNoteBlock } from "@expresso/editor/blocknote";
import { Binary } from "mongodb";

import { inTransaction, type MongoTransaction } from "../../platform/mongo-transaction.js";
import type { MongoContext } from "../../platform/mongodb.js";
import { addMongoOutboxEvent } from "../../platform/mongo-outbox.js";
import { restoreBlockNote } from "./blocknote-document.js";
import { CareerDocumentError } from "./errors.js";
import { binaryBytes, hashUpdate, MongoCareerDocumentRepository } from "./repository.js";
import type { CareerDocumentService } from "./service.js";
import type { AiProposalAdapter } from "./ai-adapter.js";
import { DeterministicAiProposalAdapter } from "./ai-adapter.js";

const LIFETIME_MS = 30 * 60_000;
const EMPTY_SESSION_ID = "00000000-0000-0000-0000-000000000000";
type ProposalPublisher = (recordId: string, proposal: AiEditProposalDetail) => void;
type UpdatePublisher = (recordId: string, updateBase64: string, serverSequence: number) => void;

/** 키 순서와 상관없이 같은 값이면 같은 글이 되는 JSON입니다. 명령 적용이 문서를 다시 파싱하면 키 순서가 바뀝니다. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().filter((key) => (value as Record<string, unknown>)[key] !== undefined).map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
  return JSON.stringify(value ?? null);
}
function checksum(document: CareerDocument): string { return createHash("sha256").update(JSON.stringify(document)).digest("hex"); }
function blockMap(blocks: CareerDocument["content"], map = new Map<string, CareerDocument["content"][number]>()) {
  for (const block of blocks) { map.set(block.id, block); if (block.content) blockMap(block.content, map); }
  return map;
}
function definitionMap(category: { propertySchemaV2: readonly { id: string; key: string; type: string; system: boolean; deletedAt: string | null }[] }) {
  const map = new Map<string, { key: string; type: string; system: boolean }>();
  for (const definition of category.propertySchemaV2) if (definition.deletedAt === null) map.set(definition.id, { key: definition.key, type: definition.type, system: definition.system });
  return map;
}
const COMPUTED_PROPERTY_TYPES = new Set(["formula", "rollup", "created_time", "updated_time"]);
/** AI가 바꾸려는 속성 값이 그 속성에 쓸 수 있는 값인지 봅니다. 계산 속성과 종류가 다른 값은 받지 않습니다. */
function assertWritableProperty(definition: { type: string; system: boolean } | undefined, nextValue: unknown) {
  if (!definition || definition.system || COMPUTED_PROPERTY_TYPES.has(definition.type)) throw new CareerDocumentError(409, "AI proposal property is not writable");
  if (nextValue === null) return;
  const parsed = CareerPropertyValueV2Schema.parse(nextValue);
  if (parsed.type !== definition.type) throw new CareerDocumentError(409, "AI proposal property value type does not match");
}

/**
 * 명령을 적용한 v1 사본(after)을 BlockNote 목표로 바꿉니다. 명령이 바꾸지 않은 블록은 지금 BlockNote 블록을 그대로 둡니다.
 * v1을 거치면 글자색 · 정렬 · 블록 색 · 문단 아래 자식 · 토글 내용이 빠지므로, 고르지 않은 블록이 그 손실을 겪지 않게 합니다(2026-11-02 감사 H5).
 * 바뀐 블록도 원래 props와 자식은 이어받습니다.
 */
export function blockNoteTargetForCommands(current: readonly CareerBlockNoteBlock[], before: CareerDocument, after: CareerDocument): CareerBlockNoteBlock[] {
  const beforeBlocks = blockMap(before.content); const afterBlocks = blockMap(after.content);
  const currentById = new Map(current.map((block) => [(block as { id: string }).id, block]));
  return careerDocumentToBlockNote(after).blocks.map((next) => {
    const id = (next as { id: string }).id;
    const existing = currentById.get(id);
    if (!existing) return next;
    if (stableJson(beforeBlocks.get(id)) === stableJson(afterBlocks.get(id))) return existing;
    const kept = existing as unknown as { props?: Record<string, unknown>; children?: unknown[] };
    const changed = next as unknown as { props?: Record<string, unknown>; children?: unknown[] };
    return { ...changed, props: { ...kept.props, ...changed.props }, children: changed.children?.length ? changed.children : kept.children ?? [] } as unknown as CareerBlockNoteBlock;
  });
}
function toDetail(row: CareerAiProposalDoc): AiEditProposalDetail {
  return AiEditProposalDetailSchema.parse({ proposalId: row._id, recordId: row.recordId, baseDocumentVersion: row.baseDocumentVersion, selection: row.selection, summary: row.summary ?? "생성 중", commands: row.commands, propertyChanges: row.propertyChanges, createdAt: row.createdAt.toISOString(), expiresAt: row.expiresAt.toISOString(), status: row.status, progress: row.progress, appliedDocumentVersion: row.appliedDocumentVersion, revisionId: row.revisionId });
}
function changedCommandIds(command: CareerEditCommand): string[] {
  if (command.type === "insertBlocks") return command.afterBlockId ? [command.afterBlockId] : [];
  if (command.type === "deleteBlocks") return [...command.blockIds];
  return command.type === "replaceBlock" || command.type === "setText" || command.type === "moveBlock" ? [command.blockId, ...(command.type === "moveBlock" && command.afterBlockId ? [command.afterBlockId] : [])] : [];
}

/** 문서가 그 버전이었을 때의 v1 블록입니다. 압축된 업데이트도 지우지 않고 남기므로 다시 만들 수 있습니다. 못 만들면 null입니다. */
async function documentAtVersion(tx: MongoTransaction, recordId: string, version: number) {
  const db = mongoCollections(tx.db); const options = { session: tx.session };
  const snapshot = await db.careerDocumentSnapshots.find({ recordId, schemaVersion: BLOCKNOTE_SCHEMA_VERSION, documentVersion: { $lte: version }, state: { $exists: true } }, options).sort({ documentVersion: -1, createdAt: -1 }).limit(1).next();
  if (!snapshot?.state) return null;
  const updates = await db.careerDocumentUpdates.find({ recordId, serverSequence: { $gt: snapshot.serverSequence, $lte: version } }, options).sort({ serverSequence: 1 }).toArray();
  try { return blockMap(blockNoteToCareerDocument(restoreBlockNote(binaryBytes(snapshot.state), updates.map((row) => binaryBytes(row.update))).blocks).content); }
  catch { return null; }
}

export class AiProposalService {
  private publisher?: ProposalPublisher;
  private updatePublisher?: UpdatePublisher;
  private readonly controllers = new Map<string, AbortController>();
  constructor(readonly context: MongoContext, readonly documentService: CareerDocumentService, readonly adapter: AiProposalAdapter = new DeterministicAiProposalAdapter()) {}
  setPublisher(publisher: ProposalPublisher) { this.publisher = publisher; }
  setUpdatePublisher(publisher: UpdatePublisher) { this.updatePublisher = publisher; }
  private publish(row: CareerAiProposalDoc) { this.publisher?.(row.recordId, toDetail(row)); }

  async create(userId: string, recordId: string, raw: CreateAiEditProposal): Promise<AiEditProposalDetail> {
    const input = CreateAiEditProposalSchema.parse(raw);
    const bootstrap = await this.documentService.bootstrap(userId, recordId);
    const blocks = blockMap(bootstrap.document.content);
    if (input.selection.blockIds.some((id) => !blocks.has(id))) throw new CareerDocumentError(409, "selected block no longer exists");
    const now = new Date();
    const row: CareerAiProposalDoc = { _id: randomUUID(), userId, recordId, status: "draft", baseDocumentVersion: bootstrap.documentVersion, selection: { blockIds: [...input.selection.blockIds], ...(input.selection.from === undefined ? {} : { from: input.selection.from }), ...(input.selection.to === undefined ? {} : { to: input.selection.to }) }, prompt: input.prompt, summary: null, commands: [], propertyChanges: [], progress: { phase: "preparing", completed: 0, total: 3 }, beforeSnapshotId: null, afterSnapshotId: null, beforeChecksum: null, afterChecksum: null, revisionId: null, appliedDocumentVersion: null, expiresAt: new Date(now.getTime() + LIFETIME_MS), createdAt: now, updatedAt: now };
    await mongoCollections(this.context.db).careerAiProposals.insertOne(row);
    this.publish(row);
    const streaming = { ...row, status: "streaming" as const, progress: { phase: "generating" as const, completed: 1, total: 3 }, updatedAt: new Date() };
    await mongoCollections(this.context.db).careerAiProposals.updateOne({ _id: row._id, userId, status: "draft" }, { $set: { status: streaming.status, progress: streaming.progress, updatedAt: streaming.updatedAt } });
    this.publish(streaming);
    const markConflicted = async () => {
      const updatedAt = new Date();
      const failed = await mongoCollections(this.context.db).careerAiProposals.findOneAndUpdate({ _id: row._id, userId, status: "streaming" }, { $set: { status: "conflicted", progress: null, updatedAt } }, { returnDocument: "after" });
      if (failed) this.publish(failed);
    };
    const controller = new AbortController(); this.controllers.set(row._id, controller);
    let generated;
    try { generated = await this.adapter.generate({ userId, recordId, documentVersion: bootstrap.documentVersion, selectionBlockIds: input.selection.blockIds, selectedBlocks: input.selection.blockIds.map((id) => blocks.get(id)!), prompt: input.prompt, signal: controller.signal }); }
    catch (error) { if (controller.signal.aborted) return this.get(userId, recordId, row._id); await markConflicted(); throw error; }
    finally { this.controllers.delete(row._id); }
    let proposal: AiEditProposal;
    try {
      proposal = AiEditProposalSchema.parse({ proposalId: row._id, recordId, baseDocumentVersion: bootstrap.documentVersion, selection: row.selection, summary: generated.summary, commands: generated.commands, propertyChanges: generated.propertyChanges, createdAt: now.toISOString(), expiresAt: row.expiresAt.toISOString() });
      await this.validateProposal(bootstrap.document, proposal.commands, input.selection.blockIds);
      await this.validatePropertyChanges(userId, recordId, proposal.propertyChanges);
    } catch (error) { await markConflicted(); throw error; }
    const ready = { ...streaming, status: "ready" as const, summary: proposal.summary, commands: proposal.commands as unknown as CareerAiProposalDoc["commands"], propertyChanges: proposal.propertyChanges as unknown as CareerAiProposalDoc["propertyChanges"], progress: { phase: "validating" as const, completed: 3, total: 3 }, updatedAt: new Date() };
    const transition = await mongoCollections(this.context.db).careerAiProposals.findOneAndUpdate({ _id: row._id, userId, status: "streaming" }, { $set: { status: ready.status, summary: ready.summary, commands: ready.commands, propertyChanges: ready.propertyChanges, progress: ready.progress, updatedAt: ready.updatedAt } }, { returnDocument: "after" });
    if (!transition) return this.get(userId, recordId, row._id);
    this.publish(ready);
    return toDetail(ready);
  }

  async get(userId: string, recordId: string, proposalId: string): Promise<AiEditProposalDetail> {
    const row = await mongoCollections(this.context.db).careerAiProposals.findOne({ _id: proposalId, userId, recordId });
    if (!row) throw new CareerDocumentError(404, "AI proposal not found");
    if (row.expiresAt <= new Date() && ["draft", "streaming", "ready"].includes(row.status)) { await mongoCollections(this.context.db).careerAiProposals.updateOne({ _id: row._id }, { $set: { status: "expired", updatedAt: new Date() } }); row.status = "expired"; }
    return toDetail(row);
  }

  async reject(userId: string, recordId: string, raw: unknown, status: "rejected" | "cancelled" = "rejected"): Promise<void> {
    const input = (status === "cancelled" ? AiProposalCancelRequestSchema : AiProposalRejectRequestSchema).parse(raw);
    if (input.recordId !== recordId) throw new CareerDocumentError(404, "AI proposal not found");
    const db = mongoCollections(this.context.db); const row = await db.careerAiProposals.findOne({ _id: input.proposalId, userId, recordId });
    if (!row) throw new CareerDocumentError(404, "AI proposal not found");
    if (["rejected", "cancelled"].includes(row.status)) return;
    if (row.status !== "ready" && row.status !== "draft" && row.status !== "streaming") throw new CareerDocumentError(409, "AI proposal cannot be cancelled");
    row.status = status; row.progress = null; row.updatedAt = new Date();
    await db.careerAiProposals.updateOne({ _id: row._id, userId }, { $set: { status, progress: null, updatedAt: row.updatedAt } });
    if (status === "cancelled") this.controllers.get(row._id)?.abort();
    this.publish(row);
  }

  async apply(userId: string, recordId: string, raw: unknown): Promise<AiEditProposalDetail> {
    const input = AiProposalApplyRequestSchema.parse(raw);
    if (input.recordId !== recordId) throw new CareerDocumentError(404, "AI proposal not found");
    await this.documentService.bootstrap(userId, recordId);
    let publishRow: CareerAiProposalDoc | undefined;
    let update: { base64: string; sequence: number } | undefined;
    await inTransaction(this.context, async (tx) => {
      const db = mongoCollections(tx.db); const proposal = await db.careerAiProposals.findOne({ _id: input.proposalId, userId, recordId }, { session: tx.session });
      if (!proposal) throw new CareerDocumentError(404, "AI proposal not found");
      if (proposal.status === "applied") { publishRow = proposal; return; }
      if (proposal.status !== "ready" || proposal.expiresAt <= new Date()) throw new CareerDocumentError(409, "AI proposal is unavailable");
      const repository = new MongoCareerDocumentRepository(tx); const record = await repository.record(userId, recordId, tx.session);
      if (!record || (record.documentVersion ?? 0) !== input.expectedDocumentVersion) throw new CareerDocumentError(409, "document version is stale");
      const snapshot = await repository.snapshot(recordId, tx.session); if (!snapshot) throw new CareerDocumentError(409, "career document is not initialized");
      const updates = await repository.updates(recordId, snapshot.serverSequence, tx.session);
      const blockNote = snapshot.schemaVersion === BLOCKNOTE_SCHEMA_VERSION && snapshot.state !== undefined;
      // BlockNote 문서는 v1 모양 사본에 명령을 적용하고, 결과를 블록 단위 Yjs 업데이트로 바꿉니다.
      const currentBlocks = blockNote ? restoreBlockNote(binaryBytes(snapshot.state!), updates.map((update) => binaryBytes(update.update))).blocks : [];
      const before = blockNote
        ? blockNoteToCareerDocument(currentBlocks)
        : reconstructYDocument([encodeDocumentAsYUpdate(parseCareerDocument(snapshot.content)), ...updates.map((update) => binaryBytes(update.update))]);
      const existingBlocks = blockMap(before.content);
      const commands = input.commandIndexes.map((index) => proposal.commands[index] as unknown as CareerEditCommand | undefined).filter((command): command is CareerEditCommand => command !== undefined);
      const changes = input.propertyChangeIndexes.map((index) => proposal.propertyChanges[index] as unknown as { propertyId: string; previousValue: unknown; nextValue: unknown } | undefined).filter((change): change is { propertyId: string; previousValue: unknown; nextValue: unknown } => change !== undefined);
      if (new Set(input.commandIndexes).size !== input.commandIndexes.length || commands.length !== input.commandIndexes.length || new Set(input.propertyChangeIndexes).size !== input.propertyChangeIndexes.length || changes.length !== input.propertyChangeIndexes.length) throw new CareerDocumentError(400, "proposal selection is invalid");
      // 제안 뒤 문서가 바뀌었으면, 명령이 고칠 블록이 없어졌거나 그 블록을 사람이 고친 경우 덮지 않고 충돌로 남깁니다.
      const targetIds = commands.flatMap(changedCommandIds);
      const baseBlocks = input.expectedDocumentVersion === proposal.baseDocumentVersion || !blockNote ? null : await documentAtVersion(tx, recordId, proposal.baseDocumentVersion);
      const editedSinceProposal = baseBlocks !== null && targetIds.some((id) => stableJson(baseBlocks.get(id)) !== stableJson(existingBlocks.get(id)));
      if (input.expectedDocumentVersion !== proposal.baseDocumentVersion && (editedSinceProposal || targetIds.some((id) => !existingBlocks.has(id)))) { proposal.status = "conflicted"; proposal.updatedAt = new Date(); await db.careerAiProposals.updateOne({ _id: proposal._id }, { $set: { status: proposal.status, updatedAt: proposal.updatedAt } }, { session: tx.session }); publishRow = proposal; return; }
      await this.validateProposal(before, commands, proposal.selection.blockIds);
      const after = applyCareerCommands(before, commands);
      let beforeSnapshotId: string; let afterSnapshotId: string; let nextVersion: number;
      const beforeChecksum = checksum(before); const afterChecksum = checksum(after);
      if (blockNote) {
        const captured = await this.documentService.captureBlockNoteSnapshot(userId, recordId, tx.session);
        const applied = await this.documentService.appendServerUpdate(userId, recordId, input.expectedDocumentVersion, blockNoteTargetForCommands(currentBlocks, before, after), "ai", tx.session, { snapshot: true });
        if (!applied?.snapshotId) throw new CareerDocumentError(409, "AI proposal produced no change");
        beforeSnapshotId = captured.snapshotId; afterSnapshotId = applied.snapshotId; nextVersion = applied.sequence;
        update = { base64: applied.base64, sequence: applied.sequence };
      } else {
        beforeSnapshotId = randomUUID(); afterSnapshotId = randomUUID();
        const canonicalBefore = encodeDocumentAsYUpdate(before); const nextUpdate = encodeDocumentAsYUpdate(after, [canonicalBefore], `ai:${proposal._id}:apply`);
        await repository.insertSnapshot({ _id: beforeSnapshotId, userId, recordId, documentVersion: input.expectedDocumentVersion, version: input.expectedDocumentVersion, schemaVersion: 1, content: before as never, stateVector: new Binary(Buffer.from(encodeDocumentStateVector(before))), serverSequence: input.expectedDocumentVersion, checksum: hashUpdate(canonicalBefore), actor: "ai", createdAt: new Date() }, tx.session);
        const bumped = await repository.bumpDocumentVersion(recordId, userId, input.expectedDocumentVersion, afterSnapshotId, tx.session); if (bumped === null) throw new CareerDocumentError(409, "document version is stale"); nextVersion = bumped;
        await repository.insertUpdate({ _id: randomUUID(), recordId, userId, clientId: proposal._id, clientSequence: 1, serverSequence: nextVersion, update: new Binary(nextUpdate), byteLength: nextUpdate.byteLength, updateHash: hashUpdate(nextUpdate), actor: "ai", receivedAt: new Date(), compactedAt: null }, tx.session);
        update = { base64: Buffer.from(nextUpdate).toString("base64"), sequence: nextVersion };
        await repository.insertSnapshot({ _id: afterSnapshotId, userId, recordId, documentVersion: nextVersion, version: nextVersion, schemaVersion: 1, content: after as never, stateVector: new Binary(Buffer.from(encodeDocumentStateVector(after))), serverSequence: nextVersion, checksum: hashUpdate(encodeDocumentAsYUpdate(after)), actor: "ai", createdAt: new Date() }, tx.session);
      }
      const category = await db.careerCategories.findOne({ _id: record.categoryId, userId }, { session: tx.session }); if (!category) throw new CareerDocumentError(404, "career category not found");
      const properties = { ...record.properties }; const definitions = definitionMap(category); const changedPropertyIds: string[] = [];
      for (const change of changes) { const definition = definitions.get(change.propertyId); assertWritableProperty(definition, change.nextValue); if (!definition || JSON.stringify(properties[definition.key] ?? null) !== JSON.stringify(change.previousValue)) throw new CareerDocumentError(409, "AI proposal property changed"); if (change.nextValue === null) delete properties[definition.key]; else properties[definition.key] = CareerPropertyValueV2Schema.parse(change.nextValue); changedPropertyIds.push(change.propertyId); }
      const propertyUpdated = await db.careerRecords.findOneAndUpdate({ _id: recordId, userId, documentVersion: nextVersion }, { $set: { properties, updatedAt: new Date() }, $inc: { version: 1 } }, { session: tx.session, returnDocument: "after" });
      if (!propertyUpdated) throw new CareerDocumentError(409, "career record version is stale");
      if (changedPropertyIds.length) await addMongoOutboxEvent(tx, { userId, topic: "career.computation", idempotencyKey: `career-ai-property:${proposal._id}:v${propertyUpdated.version}`, payload: { userId, recordId, changedPropertyIds, sourceRecordVersion: propertyUpdated.version } });
      const revisionId = randomUUID(); await repository.insertRevision({ _id: revisionId, userId, recordId, actor: "ai", summary: proposal.summary ?? "AI 변경 적용", beforeVersion: input.expectedDocumentVersion, afterVersion: nextVersion, snapshotId: beforeSnapshotId, proposalId: proposal._id, createdAt: new Date() }, tx.session);
      proposal.status = "applied"; proposal.beforeSnapshotId = beforeSnapshotId; proposal.afterSnapshotId = afterSnapshotId; proposal.beforeChecksum = beforeChecksum; proposal.afterChecksum = afterChecksum; proposal.revisionId = revisionId; proposal.appliedDocumentVersion = nextVersion; proposal.progress = null; proposal.updatedAt = new Date();
      await db.careerAiProposals.updateOne({ _id: proposal._id }, { $set: { status: proposal.status, beforeSnapshotId, afterSnapshotId, beforeChecksum, afterChecksum, revisionId, appliedDocumentVersion: nextVersion, progress: null, updatedAt: proposal.updatedAt } }, { session: tx.session }); publishRow = proposal;
    });
    if (!publishRow) throw new CareerDocumentError(404, "AI proposal not found"); this.publish(publishRow);
    if (publishRow.status === "conflicted") throw new CareerDocumentError(409, "AI proposal blocks no longer exist");
    if (update) this.updatePublisher?.(recordId, update.base64, update.sequence);
    return toDetail(publishRow);
  }

  async undo(userId: string, recordId: string, raw: unknown) {
    const input = AiProposalUndoRequestSchema.parse(raw); if (input.recordId !== recordId) throw new CareerDocumentError(404, "AI proposal not found");
    const proposal = await mongoCollections(this.context.db).careerAiProposals.findOne({ _id: input.proposalId, userId, recordId, status: "applied" });
    if (!proposal?.revisionId || !proposal.beforeSnapshotId || proposal.appliedDocumentVersion !== input.expectedDocumentVersion) throw new CareerDocumentError(409, "AI proposal undo is stale");
    const beforeSnapshot = await mongoCollections(this.context.db).careerDocumentSnapshots.findOne({ _id: proposal.beforeSnapshotId, userId, recordId });
    if (!beforeSnapshot) throw new CareerDocumentError(409, "AI proposal before snapshot is missing");
    const current = await this.documentService.bootstrap(userId, recordId);
    // BlockNote 문서는 복원이 만든 증분 업데이트를 이 서비스의 발행 경로로 열린 편집기에 보냅니다.
    const publish = current.editor === "blocknote" ? this.updatePublisher : undefined;
    const bootstrap = await this.documentService.restoreRevision(userId, proposal.revisionId, input.expectedDocumentVersion, recordId, publish);
    // 되돌린 제안은 다시 적용할 수 있게 ready로 돌립니다. applied로 두면 다시 적용해도 아무것도 바뀌지 않습니다(감사 중간 · AI).
    const reopened = await mongoCollections(this.context.db).careerAiProposals.findOneAndUpdate(
      { _id: proposal._id, userId, status: "applied" },
      { $set: { status: "ready", appliedDocumentVersion: null, revisionId: null, beforeSnapshotId: null, afterSnapshotId: null, beforeChecksum: null, afterChecksum: null, expiresAt: new Date(Date.now() + LIFETIME_MS), updatedAt: new Date() } },
      { returnDocument: "after" },
    );
    if (reopened) this.publish(reopened);
    if (current.editor === "blocknote") return bootstrap;
    const before = parseCareerDocument(beforeSnapshot.content);
    const canonicalBefore = encodeDocumentAsYUpdate(before);
    const appliedUpdate = encodeDocumentAsYUpdate(current.document, [canonicalBefore], `ai:${proposal._id}:apply`);
    const update = encodeDocumentAsYUpdate(bootstrap.document, [canonicalBefore, appliedUpdate], `ai:${proposal._id}:undo:${bootstrap.documentVersion}`);
    this.updatePublisher?.(recordId, Buffer.from(update).toString("base64"), bootstrap.documentVersion);
    return bootstrap;
  }

  private async validateProposal(document: CareerDocument, commands: readonly CareerEditCommand[], allowedBlockIds: readonly string[]) {
    const ids = blockMap(document.content); const allowed = new Set(allowedBlockIds);
    for (const command of commands) for (const id of changedCommandIds(command)) {
      if (!ids.has(id)) throw new CareerDocumentError(409, "AI proposal references an unknown block");
      if (!allowed.has(id)) throw new CareerDocumentError(403, "AI proposal edits outside the selected blocks");
    }
    try { applyCareerCommands(document, commands); }
    catch { throw new CareerDocumentError(409, "AI proposal command sequence is invalid"); }
  }

  private async validatePropertyChanges(userId: string, recordId: string, changes: readonly { propertyId: string; previousValue: unknown; nextValue: unknown }[]) {
    if (!changes.length) return;
    const db = mongoCollections(this.context.db); const record = await db.careerRecords.findOne({ _id: recordId, userId, deletedAt: null });
    if (!record) throw new CareerDocumentError(404, "career record not found");
    const category = await db.careerCategories.findOne({ _id: record.categoryId, userId });
    if (!category) throw new CareerDocumentError(404, "career category not found");
    const definitions = definitionMap(category);
    for (const change of changes) {
      const definition = definitions.get(change.propertyId);
      assertWritableProperty(definition, change.nextValue);
      if (!definition || JSON.stringify(record.properties[definition.key] ?? null) !== JSON.stringify(change.previousValue)) throw new CareerDocumentError(409, "AI proposal property changed");
    }
  }
}
