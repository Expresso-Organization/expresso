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
import { Binary } from "mongodb";

import { inTransaction, type MongoTransaction } from "../../platform/mongo-transaction.js";
import type { MongoContext } from "../../platform/mongodb.js";
import { addMongoOutboxEvent } from "../../platform/mongo-outbox.js";
import { CareerDocumentError } from "./errors.js";
import { binaryBytes, hashUpdate, MongoCareerDocumentRepository } from "./repository.js";
import type { CareerDocumentService } from "./service.js";
import type { AiProposalAdapter } from "./ai-adapter.js";
import { DeterministicAiProposalAdapter } from "./ai-adapter.js";

const LIFETIME_MS = 30 * 60_000;
const EMPTY_SESSION_ID = "00000000-0000-0000-0000-000000000000";
type ProposalPublisher = (recordId: string, proposal: AiEditProposalDetail) => void;
type UpdatePublisher = (recordId: string, updateBase64: string, serverSequence: number) => void;

function checksum(document: CareerDocument): string { return createHash("sha256").update(JSON.stringify(document)).digest("hex"); }
function blockMap(blocks: CareerDocument["content"], map = new Map<string, CareerDocument["content"][number]>()) {
  for (const block of blocks) { map.set(block.id, block); if (block.content) blockMap(block.content, map); }
  return map;
}
function definitionMap(category: { propertySchemaV2?: readonly { id: string; key: string; system: boolean; deletedAt: string | null }[] | undefined; propertySchema: Record<string, { id?: string | undefined; system: boolean }> }) {
  const map = new Map<string, { key: string; system: boolean }>();
  if (category.propertySchemaV2) for (const definition of category.propertySchemaV2) if (definition.deletedAt === null) map.set(definition.id, { key: definition.key, system: definition.system });
  else for (const [key, definition] of Object.entries(category.propertySchema)) if (definition.id) map.set(definition.id, { key, system: definition.system });
  return map;
}
function toDetail(row: CareerAiProposalDoc): AiEditProposalDetail {
  return AiEditProposalDetailSchema.parse({ proposalId: row._id, recordId: row.recordId, baseDocumentVersion: row.baseDocumentVersion, selection: row.selection, summary: row.summary ?? "생성 중", commands: row.commands, propertyChanges: row.propertyChanges, createdAt: row.createdAt.toISOString(), expiresAt: row.expiresAt.toISOString(), status: row.status, progress: row.progress, appliedDocumentVersion: row.appliedDocumentVersion, revisionId: row.revisionId });
}
function changedCommandIds(command: CareerEditCommand): string[] {
  if (command.type === "insertBlocks") return command.afterBlockId ? [command.afterBlockId] : [];
  if (command.type === "deleteBlocks") return [...command.blockIds];
  return command.type === "replaceBlock" || command.type === "setText" || command.type === "moveBlock" ? [command.blockId, ...(command.type === "moveBlock" && command.afterBlockId ? [command.afterBlockId] : [])] : [];
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
    try { generated = await this.adapter.generate({ recordId, documentVersion: bootstrap.documentVersion, selectionBlockIds: input.selection.blockIds, selectedBlocks: input.selection.blockIds.map((id) => blocks.get(id)!), prompt: input.prompt, signal: controller.signal }); }
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
      const before = reconstructYDocument([encodeDocumentAsYUpdate(parseCareerDocument(snapshot.content)), ...updates.map((update) => binaryBytes(update.update))]);
      const existingBlocks = blockMap(before.content);
      const commands = input.commandIndexes.map((index) => proposal.commands[index] as unknown as CareerEditCommand | undefined).filter((command): command is CareerEditCommand => command !== undefined);
      const changes = input.propertyChangeIndexes.map((index) => proposal.propertyChanges[index] as unknown as { propertyId: string; previousValue: unknown; nextValue: unknown } | undefined).filter((change): change is { propertyId: string; previousValue: unknown; nextValue: unknown } => change !== undefined);
      if (new Set(input.commandIndexes).size !== input.commandIndexes.length || commands.length !== input.commandIndexes.length || new Set(input.propertyChangeIndexes).size !== input.propertyChangeIndexes.length || changes.length !== input.propertyChangeIndexes.length) throw new CareerDocumentError(400, "proposal selection is invalid");
      if (input.expectedDocumentVersion !== proposal.baseDocumentVersion && commands.some((command) => changedCommandIds(command).some((id) => !existingBlocks.has(id)))) { proposal.status = "conflicted"; proposal.updatedAt = new Date(); await db.careerAiProposals.updateOne({ _id: proposal._id }, { $set: { status: proposal.status, updatedAt: proposal.updatedAt } }, { session: tx.session }); publishRow = proposal; return; }
      await this.validateProposal(before, commands, proposal.selection.blockIds);
      const after = applyCareerCommands(before, commands);
      const beforeSnapshotId = randomUUID(); const afterSnapshotId = randomUUID(); const beforeChecksum = checksum(before); const afterChecksum = checksum(after);
      const canonicalBefore = encodeDocumentAsYUpdate(before); const nextUpdate = encodeDocumentAsYUpdate(after, [canonicalBefore], `ai:${proposal._id}:apply`);
      await repository.insertSnapshot({ _id: beforeSnapshotId, userId, recordId, documentVersion: input.expectedDocumentVersion, version: input.expectedDocumentVersion, schemaVersion: 1, content: before as never, stateVector: new Binary(Buffer.from(encodeDocumentStateVector(before))), serverSequence: input.expectedDocumentVersion, checksum: hashUpdate(canonicalBefore), actor: "ai", createdAt: new Date() }, tx.session);
      const nextVersion = await repository.bumpDocumentVersion(recordId, userId, input.expectedDocumentVersion, afterSnapshotId, tx.session); if (nextVersion === null) throw new CareerDocumentError(409, "document version is stale");
      await repository.insertUpdate({ _id: randomUUID(), recordId, userId, clientId: proposal._id, clientSequence: 1, serverSequence: nextVersion, update: new Binary(nextUpdate), byteLength: nextUpdate.byteLength, updateHash: hashUpdate(nextUpdate), actor: "ai", receivedAt: new Date(), compactedAt: null }, tx.session);
      update = { base64: Buffer.from(nextUpdate).toString("base64"), sequence: nextVersion };
      await repository.insertSnapshot({ _id: afterSnapshotId, userId, recordId, documentVersion: nextVersion, version: nextVersion, schemaVersion: 1, content: after as never, stateVector: new Binary(Buffer.from(encodeDocumentStateVector(after))), serverSequence: nextVersion, checksum: hashUpdate(encodeDocumentAsYUpdate(after)), actor: "ai", createdAt: new Date() }, tx.session);
      const category = await db.careerCategories.findOne({ _id: record.categoryId, $or: [{ userId: null }, { userId }] }, { session: tx.session }); if (!category) throw new CareerDocumentError(404, "career category not found");
      const properties = { ...record.properties }; const definitions = definitionMap(category); const changedPropertyIds: string[] = [];
      for (const change of changes) { const definition = definitions.get(change.propertyId); if (!definition || definition.system || JSON.stringify(properties[definition.key] ?? null) !== JSON.stringify(change.previousValue)) throw new CareerDocumentError(409, "AI proposal property changed"); if (change.nextValue === null) delete properties[definition.key]; else properties[definition.key] = CareerPropertyValueV2Schema.parse(change.nextValue); changedPropertyIds.push(change.propertyId); }
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
    const before = parseCareerDocument(beforeSnapshot.content);
    const current = await this.documentService.bootstrap(userId, recordId);
    const bootstrap = await this.documentService.restoreRevision(userId, proposal.revisionId, input.expectedDocumentVersion, recordId);
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
    const category = await db.careerCategories.findOne({ _id: record.categoryId, $or: [{ userId: null }, { userId }] });
    if (!category) throw new CareerDocumentError(404, "career category not found");
    const definitions = definitionMap(category);
    for (const change of changes) {
      const definition = definitions.get(change.propertyId);
      if (!definition || definition.system || JSON.stringify(record.properties[definition.key] ?? null) !== JSON.stringify(change.previousValue)) throw new CareerDocumentError(409, "AI proposal property changed");
      if (change.nextValue !== null) CareerPropertyValueV2Schema.parse(change.nextValue);
    }
  }
}
