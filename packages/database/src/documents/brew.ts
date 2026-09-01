// 최종 SQL 제약 목록을 대조해 확정한 MongoDB 저장 타입입니다. API 계약은 contracts에서 가져옵니다.
import type { Decimal128 } from "mongodb";
import type { JsonValue, JsonObject } from "./common.js";

export interface JobAnalysisDoc {
  _id: string;
  userId: string;
  jobPostingId?: string | null;
  inputType: "url" | "paste" | "file" | "board" | "free";
  status: "queued" | "running" | "done" | "failed";
  attachments: JsonValue[];
  analyzedAt?: Date | null;
  inputIdempotencyKey?: string | null;
  inputRequestHash?: string | null;
  progressStage: "queued" | "extracting" | "validating" | "covering" | "done" | "failed";
  attempts: number;
  resultVersion: number;
  targetVersion: number;
  failureCode?: string | null;
  failureRetryable?: boolean | null;
  history?: JobAnalysisHistoryDoc | null;
}

export interface BrewDoc {
  referenceVersion?: number;
  _id: string;
  userId: string;
  jobAnalysisId: string;
  freeTitle?: string | null;
  freeBrief?: string | null;
  mode: "solo" | "collab";
  lengthPreset: "single" | "double" | "triple";
  status: "draft" | "interviewing" | "recipe" | "generating" | "done";
  deadlineAt?: Date | null;
  resumedAt?: Date | null;
  /** 고른 디자인 판. 고르기 전에는 없다. */
  designSystemRevisionId?: string | null;
  /** 고른 시점의 참고 잠금 스냅숏. 판이 바뀌어도 만들던 것은 그대로 둔다. */
  referenceLockSnapshot?: unknown;
  designStyleOverrides?: unknown;
  designSelectedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface BrewJobDoc {
  _id: string;
  userId: string;
  type: "interview" | "recipe";
  status: "queued" | "running" | "succeeded" | "failed";
  stage: string;
  attempts: number;
  input: JsonObject;
  resultId?: string | null;
  errorCode?: string | null;
  failureRetryable?: boolean | null;
  inputIdempotencyKey?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface BrewSourceDoc {
  _id: string;
  userId: string;
  brewId: string;
  recordId: string;
  rank: number;
  selectedBy: "auto" | "user";
  excludedReason?: string | null;
  score: number;
  reasonText: string;
  isSelected: boolean;
  updatedAt: Date;
}

export interface CompanyResearchItemDoc {
  _id: string;
  userId: string;
  companyId: string;
  kind: "fact" | "signal";
  topic: string;
  statement: string;
  sourceUrl?: string | null;
  publishedAt?: Date | null;
  capturedAt: Date;
  confidence: "low" | "medium" | "high";
  basisFactIds: JsonValue;
}

export interface InterestDoc {
  _id: string;
  userId: string;
  jobPostingId: string;
  stage: "saved" | "applied" | "closed";
  deadlineAt?: Date | null;
  memo?: string | null;
  updatedAt: Date;
}

export interface JobAnalysisHistoryDoc {
  userId: string;
  previousVersion: number;
  requirements: JsonValue[];
  archivedAt: Date;
}

export interface MatchScoreDoc {
  _id: string;
  userId: string;
  jobPostingId: string;
  total: Decimal128;
  axes: JsonObject;
  reasonText: string;
  computedAt: Date;
  nextAction: string;
}

export interface RequirementCoverageDoc {
  _id: string;
  userId: string;
  requirementId: string;
  coverage: "covered" | "partial" | "missing";
  coveredBy: JsonValue;
  computedAt: Date;
}
