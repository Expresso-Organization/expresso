import { isDeepStrictEqual } from "node:util";
import { createHash, randomUUID } from "node:crypto";

import { CareerPropertyValueV2Schema, type CareerPropertyDefinitionV2 } from "@expresso/contracts";
import { mongoCollections, type CareerCategoryDoc, type CareerPropertyMutationDoc, type CareerRecordDoc } from "@expresso/database";
import type { Filter, UpdateFilter } from "mongodb";

import { inTransaction, type MongoTransaction } from "../../platform/mongo-transaction.js";
import type { MongoContext } from "../../platform/mongodb.js";
import { CareerError } from "./errors.js";
import { careerCategoryDefinitions, materializeLegacyTagOptions } from "./properties.js";
import { convertCareerPropertyValue, propertyPresenceFilter, propertyMutationInput, propertyMutationWrite, propertyMutationTombstone } from "./property-schema.js";
import { PROPERTY_MUTATION_FINGERPRINT_VERSION, propertyMutationOperationFingerprint, propertySemanticFingerprint } from "./property-mutation-state.js";

export type CareerPropertyMutationTopic =
  | "career.property-conversion"
  | "career.property-default"
  | "career.property-deletion"
  | "career.property-restoration";

interface CommonPayload {
  userId: string;
  categoryId: string;
  propertyId: string;
  propertyKey: string;
  definitionVersion: number;
}

interface ConversionPayload extends CommonPayload {
  sourceType: string;
  targetType: string;
  allowLossy: boolean;
}

interface DefaultPayload extends CommonPayload {
  defaultValue: unknown;
}

type MutationPayload = CommonPayload | ConversionPayload | DefaultPayload;
interface DurableDelivery {
  mutationId: string;
  semanticFingerprintVersion: number;
  semanticFingerprint: string;
  operationFingerprint: string;
}
const BATCH_SIZE = 100;
const LEASE_MS = 30_000;

function requireString(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  if (typeof value !== "string" || value.length === 0) throw new Error(`career property mutation payload의 ${key}가 올바르지 않습니다`);
  return value;
}

function parsePayload(topic: CareerPropertyMutationTopic, input: unknown): MutationPayload {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("career property mutation payload가 올바르지 않습니다");
  const payload = input as Record<string, unknown>;
  const definitionVersion = payload.definitionVersion;
  if (!Number.isInteger(definitionVersion) || (definitionVersion as number) < 1) throw new Error("career property mutation payload의 definitionVersion이 올바르지 않습니다");
  const common: CommonPayload = {
    userId: requireString(payload, "userId"),
    categoryId: requireString(payload, "categoryId"),
    propertyId: requireString(payload, "propertyId"),
    propertyKey: requireString(payload, "propertyKey"),
    definitionVersion: definitionVersion as number,
  };
  if (topic === "career.property-conversion") {
    if (typeof payload.allowLossy !== "boolean") throw new Error("career property mutation payload의 allowLossy가 올바르지 않습니다");
    return { ...common, sourceType: requireString(payload, "sourceType"), targetType: requireString(payload, "targetType"), allowLossy: payload.allowLossy };
  }
  if (topic === "career.property-default") {
    const parsed = CareerPropertyValueV2Schema.safeParse(payload.defaultValue);
    if (!parsed.success) throw new Error("career property mutation payload의 defaultValue가 올바르지 않습니다");
    return { ...common, defaultValue: parsed.data };
  }
  return common;
}

function parseDurableDelivery(input: unknown): DurableDelivery | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const payload = input as Record<string, unknown>;
  const durableFields = ["mutationId", "semanticFingerprintVersion", "semanticFingerprint", "operationFingerprint"];
  if (!durableFields.some((field) => field in payload)) return null;
  if (typeof payload.mutationId !== "string"
    || payload.semanticFingerprintVersion !== PROPERTY_MUTATION_FINGERPRINT_VERSION
    || typeof payload.semanticFingerprint !== "string"
    || !/^[a-f0-9]{64}$/.test(payload.semanticFingerprint)
    || typeof payload.operationFingerprint !== "string"
    || !/^[a-f0-9]{64}$/.test(payload.operationFingerprint)) {
    throw new Error("career property mutation delivery가 올바르지 않습니다");
  }
  return {
    mutationId: payload.mutationId,
    semanticFingerprintVersion: payload.semanticFingerprintVersion,
    semanticFingerprint: payload.semanticFingerprint,
    operationFingerprint: payload.operationFingerprint,
  };
}

