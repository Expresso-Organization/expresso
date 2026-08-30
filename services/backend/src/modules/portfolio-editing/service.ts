import { randomUUID } from "node:crypto";

import { ApplyPortfolioEditResultSchema, PortfolioEditProposalSchema, type PortfolioEditCommandSchema } from "@expresso/contracts";
import { mongoCollections, type BlockDoc, type JsonObject, type PortfolioEditProposalDoc } from "@expresso/database";
import type { z } from "zod";

import type { MongoContext } from "../../platform/mongodb.js";
import { inTransaction, type MongoTransaction } from "../../platform/mongo-transaction.js";
import { deleteSnapshotPayload, readSnapshot, snapshotRefFromStored, writeSnapshot } from "../../platform/snapshot-payload.js";
import { assertActiveRecordsForWrite } from "../career/index.js";
import type { ConsentApi } from "../consent/index.js";
import { requireActiveUser } from "../identity/index.js";
import { applyPatches, blockFields, BlockEditError, EDITABLE_PATHS, type BlockEditor, type EditContext } from "./editor.js";
import { PortfolioEditingError } from "./public.js";

type EditCommand = z.infer<typeof PortfolioEditCommandSchema>;
type BlockState = { content: JsonObject; style: JsonObject; sourceRecordId: string | null; syncState: BlockDoc["syncState"]; locked: boolean };
const OPERATION_SUMMARY = { update_text: "값을 직접 고쳤습니다", set_style: "모양을 바꿨습니다", insert_record: "기록을 다시 이었습니다", instruct: "말로 고친 것을 반영했습니다" } as const;

function blockState(block: BlockDoc): BlockState { return { content: block.content, style: block.style, sourceRecordId: block.sourceRecordId ?? null, syncState: block.syncState, locked: block.locked }; }
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
function mapProposal(row: PortfolioEditProposalDoc) {
  return PortfolioEditProposalSchema.parse({ id: row._id, portfolioId: row.portfolioId, blockId: row.blockId, targetPath: row.targetPath, operation: row.operation, before: row.beforeState, after: row.afterState, sourceRecordId: row.sourceRecordId ?? null, status: row.status, instruction: row.instruction ?? null, patches: row.patches });
}

export class PortfolioEditingService {
  readonly #editor: BlockEditor | null; readonly #consent: ConsentApi | null;
  constructor(readonly context: MongoContext, editor?: BlockEditor | null, consent?: ConsentApi | null) { this.#editor = editor ?? null; this.#consent = consent ?? null; }

  async #ownedBlock(context: MongoContext | MongoTransaction, userId: string, portfolioId: string, blockId: string) {
    const options = "session" in context ? { session: context.session } : {};
    const db = mongoCollections(context.db); const block = await db.blocks.findOne({ _id: blockId, userId }, options);
    const section = block ? await db.portfolioSections.findOne({ _id: block.portfolioSectionId, userId, portfolioId }, options) : null;
    return section ? block : null;
  }

