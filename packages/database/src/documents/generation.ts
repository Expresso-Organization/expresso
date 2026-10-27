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
  /** 디자인 시스템 판으로 생성했으면 그 판입니다. 템플릿으로 만든 포트폴리오는 비어 있습니다. */
  designSystemRevisionId?: string | null;  /** 페이지 짜임새(`PORTFOLIO_ARCHETYPES`). 유형 이전에 만든 포트폴리오는 비어 있고 사례 상세형으로 그립니다. */
  archetype?: string | null;
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
  /** 구성(레시피)이 끝나기 전에 맡긴 생성은 null이다. 구성이 끝나면 워커가 붙이고 그때 시작한다. */
  recipeId: string | null;
  templateId: string;
  status: "queued" | "running" | "done" | "failed";
  usageCharged: boolean;
  errorCode?: string | null;
  inputIdempotencyKey?: string | null;
  requestHash?: string | null;
  stage: "queued" | "validating" | "materializing" | "charging" | "done" | "failed";
  attempts: number;
  /** 실행을 선점한 worker를 구분하는 낙관적 잠금 값입니다. */
  runToken?: string | null;
  failureRetryable?: boolean | null;
  portfolioId?: string | null;
  createdAt: Date;
  updatedAt: Date;
  styleOverrides: JsonObject;
  /** 디자인 시스템 판으로 요청한 생성이면 그 판입니다. 템플릿과 스타일 값은 이 판의 토큰에서 정했습니다. */
  designSystemRevisionId?: string | null;  /** 요청한 페이지 짜임새. 생성이 포트폴리오를 만들 때 그대로 옮깁니다. */
  archetype?: string | null;
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
  amount: -1 | 1;
  reason: string;
  createdAt: Date;
}
