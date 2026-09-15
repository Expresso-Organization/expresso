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
  /** 이 주소가 본인 것임을 확인한 시각. 0010 이전 사용자에게는 없다 = 미인증. */
  emailVerifiedAt?: Date | null;
  /** 약관·개인정보 처리방침에 동의한 시각과 그때의 판. 0010 이전 사용자에게는 없다. */
  termsAcceptedAt?: Date | null;
  termsVersion?: number | null;
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
  /** 다음 만료. 인증된 요청마다 `min(now + idleTtlMs, absoluteExpiresAt)`으로 앞당겨진다. */
  expiresAt: Date;
  revokedAt?: Date | null;
  lastSeenAt?: Date | null;
  createdAt: Date;
  /**
   * 마지막 활동 뒤 이 세션이 살아 있는 시간(ms). 0009 이전 문서에는 없다 — 그 문서는
   * 유지 모드(30일)로 읽는다.
   */
  idleTtlMs?: number;
  /** 활동으로도 넘지 못하는 절대 상한. 없으면 `createdAt + 90일`로 본다. */
  absoluteExpiresAt?: Date;
}

/**
 * 일회용 토큰 — 비밀번호 재설정 링크와 이메일 인증 링크.
 *
 * 세션 토큰과 같은 원칙으로 해시만 둔다. 한 번 쓰면 `usedAt`이 찍히고, `expiresAt`은
 * TTL 인덱스가 지운다. 같은 사람 · 같은 종류의 최신 `createdAt`으로 재발송 간격을 본다.
 */
export interface IdentityTokenDoc {
  _id: string;
  userId: string;
  kind: "password_reset" | "email_verification";
  tokenHash: string;
  expiresAt: Date;
  usedAt?: Date | null;
  createdAt: Date;
}