function payloadFromState(state: CareerPropertyMutationDoc): MutationPayload {
  const common: CommonPayload = {
    userId: state.userId,
    categoryId: state.categoryId,
    propertyId: state.propertyId,
    propertyKey: state.propertyKey,
    definitionVersion: 1,
  };
  const operation = state.operationPayload;
  if (state.kind === "career.property-conversion") {
    if (typeof operation.sourceType !== "string" || typeof operation.targetType !== "string" || typeof operation.allowLossy !== "boolean") {
      throw new CareerError(409, "지연 Property 변경의 immutable plan이 올바르지 않습니다");
    }
    return { ...common, sourceType: operation.sourceType, targetType: operation.targetType, allowLossy: operation.allowLossy };
  }
  if (state.kind === "career.property-default") {
    const parsed = CareerPropertyValueV2Schema.safeParse(operation.defaultValue);
    if (!parsed.success) throw new CareerError(409, "지연 Property 변경의 defaultValue plan이 올바르지 않습니다");
    return { ...common, defaultValue: parsed.data };
  }
  return common;
}

function requireCurrentDefinition(
  category: CareerCategoryDoc,
  topic: CareerPropertyMutationTopic,
  payload: MutationPayload,
): CareerPropertyDefinitionV2 {
  const definition = careerCategoryDefinitions(category).find((item) => item.id === payload.propertyId);
  if (!definition || definition.key !== payload.propertyKey || definition.version !== payload.definitionVersion) {
    throw new CareerError(409, "지연 Property 변경의 Definition이 현재 Category와 일치하지 않습니다");
  }
  if (topic === "career.property-deletion" ? definition.deletedAt === null : definition.deletedAt !== null) {
    throw new CareerError(409, "지연 Property 변경의 삭제 상태가 현재 Category와 일치하지 않습니다");
  }
  if (topic === "career.property-conversion" && definition.type !== (payload as ConversionPayload).targetType) {
    throw new CareerError(409, "지연 Property 타입 변경 대상이 현재 Category와 일치하지 않습니다");
  }
  return definition;
}

function queryFor(topic: CareerPropertyMutationTopic, payload: MutationPayload, afterId: string | null): Filter<CareerRecordDoc> {
  const filter: Filter<CareerRecordDoc> = {
    userId: payload.userId,
    categoryId: payload.categoryId,
    deletedAt: null,
    ...(afterId ? { _id: { $gt: afterId } } : {}),
  };
  if (topic === "career.property-default") Object.assign(filter, propertyPresenceFilter(payload.propertyId, payload.propertyKey, false));
  if (topic === "career.property-deletion" || topic === "career.property-conversion") Object.assign(filter, propertyPresenceFilter(payload.propertyId, payload.propertyKey));
  if (topic === "career.property-restoration") filter[`propertyValueTombstones.${payload.propertyId}`] = { $exists: true };
  return filter;
}

function nextValue(topic: CareerPropertyMutationTopic, payload: MutationPayload, row: CareerRecordDoc, category: CareerCategoryDoc, definition: CareerPropertyDefinitionV2): unknown {
  if (topic === "career.property-default") return (payload as DefaultPayload).defaultValue;
  if (topic === "career.property-deletion") return null;
  if (topic === "career.property-restoration") {
    const value = row.propertyValueTombstones?.[payload.propertyId];
    if (value === undefined || value === null) throw new CareerError(409, "복원할 PropertyValue가 없습니다");
    return value;
  }
  const conversion = payload as ConversionPayload;
  const currentValue = propertyMutationInput(category, row, { ...definition, type: conversion.sourceType as CareerPropertyDefinitionV2["type"] });
  const parsed = CareerPropertyValueV2Schema.safeParse(currentValue);
  if (parsed.success && parsed.data.type === conversion.targetType) return currentValue;
  const result = convertCareerPropertyValue(currentValue, conversion.sourceType, conversion.targetType);
  if (result.kind === "unmapped") throw new CareerError(409, "지연 변경 중 변환할 수 없는 PropertyValue를 발견했습니다");
  if (result.kind === "lossy" && !conversion.allowLossy) throw new CareerError(409, "손실 가능한 지연 Property 변경에는 확인이 필요합니다");
  return parsed.success ? result.value : { type: conversion.targetType, value: result.value };
}

