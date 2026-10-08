import {
  CareerBusinessPropertyValueSchema,
  AiEditProposalSchema, CareerProducerScopeSchema, CareerProducerSelectedPropertyChangeSchema,
  PrepareCareerAiProposalSchema, PrepareCareerAiProposalUndoSchema,
  type CareerProducerScope, type CareerProducerIntent, type CareerProducerSelectedPropertyChange,
  type PrepareCareerAiProposal, type PrepareCareerAiProposalUndo,
  CareerPropertyValueV2Schema,
  CareerWriterPropertyDeltaSchema,
  type AiEditProposal,
  type CareerBusinessPropertyValue,
  type CareerPropertyDefinitionV2,
} from "@expresso/contracts";
import { Decimal128 } from "mongodb";
import { createHash } from "node:crypto";
import { mongoCollections, type CareerAiProposalDoc } from "@expresso/database";
import { inTransaction } from "../../platform/mongo-transaction.js";
import type { MongoContext } from "../../platform/mongodb.js";
import { requireActiveUser } from "../identity/index.js";
import { createCareerProducerIntent, validateCareerProducerIntent, careerProducerScopeFilter, type CareerProducerCoordinator } from "../career/index.js";
import type { CareerDocumentApi } from "./service.js";
import { CareerDocumentError } from "./errors.js";

function plainDecimal(value: string): string {
  const match = /^(-?)(\d+)(?:\.(\d*))?(?:E([+-]?\d+))?$/i.exec(value);
  if (!match) throw new CareerDocumentError(409, "selected canonical decimal is invalid");
  const sign = match[1]!;
  const integer = match[2]!;
  const fraction = match[3] ?? "";
  const exponent = Number(match[4] ?? 0);
  if (!exponent) return `${sign}${integer}${fraction ? `.${fraction}` : ""}`;
  const digits = integer + fraction;
  const point = integer.length + exponent;
  return sign + (point <= 0 ? `0.${"0".repeat(-point)}${digits}` : point >= digits.length ? `${digits}${"0".repeat(point - digits.length)}` : `${digits.slice(0, point)}.${digits.slice(point)}`);
}
function storedCanonical(raw: unknown): CareerBusinessPropertyValue {
  if (!raw || typeof raw !== "object") throw new CareerDocumentError(409, "selected canonical value is invalid");
  const row = raw as Record<string, unknown>;
  return CareerBusinessPropertyValueSchema.parse({ ...row, ...(row.type === "number" ? { value: plainDecimal(row.value instanceof Decimal128 ? row.value.toString() : String(row.value)) } : {}) });
}
function fromV2(propertyId: string, raw: unknown): CareerBusinessPropertyValue | null {
  if (raw === null) return null;
  const value = CareerPropertyValueV2Schema.parse(raw);
  const converted = value.type === "number" ? plainDecimal(String(value.value)) : value.type === "date"
    ? { precision: value.value.start.includes("T") ? "datetime" : "day", start: value.value.start, end: value.value.end, ...(value.value.start.includes("T") ? { timezone: value.value.timezone } : {}) }
    : value.value;
  return CareerBusinessPropertyValueSchema.parse({ propertyDefinitionId: propertyId, type: value.type, value: converted });
}

