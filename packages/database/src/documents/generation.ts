// 최종 SQL 제약 목록을 대조해 확정한 MongoDB 저장 타입입니다. API 계약은 contracts에서 가져옵니다.
import type { JsonObject } from "./common.js";

export interface PortfolioDoc {
  _id: string;
  userId: string;
  brewId: string;
  templateId: string;
  currentDeploymentId?: string | null;
  title: string;
  status: "draft" | "published" | "unlisted";
  createdAt: Date;
  updatedAt: Date;
  styleOverrides: JsonObject;
}

export interface PortfolioSectionDoc {
  _id: string;
  userId: string;
  portfolioId: string;
  recipeSectionId?: string | null;
  orderNo: number;
  visible: boolean;
  hiddenReason?: string | null;
}

export interface BlockDoc {
  _id: string;
  userId: string;
  portfolioSectionId: string;
  kind: "heading" | "paragraph" | "list" | "metric" | "chart" | "media";
  content: JsonObject;
  style: JsonObject;
  sourceRecordId?: string | null;
  syncState: "synced" | "stale" | "detached";
  locked: boolean;
  orderNo: number;
}

export interface GenerationJobDoc {
  _id: string;
  userId: string;
  brewId: string;
  recipeId: string;
  templateId: string;
  status: "queued" | "running" | "done" | "failed";
  usageCharged: boolean;
  errorCode?: string | null;
  inputIdempotencyKey?: string | null;
  requestHash?: string | null;
  stage: "queued" | "validating" | "materializing" | "charging" | "done" | "failed";
  attempts: number;
  failureRetryable?: boolean | null;
  portfolioId?: string | null;
  createdAt: Date;
  updatedAt: Date;
  styleOverrides: JsonObject;
}

export interface GenerationSentenceEvidenceDoc {
  _id: string;
  userId: string;
  generationJobId: string;
  blockId: string;
  recipeEvidencePathId: string;
  sourceQuote: string;
  createdAt: Date;
}

export interface GenerationUsageLedgerDoc {
  _id: string;
  userId: string;
  generationJobId: string;
  usageCounterId?: string | null;
  amount: "-1";
  reason: string;
  createdAt: Date;
}
