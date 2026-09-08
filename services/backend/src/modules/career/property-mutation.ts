import { isDeepStrictEqual } from "node:util";

import { CareerPropertyValueV2Schema, type CareerProperties, type CareerPropertyDefinitionV2 } from "@expresso/contracts";
import { mongoCollections, type CareerCategoryDoc, type CareerRecordDoc } from "@expresso/database";
import type { Filter, UpdateFilter } from "mongodb";

import { inTransaction, type MongoTransaction } from "../../platform/mongo-transaction.js";
import type { MongoContext } from "../../platform/mongodb.js";
import { CareerError } from "./errors.js";
import { materializeLegacyTagOptions, toCanonicalPropertyValues } from "./properties.js";
import { convertCareerPropertyValue } from "./property-schema.js";

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
const BATCH_SIZE = 100;

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

function requireCurrentDefinition(
  category: CareerCategoryDoc,
  topic: CareerPropertyMutationTopic,
  payload: MutationPayload,
): CareerPropertyDefinitionV2 {
  const definition = category.propertySchemaV2?.find((item) => item.id === payload.propertyId);
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
  if (topic === "career.property-default") filter[`properties.${payload.propertyKey}`] = { $exists: false };
  if (topic === "career.property-deletion" || topic === "career.property-conversion") filter[`properties.${payload.propertyKey}`] = { $exists: true };
  if (topic === "career.property-restoration") filter[`propertyValueTombstones.${payload.propertyId}`] = { $exists: true };
  return filter;
}

function nextProperties(topic: CareerPropertyMutationTopic, payload: MutationPayload, row: CareerRecordDoc): CareerProperties {
  if (topic === "career.property-default") {
    return { ...row.properties, [payload.propertyKey]: (payload as DefaultPayload).defaultValue as CareerProperties[string] };
  }
  if (topic === "career.property-deletion") {
    const properties = { ...row.properties };
    delete properties[payload.propertyKey];
    return properties;
  }
  if (topic === "career.property-restoration") {
    const value = row.propertyValueTombstones?.[payload.propertyId];
    if (value === undefined || value === null) throw new CareerError(409, "복원할 PropertyValue가 없습니다");
    return { ...row.properties, [payload.propertyKey]: value as CareerProperties[string] };
  }

  const conversion = payload as ConversionPayload;
  const current = row.properties[payload.propertyKey];
  const parsed = CareerPropertyValueV2Schema.safeParse(current);
  if (parsed.success && parsed.data.type === conversion.targetType) return row.properties;
  const result = convertCareerPropertyValue(current, conversion.sourceType, conversion.targetType);
  if (result.kind === "unmapped") throw new CareerError(409, "지연 변경 중 변환할 수 없는 PropertyValue를 발견했습니다");
  if (result.kind === "lossy" && !conversion.allowLossy) throw new CareerError(409, "손실 가능한 지연 Property 변경에는 확인이 필요합니다");
  const stored = parsed.success ? result.value : { type: conversion.targetType, value: result.value };
  return { ...row.properties, [payload.propertyKey]: stored as CareerProperties[string] };
}

export class MongoCareerPropertyMutationService {
  constructor(private readonly context: MongoContext) {}

  async run(topic: CareerPropertyMutationTopic, input: unknown): Promise<{ processed: number }> {
    const payload = parsePayload(topic, input);
    let afterId: string | null = null;
    let processed = 0;
    while (true) {
      const batch = await inTransaction(this.context, (tx) => this.runBatch(tx, topic, payload, afterId));
      processed += batch.processed;
      if (!batch.afterId) return { processed };
      afterId = batch.afterId;
    }
  }

  private async runBatch(
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
    requireCurrentDefinition(category, topic, payload);

    const rows = await db.careerRecords.find(queryFor(topic, payload, afterId), { session: tx.session })
      .sort({ _id: 1 })
      .limit(BATCH_SIZE)
      .toArray();
    if (rows.length === 0) return { processed: 0, afterId: null };

    const prepared = rows.map((row) => {
      const properties = nextProperties(topic, payload, row);
      const propertyValues = toCanonicalPropertyValues(category, properties);
      return { row, properties, propertyValues };
    });
    const changed = prepared.filter(({ row, properties, propertyValues }) =>
      !isDeepStrictEqual(row.properties, properties) || !isDeepStrictEqual(row.propertyValues ?? [], propertyValues));
    await materializeLegacyTagOptions(tx, tx.session, category, changed.map((item) => item.properties));

    if (changed.length > 0) {
      const result = await db.careerRecords.bulkWrite(changed.map(({ row, properties, propertyValues }) => {
        const update: UpdateFilter<CareerRecordDoc> = {
          $set: { properties, propertyValues, updatedAt: new Date() },
          $inc: { version: 1 },
        };
        if (topic === "career.property-deletion") {
          update.$set![`propertyValueTombstones.${payload.propertyId}`] = row.properties[payload.propertyKey];
        }
        if (topic === "career.property-restoration") update.$unset = { [`propertyValueTombstones.${payload.propertyId}`]: "" };
        return { updateOne: { filter: { _id: row._id, userId: payload.userId, version: row.version }, update } };
      }), { session: tx.session });
      if (result.matchedCount !== changed.length) throw new CareerError(409, "지연 Property 변경 중 Record version 충돌이 발생했습니다");
    }
    return { processed: changed.length, afterId: rows.length === BATCH_SIZE ? rows.at(-1)!._id : null };
  }
}
