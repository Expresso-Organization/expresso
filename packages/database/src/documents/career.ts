// 최종 SQL 제약 목록을 대조해 확정한 MongoDB 저장 타입입니다. API 계약은 contracts에서 가져옵니다.
import type * as Contracts from "@expresso/contracts";
import type { Decimal128 } from "mongodb";
import type { JsonValue, JsonObject } from "./common.js";

export type CareerPropertyDefinitionDoc = Contracts.CareerPropertyDefinition;
type NonNumberCareerPropertyValueDoc = Exclude<
  Contracts.WritableCareerPropertyValue,
  { type: "number" }
>;

/** API decimal string과 Mongo 숫자 BSON을 섞지 않기 위한 저장 경계 타입입니다. */
export type CareerPropertyValueDoc = NonNumberCareerPropertyValueDoc | {
  propertyDefinitionId: string;
  type: "number";
  value: number | Decimal128;
};

export interface CareerCategoryDoc {
  _id: string;
  userId?: string | null;
  key: string;
  isSystem: boolean;
  propertySchema: Contracts.CareerPropertySchema;
  propertyDefinitions?: Contracts.CanonicalCareerPropertyDefinition[];
  sortOrder: number;
  name: string;
  icon: string;
  defaultView: Contracts.CareerViewType;
  version: number;
  updatedAt: Date;
  propertySchemaV2?: Contracts.CareerPropertyDefinitionV2[];
  schemaVersion?: number;
  propertySchemaTombstones?: Contracts.CareerPropertyDefinitionV2[];
  propertyMutationResults?: Record<string, unknown>;
}

export type CareerPropertyMutationStatus = "pending" | "running" | "failed" | "completed" | "cancelled" | "superseded";

export interface CareerPropertyMutationDoc {
  _id: string;
  mutationId: string;
  kind: "career.property-conversion" | "career.property-default" | "career.property-deletion" | "career.property-restoration";
  userId: string;
  categoryId: string;
  propertyId: string;
  propertyKey: string;
  lockKey: string;
  semanticFingerprintVersion: number;
  semanticFingerprint: string;
  operationFingerprint: string;
  operationPayload: JsonObject;
  status: CareerPropertyMutationStatus;
  active: boolean;
  cursor: string | null;
  processedCount: number;
  attempts: number;
  lastError: JsonObject | null;
  leaseToken: string | null;
  leaseExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

export interface CareerRecordDoc {
  _id: string;
  userId: string;
  categoryId: Contracts.CareerRecord["categoryId"];
  title: Contracts.CareerRecord["title"];
  status: Contracts.CareerRecord["status"];
  origin: Contracts.CareerRecord["origin"];
  properties: Contracts.CareerRecord["properties"];
  bodyMd: Contracts.CareerRecord["bodyMd"];
  propertyValues?: CareerPropertyValueDoc[];
  blockBody?: {
    schemaVersion: 1;
    type: "doc";
    content: Array<{
      id: string;
      type: "paragraph";
      attrs: Record<string, never>;
      text: Array<{ text: string }>;
    }>;
  };
  editorSchemaVersion?: 1;
  periodStart?: string | null;
  periodEnd?: string | null;
  version: Contracts.CareerRecord["version"];
  createdAt?: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
  purgeAfter?: Date | null;
  createIdempotencyKey?: string | null;
  createRequestHash?: string | null;
  referenceVersion?: number;
  documentSchemaVersion?: number | null;
  documentVersion?: number | null;
  latestSnapshotId?: string | null;
  computedProperties?: JsonObject | null;
  /** 계산 결과만 갱신하는 worker의 낙관적 동시성 세대입니다. 기존 문서에서 없으면 0입니다. */
  computationVersion?: number;
  /** 계산 결과가 마지막으로 확정된 시각이며 CareerRecord updatedAt과 분리됩니다. */
  computedAt?: Date | null;
  unmappedProperties?: JsonObject | null;
  /** 삭제한 프로퍼티의 값을 안정 ID 아래 보존해 같은 프로퍼티 복원 때 되살립니다. */
  propertyValueTombstones?: JsonObject | null;
  editorMigratedAt?: Date | null;
}

export interface CareerProfileDoc {
  targetRoles: JsonValue;
  experienceYears: number;
  primaryGoal: "explore" | "build" | "organize";
  updatedAt: Date;
}

export interface CareerViewDoc {
  _id: string;
  userId: string;
  categoryId: string;
  /** 기존 화면이 읽는 평면 뷰 필드입니다. 전환 기간 동안 유지합니다. */
  name?: string;
  viewType?: "table" | "gallery" | "timeline" | "board" | "list";
  filters?: JsonValue[];
  sorts?: JsonValue[];
  visibleProperties?: JsonValue;
  sortOrder?: number;
  createdAt: Date;
  /** v2는 property UUID만 저장해 이름 변경에도 필터가 유지됩니다. */
  configuration?: Contracts.CareerViewConfiguration;
}

export interface RecordLinkDoc {
  _id: string;
  userId: string;
  fromRecordId: string;
  toRecordId: string;
  relation: "related" | "parent" | "duplicate_of";
  createdBy: "user" | "ai";
}

export interface RecordUsageDoc {
  _id: string;
  userId: string;
  recordId: string;
  blockId: string;
  quotedText: string;
  firstUsedAt: Date;
}

export interface RevisionDoc {
  _id: string;
  userId: string;
  portfolioId: string;
  blockId?: string | null;
  actor: "user" | "ai";
  before?: JsonValue;
  after?: JsonValue;
  restoreLabel?: string | null;
  proposalId?: string | null;
  revertedRevisionId?: string | null;
  changeKind: "edit" | "revert" | "restore";
  summary: string;
  createdAt: Date;
}

export interface SkillDoc {
  _id: string;
  userId: string;
  name: string;
  level: number;
  computedAt: Date;
  demandScore?: Decimal128 | null;
  evidenceCount: number;
  lastUsedAt?: Date | null;
  strength: "weak" | "supported" | "strong";
}

export interface SkillEvidenceDoc {
  _id: string;
  userId: string;
  skillId: string;
  recordId: string;
  weight: Decimal128;
  extractedSpan: JsonObject;
}
