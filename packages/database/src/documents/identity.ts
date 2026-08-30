// 최종 SQL 제약 목록을 대조해 확정한 MongoDB 저장 타입입니다. API 계약은 contracts에서 가져옵니다.
import type * as Contracts from "@expresso/contracts";
import type { JsonObject } from "./common.js";
import type { CareerProfileDoc } from "./career.js";

export interface PlanDoc {
  _id: string;
  code: Contracts.PlanCode;
  generationQuota: number;
  features: JsonObject;
  isPublicListed: boolean;
}

export interface UserDoc {
  _id: string;
  email: string;
  displayName: string;
  planId: string;
  deletionRequestedAt?: Date | null;
  createdAt: Date;
  passwordHash?: string | null;
  profile?: CareerProfileDoc | null;
  notificationPreferences?: JsonObject | null;
  writeVersion?: number;
  lifecycleVersion?: number;
}

export interface ConsentDoc {
  _id: string;
  userId: string;
  scope: "job_posting_analysis" | "career_records";
  policyVersion: number;
  grantedAt: Date;
  revokedAt?: Date | null;
  useVersion?: number;
}

export interface UsageCounterDoc {
  _id: string;
  userId: string;
  periodStart: string;
  used: number;
  resetsAt: Date;
}

export interface IdentityOauthAccountDoc {
  _id: string;
  userId: string;
  provider: Contracts.OAuthProvider;
  providerAccountId: string;
  email: string;
  linkedAt: Date;
  lastLoginAt?: Date | null;
}

export interface IdentitySessionDoc {
  _id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt?: Date | null;
  lastSeenAt?: Date | null;
  createdAt: Date;
}
