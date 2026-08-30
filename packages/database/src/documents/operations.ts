// 최종 SQL 제약 목록을 대조해 확정한 MongoDB 저장 타입입니다. API 계약은 contracts에서 가져옵니다.
import type { Binary } from "mongodb";
import type { JsonObject } from "./common.js";

export interface AccountDeletionRequestDoc {
  _id: string;
  userId?: string | null;
  subjectId: string;
  status: "pending" | "cancelled" | "purged";
  requestedAt: Date;
  purgeAfter: Date;
  cancelledAt?: Date | null;
  purgedAt?: Date | null;
  cancellationTokenHash: string;
  restoration: JsonObject;
  phase: string;
}

export interface AccountDeletionEventDoc {
  _id: string;
  requestId: string;
  phase: string;
  affectedRows: number;
  occurredAt: Date;
}

export interface ScheduledJobDefinitionDoc {
  _id: "saved_searches" | "expire_postings" | "notification_batch" | "analytics_daily" | "deletion_grace" | "retention" | "job_ingest" | "posting_facts";
  intervalSeconds: number;
  nextRunAt: Date;
  lastStartedAt?: Date | null;
  lastFinishedAt?: Date | null;
  lastStatus?: "succeeded" | "failed" | null;
  failureCount: number;
}

export interface ScheduledJobRunDoc {
  _id: string;
  jobKey: string;
  scheduledFor: Date;
  status: "queued" | "running" | "succeeded" | "failed";
  attempts: number;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  lastError?: string | null;
  result?: JsonObject | null;
  createdAt: Date;
}

export interface SchemaMigrationDoc {
  _id: string;
  name: string;
  checksum: string;
  state: "applying" | "applied";
  completedSteps: string[];
  appliedAt?: Date;
}

export interface MigrationLockDoc {
  _id: string;
  owner: string;
  token: string;
  expiresAt: Date;
}

export interface SnapshotChunkDoc {
  _id: string;
  payloadId: string;
  userId: string;
  part: number;
  bytes: Binary;
  sha256: string;
}

export interface AnalyticsRateLimitDoc {
  _id: string;
  visitorHash: string;
  targetId: string;
  period: string;
  count: number;
  expiresAt: Date;
}

export interface ImportRunDoc {
  _id: string;
  schemaHash: string;
  tables: JsonObject;
  validation: JsonObject;
  completed: boolean;
}

export interface ImportCheckpointDoc {
  _id: string;
  runId: string;
  tableName: string;
  lastKey?: string;
  processedCount: number;
}
