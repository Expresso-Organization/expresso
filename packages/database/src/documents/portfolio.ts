// 최종 SQL 제약 목록을 대조해 확정한 MongoDB 저장 타입입니다. API 계약은 contracts에서 가져옵니다.
import type { JsonValue, JsonObject } from "./common.js";

export interface GeneratedPageDoc {
  _id: string;
  userId: string;
  portfolioId: string;
  generationJobId?: string | null;
  html: string;
  css: string;
  rationale: string;
  revision: number;
  instruction?: string | null;
  promptVersion: number;
  ungroundedNumbers: JsonValue;
  removed: JsonValue;
  createdAt: Date;
  qualityStatus: "ready" | "failed_qa";
  qaReport: JsonObject;
  generationManifest: JsonObject;
  portfolioPlanSnapshot?: JsonObject | null;
  styleSpecSnapshot?: JsonObject | null;
  designPrinciplesVersion: number;
}

export interface LayoutSpecDoc {
  _id: string;
  userId: string;
  portfolioId: string;
  batchId: string;
  generationJobId?: string | null;
  seedTemplateId?: string | null;
  spec: JsonObject;
  promptVersion: number;
  editedBy: "ai" | "user";
  orderNo: number;
  selected: boolean;
  createdAt: Date;
  instruction?: string | null;
}

export interface PortfolioEditProposalDoc {
  _id: string;
  userId: string;
  portfolioId: string;
  targetPath: string;
  blockId: string;
  operation: "update_text" | "set_style" | "insert_record" | "instruct";
  beforeState: JsonObject;
  afterState: JsonObject;
  sourceRecordId?: string | null;
  status: "pending" | "applied" | "rejected" | "expired";
  createdAt: Date;
  expiresAt: Date;
  appliedAt?: Date | null;
  patches: JsonValue[];
  instruction?: string | null;
}

export interface PortfolioSnapshotDoc {
  _id: string;
  userId: string;
  portfolioId: string;
  kind: "initial_generation" | "edit" | "manual";
  snapshot: JsonObject;
  createdAt: Date;
}
