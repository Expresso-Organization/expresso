import { createHash, randomUUID } from "node:crypto";

import { mongoCollections } from "@expresso/database";
import { BSON, Binary } from "mongodb";

import type { MongoContext } from "./mongodb.js";
import type { MongoTransaction } from "./mongo-transaction.js";

const INLINE_LIMIT = 8 * 1024 * 1024;
const CHUNK_SIZE = 1024 * 1024;

export type SnapshotRef =
  | { kind: "inline"; value: Record<string, unknown> }
  | { kind: "chunks"; payloadId: string; parts: number; sha256: string };

/** 전환 전 inline snapshot도 같은 읽기 경로로 통과시킵니다. */
export function snapshotRefFromStored(value: Record<string, unknown>): SnapshotRef {
  if (value.kind === "inline" && value.value && typeof value.value === "object" && !Array.isArray(value.value)) return value as SnapshotRef;
  if (value.kind === "chunks" && typeof value.payloadId === "string" && typeof value.parts === "number" && typeof value.sha256 === "string") return value as SnapshotRef;
  return { kind: "inline", value };
}

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** BSON 8 MiB 미만은 바로, 그 이상은 불변 1 MiB 조각으로 저장합니다. */
export async function writeSnapshot(
  tx: MongoTransaction,
  userId: string,
  value: Record<string, unknown>,
): Promise<SnapshotRef> {
  if (BSON.calculateObjectSize(value) < INLINE_LIMIT) return { kind: "inline", value };
  const bytes = Buffer.from(JSON.stringify(value), "utf8");
  const payloadId = randomUUID();
  const chunks = [];
  for (let offset = 0, part = 0; offset < bytes.length; offset += CHUNK_SIZE, part += 1) {
    const chunk = bytes.subarray(offset, Math.min(offset + CHUNK_SIZE, bytes.length));
    chunks.push({
      _id: randomUUID(), payloadId, userId, part,
      bytes: new Binary(chunk), sha256: digest(chunk),
    });
  }
  await mongoCollections(tx.db).snapshotChunks.insertMany(chunks, { session: tx.session });
  return { kind: "chunks", payloadId, parts: chunks.length, sha256: digest(bytes) };
}

/** 조각이 하나라도 다르면 부분 JSON을 반환하지 않고 전체 읽기를 실패시킵니다. */
export async function readSnapshot(
  context: MongoContext | MongoTransaction,
  ref: SnapshotRef,
): Promise<Record<string, unknown>> {
  if (ref.kind === "inline") return ref.value;
  const options = "session" in context ? { session: context.session } : {};
  const chunks = await mongoCollections(context.db).snapshotChunks
    .find({ payloadId: ref.payloadId }, options).sort({ part: 1 }).toArray();
  if (chunks.length !== ref.parts || chunks.some((chunk, index) => chunk.part !== index)) {
    throw new Error("snapshot payload is incomplete");
  }
  const parts = chunks.map((chunk) => {
    const bytes = Buffer.from(chunk.bytes.buffer);
    if (digest(bytes) !== chunk.sha256) throw new Error("snapshot chunk checksum mismatch");
    return bytes;
  });
  const bytes = Buffer.concat(parts);
  if (digest(bytes) !== ref.sha256) throw new Error("snapshot payload checksum mismatch");
  const parsed: unknown = JSON.parse(bytes.toString("utf8"));
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error("snapshot payload is not an object");
  return parsed as Record<string, unknown>;
}

export async function deleteSnapshotPayload(tx: MongoTransaction, userId: string, ref: SnapshotRef): Promise<void> {
  if (ref.kind === "chunks") {
    await mongoCollections(tx.db).snapshotChunks.deleteMany({ userId, payloadId: ref.payloadId }, { session: tx.session });
  }
}
