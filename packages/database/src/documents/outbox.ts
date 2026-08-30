// 최종 SQL 제약 목록을 대조해 확정한 MongoDB 저장 타입입니다. API 계약은 contracts에서 가져옵니다.
import type { JsonObject } from "./common.js";

export interface OutboxEventDoc {
  _id: string;
  userId?: string | null;
  topic: string;
  payload: JsonObject;
  idempotencyKey: string;
  state: "pending" | "publishing" | "published" | "dead_letter";
  attempts: number;
  availableAt: Date;
  lockedAt?: Date | null;
  publishedAt?: Date | null;
  lastError?: string | null;
  createdAt: Date;
  updatedAt: Date;
  leaseToken?: string | null;
  leaseUntil?: Date | null;
}
