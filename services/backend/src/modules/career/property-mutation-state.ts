import { createHash, randomUUID } from "node:crypto";

import type { CareerPropertyDefinitionV2 } from "@expresso/contracts";
import { mongoCollections, type CareerPropertyMutationDoc } from "@expresso/database";
import type { Document } from "mongodb";

import { addMongoOutboxEvent } from "../../platform/mongo-outbox.js";
import type { MongoTransaction } from "../../platform/mongo-transaction.js";
import { CareerError } from "./errors.js";

export const PROPERTY_MUTATION_FINGERPRINT_VERSION = 1;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function propertyMutationOperationFingerprint(operationPayload: unknown): string {
  return createHash("sha256").update(canonical(operationPayload)).digest("hex");
}

/** 이름·표시 순서·definitionVersion은 실행 의미가 아니므로 fingerprint에서 제외합니다. */
export function propertySemanticFingerprint(definition: CareerPropertyDefinitionV2): string {
  return createHash("sha256").update(canonical({
    id: definition.id,
    key: definition.key,
    type: definition.type,
    required: definition.required,
    system: definition.system,
    config: definition.config,
    deletedAt: definition.deletedAt,
  })).digest("hex");
}

export function propertyMutationLockKey(userId: string, categoryId: string, propertyId: string): string {
  return `${userId}:${categoryId}:${propertyId}`;
}

export async function requireNoActivePropertyMutation(
  tx: MongoTransaction,
  userId: string,
  categoryId: string,
  propertyId: string,
): Promise<void> {
  const active = await mongoCollections(tx.db).careerPropertyMutations.findOne(
    { lockKey: propertyMutationLockKey(userId, categoryId, propertyId), active: true },
    { session: tx.session, projection: { _id: 1 } },
  );
  if (active) throw new CareerError(409, "진행 중인 지연 Property 변경이 있습니다");
}

export async function enqueueDeferredPropertyMutation(
  tx: MongoTransaction,
  topic: CareerPropertyMutationDoc["kind"],
  userId: string,
  categoryId: string,
  definition: CareerPropertyDefinitionV2,
  operationPayload: Document,
  idempotencyKey: string,
): Promise<void> {
  const mutationId = randomUUID();
  const semanticFingerprint = propertySemanticFingerprint(definition);
  const immutablePlan = {
    ...operationPayload,
    definition: {
      id: definition.id,
      key: definition.key,
      type: definition.type,
      required: definition.required,
      system: definition.system,
      config: definition.config as never,
      deletedAt: definition.deletedAt,
    },
  };
  const operationFingerprint = propertyMutationOperationFingerprint(immutablePlan);
  const now = new Date();
  const state: CareerPropertyMutationDoc = {
    _id: mutationId,
    mutationId,
    kind: topic,
    userId,
    categoryId,
    propertyId: definition.id,
    propertyKey: definition.key,
    lockKey: propertyMutationLockKey(userId, categoryId, definition.id),
    semanticFingerprintVersion: PROPERTY_MUTATION_FINGERPRINT_VERSION,
    semanticFingerprint,
    operationFingerprint,
    operationPayload: immutablePlan,
    status: "pending",
    active: true,
    cursor: null,
    processedCount: 0,
    attempts: 0,
    lastError: null,
    leaseToken: null,
    leaseExpiresAt: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
  try {
    await mongoCollections(tx.db).careerPropertyMutations.insertOne(state, { session: tx.session });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) throw new CareerError(409, "진행 중인 지연 Property 변경이 있습니다");
    throw error;
  }
  await addMongoOutboxEvent(tx, {
    userId,
    topic,
    idempotencyKey,
    payload: {
      ...operationPayload,
      mutationId,
      semanticFingerprintVersion: PROPERTY_MUTATION_FINGERPRINT_VERSION,
      semanticFingerprint,
      operationFingerprint,
      userId,
      categoryId,
      propertyId: definition.id,
      propertyKey: definition.key,
    },
  });
}