/** 선택한 ID만 canonical delta로 고정하고 나머지 저장값은 읽거나 다시 만들지 않습니다. */
export function selectAiCanonicalDelta(
  definitions: readonly CareerPropertyDefinitionV2[],
  storedValues: readonly unknown[],
  changes: readonly AiEditProposal["propertyChanges"][number][],
  overrides: readonly CareerProducerSelectedPropertyChange[] = [],
) {
  overrides = overrides.map((override) => CareerProducerSelectedPropertyChangeSchema.parse(override));
  const selectedIds = new Set(changes.map((change) => change.propertyId));
  if (selectedIds.size !== changes.length || new Set(overrides.map((change) => change.propertyId)).size !== overrides.length || overrides.some((change) => !selectedIds.has(change.propertyId))) throw new CareerDocumentError(400, "selected canonical property IDs are invalid");
  const set: CareerBusinessPropertyValue[] = [];
  const unsetPropertyIds: string[] = [];
  const writable = new Set(["text", "number", "checkbox", "select", "multi_select", "date", "url", "email", "phone", "file", "media"]);
  for (const change of changes) {
    const definition = definitions.find((definition) => definition.id === change.propertyId);
    if (!definition || definition.system || definition.deletedAt !== null || !writable.has(definition.type)) throw new CareerDocumentError(409, "selected canonical property is not writable");
    const stored = storedValues.filter((value) => !!value && typeof value === "object" && (value as { propertyDefinitionId?: string }).propertyDefinitionId === change.propertyId);
    if (stored.length > 1) throw new CareerDocumentError(409, "duplicate selected canonical property");
    const current = stored.length ? storedCanonical(stored[0]) : null;
    const override = overrides.find((override) => override.propertyId === change.propertyId);
    if (!override && current && ((current.type === "number" && plainDecimal(String(Number(current.value))) !== current.value) || (current.type === "date" && current.value.precision === "month"))) throw new CareerDocumentError(409, "selected value requires an explicit canonical override");
    const previous = override ? override.previousValue === null ? null : CareerBusinessPropertyValueSchema.parse(override.previousValue) : fromV2(change.propertyId, change.previousValue);
    const next = override ? override.nextValue === null ? null : CareerBusinessPropertyValueSchema.parse(override.nextValue) : fromV2(change.propertyId, change.nextValue);
    if (JSON.stringify(current) !== JSON.stringify(previous) || (previous && previous.propertyDefinitionId !== change.propertyId) || (next && (next.propertyDefinitionId !== change.propertyId || next.type !== definition.type))) throw new CareerDocumentError(409, "selected canonical property changed");
    if (next === null) unsetPropertyIds.push(change.propertyId); else set.push(next);
  }
  return CareerWriterPropertyDeltaSchema.parse({ set, unsetPropertyIds });
}
function indexes<T>(items: readonly T[], selected: readonly number[]): T[] {
  if (new Set(selected).size !== selected.length || selected.some((index) => !Number.isInteger(index) || index < 0 || index >= items.length)) throw new CareerDocumentError(400, "proposal selection is invalid");
  return selected.map((index) => items[index]!);
}
function selectedNextDelta(changes: AiEditProposal["propertyChanges"], overrides: readonly CareerProducerSelectedPropertyChange[]) {
  const selected = new Set(changes.map((change) => change.propertyId));
  if (selected.size !== changes.length || new Set(overrides.map((change) => change.propertyId)).size !== overrides.length || overrides.some((change) => !selected.has(change.propertyId))) throw new CareerDocumentError(400, "canonical override selection is invalid");
  const set: CareerBusinessPropertyValue[] = []; const unsetPropertyIds: string[] = [];
  for (const change of changes) {
    const override = overrides.find((item) => item.propertyId === change.propertyId);
    const next = override ? override.nextValue : fromV2(change.propertyId, change.nextValue);
    if (next === null) unsetPropertyIds.push(change.propertyId); else set.push(next);
  }
  return CareerWriterPropertyDeltaSchema.parse({ set, unsetPropertyIds });
}

/** 제품의 기존 Proposal을 고정된 owner intent로 준비하며 runtime 경로에는 등록하지 않습니다. */
export class PreparedAiProposalService {
  constructor(readonly context: MongoContext, readonly documents: CareerDocumentApi, private readonly coordinator?: Pick<CareerProducerCoordinator, "execute" | "cancel">) {}