export class MongoCareerPropertyMutationService {
  constructor(private readonly context: MongoContext) {}

  async run(topic: CareerPropertyMutationTopic, input: unknown): Promise<{ processed: number }> {
    const durable = parseDurableDelivery(input);
    if (durable) return this.runDurable(topic, durable);
    const payload = parsePayload(topic, input);
    let afterId: string | null = null;
    let processed = 0;
    while (true) {
      const batch = await inTransaction(this.context, (tx) => this.runLegacyBatch(tx, topic, payload, afterId));
      processed += batch.processed;
      if (!batch.afterId) return { processed };
      afterId = batch.afterId;
    }
  }

  async resume(mutationId: string, userId: string): Promise<{ processed: number }> {
    const result = await mongoCollections(this.context.db).careerPropertyMutations.updateOne(
      { _id: mutationId, mutationId, userId, status: "failed", active: true },
      { $set: { status: "pending", leaseToken: null, leaseExpiresAt: null, lastError: null, updatedAt: new Date() } },
    );
    if (result.modifiedCount !== 1) {
      const current = await mongoCollections(this.context.db).careerPropertyMutations.findOne({ _id: mutationId, mutationId, userId });
      if (current?.status !== "pending" || !current.active) throw new CareerError(409, "resume할 failed Property mutation을 찾을 수 없습니다");
    }
    return this.runFromAuthoritativeState(mutationId, userId);
  }

  async reconcile(mutationId: string, userId: string): Promise<{ processed: number }> {
    const now = new Date();
    const result = await mongoCollections(this.context.db).careerPropertyMutations.updateOne(
      {
        _id: mutationId,
        mutationId,
        userId,
        active: true,
        $or: [
          { status: "failed" },
          { status: "running", leaseExpiresAt: { $lte: now } },
        ],
      },
      { $set: { status: "pending", leaseToken: null, leaseExpiresAt: null, lastError: null, updatedAt: now } },
    );
    if (result.modifiedCount !== 1) {
      const current = await mongoCollections(this.context.db).careerPropertyMutations.findOne({ _id: mutationId, mutationId, userId });
      if (current?.status !== "pending" || !current.active) throw new CareerError(409, "reconcile할 Property mutation 상태가 올바르지 않습니다");
    }
    return this.runFromAuthoritativeState(mutationId, userId);
  }

  private async runFromAuthoritativeState(mutationId: string, userId: string): Promise<{ processed: number }> {
    const state = await mongoCollections(this.context.db).careerPropertyMutations.findOne({ _id: mutationId, mutationId, userId });
    if (!state) throw new CareerError(409, "재개할 Property mutation state를 찾을 수 없습니다");
    return this.runDurable(state.kind, {
      mutationId: state.mutationId,
      semanticFingerprintVersion: state.semanticFingerprintVersion,
      semanticFingerprint: state.semanticFingerprint,
      operationFingerprint: state.operationFingerprint,
    });
  }

  async cancel(mutationId: string, userId: string): Promise<void> {
    await this.finishWithoutExecution(mutationId, userId, "cancelled");
  }

  async supersede(mutationId: string, userId: string): Promise<void> {
    await this.finishWithoutExecution(mutationId, userId, "superseded");
  }

  private async finishWithoutExecution(mutationId: string, userId: string, status: "cancelled" | "superseded"): Promise<void> {
    const result = await mongoCollections(this.context.db).careerPropertyMutations.updateOne(
      { _id: mutationId, mutationId, userId, status: { $in: ["pending", "failed"] }, active: true },
      { $set: { status, active: false, leaseToken: null, leaseExpiresAt: null, completedAt: new Date(), updatedAt: new Date() } },
    );
    if (result.modifiedCount !== 1) throw new CareerError(409, `${status}로 전환할 Property mutation 상태가 올바르지 않습니다`);
  }