  async preview(userId: string, portfolioId: string, blockId: string, command: EditCommand) {
    const block = await this.#ownedBlock(this.context, userId, portfolioId, blockId);
    if (!block) throw new PortfolioEditingError(404, "portfolio block not found");
    const before = blockState(block); let after = { ...before }; let sourceRecordId: string | null = null; let instruction: string | null = null;
    let patches: { path: string; before: string; after: string; label: string }[] = [];
    if (command.operation === "instruct") {
      if (block.locked) throw new PortfolioEditingError(409, "locked block cannot be edited by instruction");
      if (!this.#editor) throw new PortfolioEditingError(503, "instruction editing is unavailable");
      await this.#consent?.require(userId, "partial_edit"); instruction = command.instruction;
      patches = await this.#instruct(userId, block, command.instruction);
      after = { ...after, content: applyPatches(block.content, patches) as JsonObject, syncState: "detached", locked: true };
    } else if (command.operation === "update_text") {
      const path = command.path ?? "content.text"; const allowed = EDITABLE_PATHS[block.kind];
      if (!allowed?.includes(path)) throw new PortfolioEditingError(422, `${block.kind} 블록의 ${path}는 고칠 수 없습니다`);
      const key = path.slice("content.".length); after = { ...after, content: { ...block.content, [key]: command.text }, syncState: "detached", locked: true };
      patches = [{ path, before: String(block.content[key] ?? ""), after: command.text, label: "직접 고쳤습니다" }];
    } else if (command.operation === "set_style") {
      after = { ...after, style: JSON.parse(JSON.stringify({ ...block.style, ...command.style })) as JsonObject, locked: true };
    } else {
      const record = await mongoCollections(this.context.db).careerRecords.findOne({ _id: command.recordId, userId, deletedAt: null });
      if (!record) throw new PortfolioEditingError(404, "source record not found");
      sourceRecordId = record._id; after = { ...after, content: { ...block.content, text: record.bodyMd }, sourceRecordId, syncState: "synced", locked: true };
    }
    const proposal = await inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId); const current = await this.#ownedBlock(tx, userId, portfolioId, blockId);
      if (!current) throw new PortfolioEditingError(404, "portfolio block not found");
      if (stableJson(blockState(current)) !== stableJson(before)) throw new PortfolioEditingError(409, "block changed while previewing", { conflict: true });
      if (sourceRecordId) await assertActiveRecordsForWrite(tx, userId, [sourceRecordId]);
      const now = new Date(); const row: PortfolioEditProposalDoc = {
        _id: randomUUID(), userId, portfolioId, blockId, targetPath: `portfolio:${portfolioId}/section:${block.portfolioSectionId}/block:${block._id}`,
        operation: command.operation, beforeState: before as unknown as JsonObject, afterState: after as unknown as JsonObject,
        sourceRecordId, instruction, status: "pending", createdAt: now, expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000), patches: patches as never,
      };
      await mongoCollections(tx.db).portfolioEditProposals.insertOne(row, { session: tx.session }); return row;
    });
    return mapProposal(proposal);
  }

  async #instruct(userId: string, block: BlockDoc, instruction: string) {
    const db = mongoCollections(this.context.db); const section = await db.portfolioSections.findOne({ _id: block.portfolioSectionId, userId });
    const recipeSection = section?.recipeSectionId ? await db.recipeSections.findOne({ _id: section.recipeSectionId, userId }) : null;
    const record = block.sourceRecordId ? await db.careerRecords.findOne({ _id: block.sourceRecordId, userId }) : null;
    const editContext: EditContext = { instruction, block: { kind: block.kind, fields: blockFields(block.kind, block.content) }, section: recipeSection ? { title: recipeSection.title, purpose: recipeSection.purpose, goal: typeof recipeSection.context.goal === "string" ? recipeSection.context.goal : "", tone: typeof recipeSection.context.tone === "string" ? recipeSection.context.tone : "", exclude: Array.isArray(recipeSection.context.exclude) ? recipeSection.context.exclude.filter((v): v is string => typeof v === "string") : [] } : null, sourceText: record?.bodyMd ?? "" };
    try { return await this.#editor!.edit(editContext); } catch (error) { if (error instanceof BlockEditError) throw new PortfolioEditingError(422, error.message); throw error; }
  }

  async apply(userId: string, proposalId: string) {
    const result = await inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId); const db = mongoCollections(tx.db); const options = { session: tx.session };
      const proposal = await db.portfolioEditProposals.findOne({ _id: proposalId, userId }, options);
      if (!proposal) throw new PortfolioEditingError(404, "edit proposal not found");
      if (proposal.status !== "pending" || proposal.expiresAt <= new Date()) throw new PortfolioEditingError(409, "edit proposal is no longer applicable");
      const block = await this.#ownedBlock(tx, userId, proposal.portfolioId, proposal.blockId);
      if (!block) throw new PortfolioEditingError(404, "portfolio block not found");
      if (stableJson(blockState(block)) !== stableJson(proposal.beforeState)) throw new PortfolioEditingError(409, "block changed after preview", { conflict: true });
      await this.#captureSnapshot(tx, userId, proposal.portfolioId, "edit");
      const after = proposal.afterState as unknown as BlockState;
      if (after.sourceRecordId) await assertActiveRecordsForWrite(tx, userId, [after.sourceRecordId]);
      await db.blocks.updateOne({ _id: block._id, userId }, { $set: { content: after.content, style: after.style, sourceRecordId: after.sourceRecordId, syncState: after.syncState, locked: true } }, options);
      if (after.sourceRecordId) await db.recordUsages.updateOne({ userId, recordId: after.sourceRecordId, blockId: block._id }, { $set: { quotedText: String(after.content.text ?? "") }, $setOnInsert: { _id: randomUUID(), userId, recordId: after.sourceRecordId, blockId: block._id, firstUsedAt: new Date() } }, { ...options, upsert: true });
      const revisionId = randomUUID();
      await db.revisions.insertOne({ _id: revisionId, userId, portfolioId: proposal.portfolioId, blockId: block._id, actor: "user", before: proposal.beforeState, after: proposal.afterState, proposalId: proposal._id, changeKind: "edit", summary: OPERATION_SUMMARY[proposal.operation], createdAt: new Date() }, options);
      const changed = await db.portfolioEditProposals.findOneAndUpdate({ _id: proposal._id, userId, status: "pending" }, { $set: { status: "applied", appliedAt: new Date() } }, { ...options, returnDocument: "after" });
      if (!changed) throw new PortfolioEditingError(409, "edit proposal is no longer applicable");
      return { proposal: changed, revisionId };
    });
    return ApplyPortfolioEditResultSchema.parse({ proposal: mapProposal(result.proposal), revisionId: result.revisionId, locked: true });
  }

  async revertRevision(userId: string, revisionId: string, confirmConflict = false) {
    return inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId); const db = mongoCollections(tx.db); const options = { session: tx.session };
      const revision = await db.revisions.findOne({ _id: revisionId, userId }, options);
      if (!revision?.blockId || !revision.before || !revision.after) throw new PortfolioEditingError(404, "revertible revision not found");
      const block = await db.blocks.findOne({ _id: revision.blockId, userId }, options);
      if (!block) throw new PortfolioEditingError(404, "revision block not found");
      const conflict = stableJson(blockState(block)) !== stableJson(revision.after);
      if (conflict && !confirmConflict) throw new PortfolioEditingError(409, "revert conflicts with later changes", { conflict: true, blockId: block._id });
      const before = revision.before as unknown as BlockState;
      if (before.sourceRecordId) await assertActiveRecordsForWrite(tx, userId, [before.sourceRecordId]);
      await db.blocks.updateOne({ _id: block._id, userId }, { $set: before }, options);
      const newRevisionId = randomUUID();
      await db.revisions.insertOne({ _id: newRevisionId, userId, portfolioId: revision.portfolioId, blockId: block._id, actor: "user", before: blockState(block) as never, after: before as never, revertedRevisionId: revision._id, changeKind: "revert", summary: "한 번의 변경을 되돌렸습니다", createdAt: new Date() }, options);
      return { revisionId: newRevisionId, conflictResolved: conflict };
    });
  }

  async reorderBlocks(userId: string, portfolioId: string, sectionId: string, blockIds: string[]) {
    return inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId); const db = mongoCollections(tx.db); const options = { session: tx.session };
      if (!await db.portfolioSections.findOne({ _id: sectionId, userId, portfolioId }, options)) throw new PortfolioEditingError(404, "portfolio section not found");
      const current = await db.blocks.find({ userId, portfolioSectionId: sectionId }, options).sort({ orderNo: 1, _id: 1 }).toArray();
      this.#assertExactOrder(current.map(({ _id }) => _id), blockIds, "block order does not match the current section");
      await db.blocks.bulkWrite(blockIds.map((_id, orderNo) => ({ updateOne: { filter: { _id, userId }, update: { $set: { orderNo } } } })), options);
      const id = await this.#revision(tx, userId, portfolioId, null, { blockIds: current.map(({ _id }) => _id) }, { blockIds }, "블록 순서를 바꿨습니다"); return { blockIds, revisionId: id };
    });
  }

  async duplicateBlock(userId: string, portfolioId: string, blockId: string) {
    return inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId); const block = await this.#ownedBlock(tx, userId, portfolioId, blockId);
      if (!block) throw new PortfolioEditingError(404, "portfolio block not found");
      const db = mongoCollections(tx.db); const options = { session: tx.session };
      await db.blocks.updateMany({ userId, portfolioSectionId: block.portfolioSectionId, orderNo: { $gt: block.orderNo } }, { $inc: { orderNo: 1 } }, options);
      const id = randomUUID(); const copy = { ...block, _id: id, orderNo: block.orderNo + 1, locked: true };
      await db.blocks.insertOne(copy, options);
      const revisionIdNew = await this.#revision(tx, userId, portfolioId, id, null, blockState(block), "블록을 하나 더 만들었습니다"); return { blockId: id, revisionId: revisionIdNew };
    });
  }

  async deleteBlock(userId: string, portfolioId: string, blockId: string) {
    return inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId); const block = await this.#ownedBlock(tx, userId, portfolioId, blockId);
      if (!block) throw new PortfolioEditingError(404, "portfolio block not found");
      const snapshotId = await this.#captureSnapshot(tx, userId, portfolioId, "manual"); const db = mongoCollections(tx.db); const options = { session: tx.session };
      await db.generationSentenceEvidence.deleteMany({ userId, blockId }, options); await db.recordUsages.deleteMany({ userId, blockId }, options); await db.revisions.updateMany({ userId, blockId }, { $set: { blockId: null } }, options);
      await db.blocks.deleteOne({ _id: blockId, userId }, options); await db.blocks.updateMany({ userId, portfolioSectionId: block.portfolioSectionId, orderNo: { $gt: block.orderNo } }, { $inc: { orderNo: -1 } }, options);
      const revisionIdNew = await this.#revision(tx, userId, portfolioId, null, blockState(block), null, "블록을 지웠습니다"); return { blockId, snapshotId, revisionId: revisionIdNew };
    });
  }

  async setSectionVisibility(userId: string, portfolioId: string, sectionId: string, visible: boolean) {
    return inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId); const db = mongoCollections(tx.db); const options = { session: tx.session };
      const section = await db.portfolioSections.findOne({ _id: sectionId, userId, portfolioId }, options); if (!section) throw new PortfolioEditingError(404, "portfolio section not found");
      await db.portfolioSections.updateOne({ _id: sectionId, userId }, { $set: { visible, hiddenReason: visible ? null : "직접 숨김" } }, options);
      const id = await this.#revision(tx, userId, portfolioId, null, { sectionId, visible: section.visible }, { sectionId, visible }, visible ? "섹션을 다시 꺼냈습니다" : "섹션을 숨겼습니다"); return { sectionId, visible, revisionId: id };
    });
  }

  async reorderSections(userId: string, portfolioId: string, sectionIds: string[]) {
    return inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId); const db = mongoCollections(tx.db); const options = { session: tx.session };
      const current = await db.portfolioSections.find({ userId, portfolioId }, options).sort({ orderNo: 1, _id: 1 }).toArray();
      this.#assertExactOrder(current.map(({ _id }) => _id), sectionIds, "section order does not match the current portfolio");
      await db.portfolioSections.bulkWrite(sectionIds.map((_id, orderNo) => ({ updateOne: { filter: { _id, userId, portfolioId }, update: { $set: { orderNo } } } })), options);
      const id = await this.#revision(tx, userId, portfolioId, null, { sectionIds: current.map(({ _id }) => _id) }, { sectionIds }, "섹션 순서를 바꿨습니다"); return { sectionIds, revisionId: id };
    });
  }

  async restore(userId: string, portfolioId: string, snapshotId: string) {
    return inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId); const db = mongoCollections(tx.db); const options = { session: tx.session };
      const target = await db.portfolioSnapshots.findOne({ _id: snapshotId, userId, portfolioId }, options);
      if (!target) throw new PortfolioEditingError(409, "snapshot cannot restore portfolio blocks");
      const value = await readSnapshot(tx, snapshotRefFromStored(target.snapshot));
      const sections = value.sections as Array<{ id: string; recipeSectionId?: string | null; order: number; visible: boolean; blocks: Array<{ id: string; kind: BlockDoc["kind"]; content: JsonObject; style: JsonObject; sourceRecordId: string | null; syncState: BlockDoc["syncState"]; locked: boolean }> }> | undefined;
      if (!sections) throw new PortfolioEditingError(409, "snapshot cannot restore portfolio blocks");
      const preRestoreSnapshotId = await this.#captureSnapshot(tx, userId, portfolioId, "manual");
      const kept = sections.flatMap((section) => section.blocks.map(({ id }) => id));
      const currentSections = await db.portfolioSections.find({ userId, portfolioId }, options).toArray();
      await db.blocks.deleteMany({ userId, portfolioSectionId: { $in: currentSections.map(({ _id }) => _id) }, ...(kept.length ? { _id: { $nin: kept } } : {}) }, options);
      for (const section of sections) {
        await db.portfolioSections.updateOne({ _id: section.id, userId, portfolioId }, { $set: { orderNo: section.order, visible: section.visible } }, options);
        for (const [orderNo, block] of section.blocks.entries()) await db.blocks.updateOne({ _id: block.id, userId }, { $set: { userId, portfolioSectionId: section.id, kind: block.kind, content: block.content, style: block.style, sourceRecordId: block.sourceRecordId, syncState: block.syncState, locked: block.locked, orderNo }, $setOnInsert: { _id: block.id } }, { ...options, upsert: true });
      }
      const revisionIdNew = await this.#revision(tx, userId, portfolioId, null, { preRestoreSnapshotId }, { restoredSnapshotId: snapshotId }, "지점으로 복원했습니다", "restore");
      return { snapshotId, preRestoreSnapshotId, revisionId: revisionIdNew };
    });
  }

  #assertExactOrder(current: string[], provided: string[], message: string) { const known = new Set(current); const given = new Set(provided); if (given.size !== provided.length || known.size !== given.size || provided.some((id) => !known.has(id))) throw new PortfolioEditingError(409, message); }

  async #revision(tx: MongoTransaction, userId: string, portfolioId: string, blockId: string | null, before: unknown, after: unknown, summary: string, changeKind: "edit" | "restore" = "edit") {
    const id = randomUUID(); await mongoCollections(tx.db).revisions.insertOne({ _id: id, userId, portfolioId, blockId, actor: "user", before: before as never, after: after as never, changeKind, summary, createdAt: new Date() }, { session: tx.session }); return id;
  }

  async #captureSnapshot(tx: MongoTransaction, userId: string, portfolioId: string, kind: "edit" | "manual") {
    const db = mongoCollections(tx.db); const options = { session: tx.session };
    const sections = await db.portfolioSections.find({ userId, portfolioId }, options).sort({ orderNo: 1, _id: 1 }).toArray();
    const blocks = await db.blocks.find({ userId, portfolioSectionId: { $in: sections.map(({ _id }) => _id) } }, options).sort({ orderNo: 1, _id: 1 }).toArray();
    const value = { portfolioId, sections: sections.map((section) => ({ id: section._id, recipeSectionId: section.recipeSectionId ?? null, order: section.orderNo, visible: section.visible, blocks: blocks.filter(({ portfolioSectionId }) => portfolioSectionId === section._id).map((block) => ({ id: block._id, kind: block.kind, content: block.content, style: block.style, sourceRecordId: block.sourceRecordId ?? null, syncState: block.syncState, locked: block.locked })) })) };
    const ref = await writeSnapshot(tx, userId, value); const id = randomUUID();
    await db.portfolioSnapshots.insertOne({ _id: id, userId, portfolioId, kind, snapshot: ref as unknown as JsonObject, createdAt: new Date() }, options);
    const stale = await db.portfolioSnapshots.find({ userId, portfolioId }, options).sort({ createdAt: -1, _id: -1 }).skip(50).toArray();
    for (const row of stale) await deleteSnapshotPayload(tx, userId, snapshotRefFromStored(row.snapshot));
    if (stale.length) await db.portfolioSnapshots.deleteMany({ _id: { $in: stale.map(({ _id }) => _id) }, userId }, options);
    return id;
  }
}

export { PortfolioEditingService as MongoPortfolioEditingService };
