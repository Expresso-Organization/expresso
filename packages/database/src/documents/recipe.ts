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
}

export interface RecipeSectionDoc {
  _id: string;
  userId: string;
  recipeId: string;
  orderNo: number;
  title: string;
  purpose: string;
  targetLength: number;
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