  async prepare(userId: string, recordId: string, raw: PrepareCareerAiProposal): Promise<CareerProducerScope> {
    const input = PrepareCareerAiProposalSchema.parse(raw);
    if (input.recordId !== recordId) throw new CareerDocumentError(404, "AI proposal not found");
    return inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId);
      const db = mongoCollections(tx.db);
      const proposal = await db.careerAiProposals.findOne({ _id: input.proposalId, userId, recordId }, { session: tx.session });
      if (!proposal) throw new CareerDocumentError(404, "AI proposal not found");
      const commands = indexes(AiEditProposalSchema.shape.commands.parse(proposal.commands), input.commandIndexes);
      const changes = indexes(AiEditProposalSchema.shape.propertyChanges.parse(proposal.propertyChanges), input.propertyChangeIndexes);
      if (!commands.length && !changes.length) throw new CareerDocumentError(400, "prepared selection is empty");
      const overrides = input.canonicalSelectedChanges ?? [];
      if (!changes.length && overrides.length) throw new CareerDocumentError(400, "canonical override selection is invalid");
      const document = commands.length ? { kind: "commands" as const, recordId, expectedVersion: input.expectedDocumentVersion, commands, allowedBlockIds: proposal.selection.blockIds, summary: (proposal.summary ?? "AI 변경 적용").slice(0, 1000) } : null;
      const current = proposal.writerIntegration && validateCareerProducerIntent(proposal.writerIntegration);
      const historical = proposal.writerIntegrationHistory?.find((intent) => intent.operationId === input.operationId);
      const prior = current?.operationId === input.operationId ? current : historical && validateCareerProducerIntent(historical);
      if (historical && prior?.state !== "completed") throw new CareerDocumentError(409, "historical AI operation is incomplete");
      if (prior) {
        if (prior.operationId !== input.operationId) throw new CareerDocumentError(409, "proposal already has a prepared operation");
        const business = changes.length && prior.business?.kind === "patch" ? { ...prior.business, patches: [{ propertyValues: selectedNextDelta(changes, overrides) }] } : null;
        const replay = createCareerProducerIntent({ producer: "ai-proposal", userId, sourceId: proposal._id, operationId: input.operationId, business, document });
        if (replay.fingerprint !== prior.fingerprint) throw new CareerDocumentError(409, "prepared selection changed");
        return CareerProducerScopeSchema.parse(prior);
      }
      if (current) throw new CareerDocumentError(409, "proposal already has a prepared operation");
      if (proposal.status !== "ready" || proposal.expiresAt.getTime() <= Date.now()) throw new CareerDocumentError(409, "AI proposal is unavailable");
      let business: CareerProducerIntent["business"] = null;
      if (changes.length) {
        const record = await db.careerRecords.findOne({ _id: recordId, userId, deletedAt: null }, { session: tx.session });
        if (!record?.propertyValues) throw new CareerDocumentError(409, "selected canonical property storage is required");
        const category = await db.careerCategories.findOne({ _id: record.categoryId, $or: [{ userId: null }, { userId }] }, { session: tx.session });
        if (!category) throw new CareerDocumentError(404, "career category not found");
        const definitions = "propertyDefinitions" in category && Array.isArray(category.propertyDefinitions) ? category.propertyDefinitions as CareerPropertyDefinitionV2[] : category.propertySchemaV2 ?? [];
        const delta = selectAiCanonicalDelta(definitions, record.propertyValues, changes, overrides);
        business = { kind: "patch", recordId, expectedVersion: record.version, expectedCategoryVersion: category.version, patches: [{ propertyValues: delta }] };
      }
      const intent = createCareerProducerIntent({ producer: "ai-proposal", userId, sourceId: proposal._id, operationId: input.operationId, business, document });
      const changed = await db.careerAiProposals.updateOne({ _id: proposal._id, userId, recordId, status: "ready", writerIntegration: { $exists: false } }, { $set: { writerIntegration: intent, updatedAt: new Date() } }, { session: tx.session });
      if (!changed.matchedCount) throw new CareerDocumentError(409, "proposal preparation raced another operation");
      return CareerProducerScopeSchema.parse(intent);
    });
  }
  async execute(raw: CareerProducerScope): Promise<CareerProducerIntent> {
    const scope = CareerProducerScopeSchema.parse(raw);
    if (scope.producer !== "ai-proposal") throw new CareerDocumentError(409, "AI producer scope is invalid");
    if (!this.coordinator) throw new CareerDocumentError(503, "prepared canonical coordinator is not configured");
    return this.coordinator.execute(scope, async (tx, intent) => {
      const db = mongoCollections(tx.db);
      const proposal = await db.careerAiProposals.findOne(careerProducerScopeFilter(scope), { session: tx.session });
      if (!proposal) throw new CareerDocumentError(409, "prepared AI source changed");
      if (intent.document?.kind === "restore") {
        if (proposal.status !== "applied") throw new CareerDocumentError(409, "prepared undo source changed");
        return;
      }
      if (proposal.status !== "ready") throw new CareerDocumentError(409, "prepared AI source changed");
      const metadata: Partial<CareerAiProposalDoc> = { status: "applied", progress: null, updatedAt: new Date() };
      if (intent.documentResult) {
        const receipt = intent.documentResult;
        const before = await db.careerDocumentSnapshots.findOne({ _id: receipt.beforeSnapshotId, userId: scope.userId, recordId: receipt.recordId }, { session: tx.session });
        const after = await db.careerDocumentSnapshots.findOne({ _id: receipt.afterSnapshotId, userId: scope.userId, recordId: receipt.recordId }, { session: tx.session });
        if (!before || !after) throw new CareerDocumentError(409, "prepared AI snapshots are missing");
        Object.assign(metadata, { beforeSnapshotId: receipt.beforeSnapshotId, afterSnapshotId: receipt.afterSnapshotId, revisionId: receipt.revisionId, appliedDocumentVersion: receipt.documentVersion, beforeChecksum: createHash("sha256").update(JSON.stringify(before.content)).digest("hex"), afterChecksum: createHash("sha256").update(JSON.stringify(after.content)).digest("hex") });
      }
      const changed = await db.careerAiProposals.updateOne({ ...careerProducerScopeFilter(scope), status: "ready" }, { $set: metadata }, { session: tx.session });
      if (!changed.matchedCount) throw new CareerDocumentError(409, "prepared AI finalization raced another operation");
    });
  }
  async prepareUndo(userId: string, recordId: string, raw: PrepareCareerAiProposalUndo): Promise<CareerProducerScope> {
    const input = PrepareCareerAiProposalUndoSchema.parse(raw);
    if (input.recordId !== recordId) throw new CareerDocumentError(404, "AI proposal not found");
    return inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId);
      const db = mongoCollections(tx.db);
      const proposal = await db.careerAiProposals.findOne({ _id: input.proposalId, userId, recordId, status: "applied" }, { session: tx.session });
      if (!proposal?.revisionId || !proposal.beforeSnapshotId || proposal.appliedDocumentVersion !== input.expectedDocumentVersion) throw new CareerDocumentError(409, "AI proposal undo is stale");
      const intent = createCareerProducerIntent({ producer: "ai-proposal", userId, sourceId: proposal._id, operationId: input.operationId, business: null, document: { kind: "restore", recordId, expectedVersion: input.expectedDocumentVersion, snapshotId: proposal.beforeSnapshotId, revisionId: proposal.revisionId, summary: "AI 변경 되돌리기" } });
      const prior = proposal.writerIntegration && validateCareerProducerIntent(proposal.writerIntegration);
      if (prior?.operationId === input.operationId) {
        if (prior.fingerprint !== intent.fingerprint) throw new CareerDocumentError(409, "prepared undo changed");
        return CareerProducerScopeSchema.parse(prior);
      }
      if (prior && (prior.state !== "completed" || prior.document?.kind === "restore")) throw new CareerDocumentError(409, "prepared AI operation has not completed");
      const record = await db.careerRecords.findOne({ _id: recordId, userId, deletedAt: null }, { session: tx.session });
      if (!record || (record.documentVersion ?? 0) !== input.expectedDocumentVersion) throw new CareerDocumentError(409, "AI proposal undo is stale");
      const filter = { _id: proposal._id, userId, recordId, status: "applied" as const, ...(prior ? { "writerIntegration.operationId": prior.operationId, "writerIntegration.state": "completed" } : { writerIntegration: { $exists: false } }) };
      const changed = await db.careerAiProposals.updateOne(filter, { $set: { writerIntegration: intent, updatedAt: new Date() }, ...(prior ? { $push: { writerIntegrationHistory: prior } } : {}) }, { session: tx.session });
      if (!changed.matchedCount) throw new CareerDocumentError(409, "prepared undo raced another operation");
      return CareerProducerScopeSchema.parse(intent);
    });
  }
  private async terminate(raw: CareerProducerScope, status: "cancelled" | "rejected"): Promise<void> {
    const scope = CareerProducerScopeSchema.parse(raw);
    if (scope.producer !== "ai-proposal") throw new CareerDocumentError(409, "AI producer scope is invalid");
    if (!this.coordinator) throw new CareerDocumentError(503, "prepared canonical coordinator is not configured");
    await this.coordinator.cancel(scope);
    await inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, scope.userId);
      const proposals = mongoCollections(tx.db).careerAiProposals;
      const row = await proposals.findOne(careerProducerScopeFilter(scope), { session: tx.session });
      if (!row || row.writerIntegration?.state !== "cancelled" || row.writerIntegration.businessResult || row.writerIntegration.documentResult || !["ready", status].includes(row.status)) throw new CareerDocumentError(409, "prepared AI cancellation raced owner");
      const result = await proposals.updateOne({ ...careerProducerScopeFilter(scope), "writerIntegration.state": "cancelled", "writerIntegration.businessResult": null, "writerIntegration.documentResult": null }, { $set: { status, progress: null, updatedAt: new Date() } }, { session: tx.session });
      if (!result.matchedCount) throw new CareerDocumentError(409, "prepared AI cancellation raced owner");
    });
  }
  cancel(scope: CareerProducerScope) { return this.terminate(scope, "cancelled"); }
  reject(scope: CareerProducerScope) { return this.terminate(scope, "rejected"); }
}