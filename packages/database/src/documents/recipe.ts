// 최종 SQL 제약 목록을 대조해 확정한 MongoDB 저장 타입입니다. API 계약은 contracts에서 가져옵니다.
import type { Decimal128 } from "mongodb";
import type { JsonValue, JsonObject } from "./common.js";

export interface TemplateDoc {
  _id: string;
  code: string;
  name: string;
  toneTags: JsonValue;
  supportedSections: JsonValue;
  planRequired: "free" | "pro";
  description: string;
  rendererVersion: number;
  style: JsonObject;
  industries: JsonValue;
  isActive: boolean;
}

export interface RecipeDoc {
  /** 편집 작업의 낙관적 잠금 값입니다. 생성 version과 구분합니다. */
  editVersion?: number;
  _id: string;
  userId: string;
  brewId: string;
  version: number;
  status: "draft" | "confirmed";
  completeness: Decimal128;
  generatedAt: Date;
  inputIdempotencyKey?: string | null;
  updatedAt: Date;
  promptVersion: number;
  portfolioPlan?: JsonObject | null;
  planningManifest?: JsonObject | null;
  /** v2 블루프린트로 저장된 레시피만 2다. 없으면 v1 이다. */
  schemaVersion?: number;
  /** 01에서 고른 디자인 판. v1 레시피에는 없다. */
  designSystemRevisionId?: string | null;
  /** §7.4 제작 의도. 고른 채용 공고도 여기 들어간다. */
  intent?: JsonObject | null;
  title?: string | null;
  /** 이 판이 데려온 v1 초안. 새 초안이 오면 그때 다시 얹는다. */
  adoptedRecipeId?: string | null;
}

/**
 * Recipe v2 의 내용 항목.
 *
 * v1 의 `recipe_items` 와 나란히 산다 — v1 은 근거 경로를 문자열 자리표로
 * 이어 붙였고, v2 는 항목마다 중심·보조 근거를 제 표에 둔다. v1 레시피를
 * 읽을 때는 어댑터가 항목을 이 모양으로 바꾼다.
 *
 * 표시 방식 · 종류 · 폭 같은 지면의 결정은 여기 없다. 레시피는 내용과 순서만
 * 정한다.
 */
export interface RecipeElementDoc {
  _id: string;
  userId: string;
  recipeId: string;
  recipeSectionId: string;
  orderNo: number;
  /** 이 자리에서 무엇을 말할지. */
  text: string;
  updatedAt: Date;
}

export interface RecipeElementSourceDoc {
  _id: string;
  userId: string;
  recipeId: string;
  recipeElementId: string;
  sourceType: "record" | "answer" | "requirement";
  sourceId: string;
  /** 중심 근거는 항목마다 하나다. 보조는 수를 제한하지 않는다. */
  role: "primary" | "supporting";
  orderNo: number;
  createdAt: Date;
}

export interface RecipeSectionDoc {
  _id: string;
  userId: string;
  recipeId: string;
  orderNo: number;
  title: string;
  purpose: string;
  targetLength: number;
  /** v2 섹션이 제 자리에 두는 핵심 메시지. v1 은 `context.takeaway` 에 있다. */
  takeaway?: string;
  context: JsonObject;
  locked: boolean;
  editedBy: "ai" | "user";
  updatedAt: Date;
}

export interface RecipeItemDoc {
  _id: string;
  userId: string;
  recipeSectionId: string;
  orderNo: number;
  pointText: string;
  evidence: JsonValue[];
  locked: boolean;
  editedBy: "ai" | "user";
  updatedAt: Date;
}

export interface RecipeEvidencePathDoc {
  _id: string;
  userId: string;
  recipeId: string;
  recipeItemId: string;
  sourceType: "requirement" | "record" | "answer";
  sourceId: string;
  sourceLabel: string;
  targetPath: string;
  createdAt: Date;
}

export interface RecipeRevisionDoc {
  _id: string;
  userId: string;
  recipeId: string;
  actor: "ai" | "user";
  action: string;
  snapshot: JsonObject;
  diff: JsonValue[];
  createdAt: Date;
}

export interface RecipeUnusedSourceDoc {
  _id: string;
  userId: string;
  recipeId: string;
  recordId: string;
  reason: string;
  createdAt: Date;
}