  private async runDurable(topic: CareerPropertyMutationTopic, delivery: DurableDelivery): Promise<{ processed: number }> {
    const states = mongoCollections(this.context.db).careerPropertyMutations;
    const existing = await states.findOne({ _id: delivery.mutationId, mutationId: delivery.mutationId });
    if (!existing || existing.kind !== topic
      || existing.semanticFingerprintVersion !== delivery.semanticFingerprintVersion
      || existing.semanticFingerprint !== delivery.semanticFingerprint
      || existing.operationFingerprint !== delivery.operationFingerprint
      || propertyMutationOperationFingerprint(existing.operationPayload) !== existing.operationFingerprint) {
      throw new CareerError(409, "지연 Property mutation delivery와 authoritative state가 일치하지 않습니다");
    }
    if (existing.status === "completed") return { processed: 0 };
    if (existing.status === "cancelled" || existing.status === "superseded" || existing.status === "failed") {
      throw new CareerError(409, "지연 Property mutation은 명시적인 상태 전환이 필요합니다");
    }

    const leaseToken = randomUUID();
    const now = new Date();
    const acquired = await states.findOneAndUpdate(
      {
        _id: delivery.mutationId,
        mutationId: delivery.mutationId,
        semanticFingerprint: delivery.semanticFingerprint,
        active: true,
        $or: [
          { status: "pending" },
          { status: "running", leaseExpiresAt: { $lte: now } },
        ],
      },
      {
        $set: { status: "running", leaseToken, leaseExpiresAt: new Date(now.getTime() + LEASE_MS), updatedAt: now },
        $inc: { attempts: 1 },
      },
      { returnDocument: "after" },
    );
    if (!acquired) {
      const current = await states.findOne({ _id: delivery.mutationId });
      if (current?.status === "completed") return { processed: 0 };
      throw new CareerError(409, "지연 Property mutation lease를 획득할 수 없습니다");
    }

    let processed = 0;
    try {
      while (true) {
        const batch = await inTransaction(this.context, (tx) => this.runDurableBatch(tx, acquired.kind, acquired.mutationId, leaseToken));
        processed += batch.processed;
        if (batch.completed) return { processed };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await states.updateOne(
        {
          _id: acquired.mutationId,
          mutationId: acquired.mutationId,
          status: "running",
          active: true,
          leaseToken,
          semanticFingerprint: acquired.semanticFingerprint,
        },
        {
          $set: {
            status: "failed",
            lastError: { reason: "mutation_failed", digest: createHash("sha256").update(message).digest("hex").slice(0, 16), at: new Date().toISOString() },
            leaseToken: null,
            leaseExpiresAt: null,
            updatedAt: new Date(),
          },
        },
      );
      throw error;
    }
  }

  private async runDurableBatch(
    tx: MongoTransaction,
    topic: CareerPropertyMutationTopic,
    mutationId: string,
    leaseToken: string,
  ): Promise<{ processed: number; completed: boolean }> {
    const db = mongoCollections(tx.db);
    const state = await db.careerPropertyMutations.findOne({
      _id: mutationId,
      mutationId,
      status: "running",
      active: true,
      leaseToken,
    }, { session: tx.session });
    if (!state) throw new CareerError(409, "지연 Property mutation lease fencing에 실패했습니다");
    const payload = payloadFromState(state);
    const category = await db.careerCategories.findOne(
      { _id: state.categoryId, userId: state.userId, isSystem: false },
      { session: tx.session },
    );
    if (!category) throw new CareerError(404, "지연 Property 변경의 Category를 찾을 수 없습니다");
    const definition = careerCategoryDefinitions(category).find((item) => item.id === state.propertyId);
    if (!definition || definition.key !== state.propertyKey || propertySemanticFingerprint(definition) !== state.semanticFingerprint) {
      throw new CareerError(409, "지연 Property 변경의 semantic fingerprint가 현재 Category와 일치하지 않습니다");
    }

    const rows = await db.careerRecords.find(queryFor(topic, payload, state.cursor), { session: tx.session })
      .sort({ _id: 1 })
      .limit(BATCH_SIZE)
      .toArray();
    const prepared = rows.map((row) => {
      if (topic === "career.property-conversion" && row.propertyValues?.some(value => value.propertyDefinitionId === payload.propertyId && value.type === (payload as ConversionPayload).targetType)) {
        return { row, properties: row.properties, propertyValues: row.propertyValues };
      }
      return { row, ...propertyMutationWrite(category, row, definition, nextValue(topic, payload, row, category, definition)) };
    });
    const changed = prepared.filter(({ row, properties, propertyValues }) =>
      !isDeepStrictEqual(row.properties, properties) || !isDeepStrictEqual(row.propertyValues ?? [], propertyValues));
    await materializeLegacyTagOptions(tx, tx.session, category, changed.map((item) => item.row.propertyValues === undefined ? item.properties : {}));
    if (changed.length > 0) {
      const result = await db.careerRecords.bulkWrite(changed.map(({ row, properties, propertyValues }) => {
        const update: UpdateFilter<CareerRecordDoc> = {
          $set: { properties, propertyValues, updatedAt: new Date() },
          $inc: { version: 1 },
        };
        if (topic === "career.property-deletion") update.$set![`propertyValueTombstones.${payload.propertyId}`] = propertyMutationTombstone(row, definition);
        if (topic === "career.property-restoration") update.$unset = { [`propertyValueTombstones.${payload.propertyId}`]: "" };
        return { updateOne: { filter: { _id: row._id, userId: payload.userId, version: row.version }, update } };
      }), { session: tx.session });
      if (result.matchedCount !== changed.length) throw new CareerError(409, "지연 Property 변경 중 Record version 충돌이 발생했습니다");
    }

    const completed = rows.length < BATCH_SIZE;
    const nextCursor = rows.at(-1)?._id ?? state.cursor;
    const updated = await db.careerPropertyMutations.updateOne(
      {
        _id: mutationId,
        mutationId,
        status: "running",
        active: true,
        leaseToken,
        semanticFingerprint: state.semanticFingerprint,
      },
      {
        $set: {
          cursor: nextCursor,
          status: completed ? "completed" : "running",
          active: !completed,
          leaseToken: completed ? null : leaseToken,
          leaseExpiresAt: completed ? null : new Date(Date.now() + LEASE_MS),
          completedAt: completed ? new Date() : null,
          updatedAt: new Date(),
        },
        $inc: { processedCount: rows.length },
      },
      { session: tx.session },
    );
    if (updated.modifiedCount !== 1) throw new CareerError(409, "지연 Property mutation progress CAS에 실패했습니다");
    return { processed: changed.length, completed };
  }

  private async runLegacyBatch(
    tx: MongoTransaction,
    topic: CareerPropertyMutationTopic,
    payload: MutationPayload,
    afterId: string | null,
  ): Promise<{ processed: number; afterId: string | null }> {
    const db = mongoCollections(tx.db);
    const category = await db.careerCategories.findOne(
      { _id: payload.categoryId, userId: payload.userId, isSystem: false },
      { session: tx.session },
    );
    if (!category) throw new CareerError(404, "지연 Property 변경의 Category를 찾을 수 없습니다");
    const definition = requireCurrentDefinition(category, topic, payload);

    const rows = await db.careerRecords.find(queryFor(topic, payload, afterId), { session: tx.session })
      .sort({ _id: 1 })
      .limit(BATCH_SIZE)
      .toArray();
    if (rows.length === 0) return { processed: 0, afterId: null };

    const prepared = rows.map((row) => {
      // 이미 변환된 canonical 항목은 재전달에서도 BSON과 version을 그대로 보존합니다.
      if (topic === "career.property-conversion" && row.propertyValues?.some(value => value.propertyDefinitionId === payload.propertyId && value.type === (payload as ConversionPayload).targetType)) {
        return { row, properties: row.properties, propertyValues: row.propertyValues };
      }
      return { row, ...propertyMutationWrite(category, row, definition, nextValue(topic, payload, row, category, definition)) };
    });
    const changed = prepared.filter(({ row, properties, propertyValues }) =>
      !isDeepStrictEqual(row.properties, properties) || !isDeepStrictEqual(row.propertyValues ?? [], propertyValues));
    await materializeLegacyTagOptions(tx, tx.session, category, changed.map((item) => item.row.propertyValues === undefined ? item.properties : {}));

    if (changed.length > 0) {
      const result = await db.careerRecords.bulkWrite(changed.map(({ row, properties, propertyValues }) => {
        const update: UpdateFilter<CareerRecordDoc> = {
          $set: { properties, propertyValues, updatedAt: new Date() },
          $inc: { version: 1 },
        };
        if (topic === "career.property-deletion") {
          update.$set![`propertyValueTombstones.${payload.propertyId}`] = propertyMutationTombstone(row, definition);
        }
        if (topic === "career.property-restoration") update.$unset = { [`propertyValueTombstones.${payload.propertyId}`]: "" };
        return { updateOne: { filter: { _id: row._id, userId: payload.userId, version: row.version }, update } };
      }), { session: tx.session });
      if (result.matchedCount !== changed.length) throw new CareerError(409, "지연 Property 변경 중 Record version 충돌이 발생했습니다");
    }
    return { processed: changed.length, afterId: rows.length === BATCH_SIZE ? rows.at(-1)!._id : null };
  }
}
