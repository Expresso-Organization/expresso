import { z } from "zod";

import {
  PageInfoSchema,
  ResourceVersionSchema,
  TimestampSchema,
  UuidSchema,
} from "./common.js";
import { CareerPropertyDefinitionV2Schema } from "./career-properties.js";

export const CareerViewTypeSchema = z.enum([
  "table",
  "gallery",
  "timeline",
  "board",
  "list",
]);

export const CareerPropertyTypeSchema = z.enum([
  "text",
  "number",
  "date",
  "tags",
  "boolean",
]);

export const CareerPropertyDefinitionSchema = z.strictObject({
  /** MongoDB 전환 뒤 부여되는 안정 식별자입니다. 기존 생성 요청은 생략할 수 있습니다. */
  id: UuidSchema.optional(),
  label: z.string().trim().min(1).max(80),
  type: CareerPropertyTypeSchema,
  required: z.boolean().default(false),
  system: z.boolean().default(false),
});

export const CareerPropertySchemaSchema = z.record(
  z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/),
  CareerPropertyDefinitionSchema,
);

export const CareerPropertyValueSchema = z.union([
  z.string().max(5_000),
  z.number().finite(),
  z.boolean(),
  z.array(z.string().max(200)).max(100),
]);

export const CareerPropertiesSchema = z.record(
  z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/),
  CareerPropertyValueSchema,
);

export const CareerCategorySchema = z.strictObject({
  id: UuidSchema,
  key: z.string().min(1).max(80),
  name: z.string().min(1).max(120),
  icon: z.string().min(1).max(80),
  defaultView: CareerViewTypeSchema,
  isSystem: z.boolean(),
  propertySchema: CareerPropertySchemaSchema,
  propertySchemaV2: z.array(CareerPropertyDefinitionV2Schema).optional(),
  schemaVersion: z.number().int().positive().optional(),
  sortOrder: z.number().int().nonnegative(),
  recordCount: z.number().int().nonnegative(),
  version: z.number().int().positive(),
});

export const CareerCategoriesResponseSchema = z.strictObject({
  data: z.array(CareerCategorySchema),
});

export const CreateCareerCategorySchema = z.strictObject({
  key: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/),
  name: z.string().trim().min(1).max(120),
  icon: z.string().trim().min(1).max(80),
  defaultView: CareerViewTypeSchema,
  propertySchema: CareerPropertySchemaSchema.default({}),
});

export const UpdateCareerPropertySchemaSchema = z.strictObject({
  propertySchema: CareerPropertySchemaSchema,
  confirmValueRemoval: z.boolean().default(false),
});

export const CareerRecordStatusSchema = z.enum([
  "draft",
  "organized",
  "verified",
]);

export const CareerRecordOriginSchema = z.enum([
  "manual",
  "ai",
  "interview",
  "import",
]);

export const CareerRecordSchema = z.strictObject({
  id: UuidSchema,
  categoryId: UuidSchema,
  title: z.string().max(300),
  status: CareerRecordStatusSchema,
  origin: CareerRecordOriginSchema,
  properties: CareerPropertiesSchema,
  bodyMd: z.string().max(200_000),
  version: z.number().int().positive(),
  updatedAt: TimestampSchema,
});

export const CareerRecordResponseSchema = z.strictObject({
  data: CareerRecordSchema,
  resource: ResourceVersionSchema,
});

export const CreateCareerRecordSchema = z.strictObject({
  categoryId: UuidSchema,
  title: z.string().trim().max(300).default(""),
  properties: CareerPropertiesSchema.default({}),
  bodyMd: z.string().max(200_000).default(""),
});

export const UpdateCareerRecordSchema = z
  .strictObject({
    title: z.string().trim().max(300).optional(),
    properties: CareerPropertiesSchema.optional(),
    bodyMd: z.string().max(200_000).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "at least one record field must be supplied",
  });

export const CareerRecordIdParamsSchema = z.strictObject({
  recordId: UuidSchema,
});

/**
 * 05–05e 내 커리어 목록. 네 가지 뷰(table / gallery / timeline / board)가 같은 목록 API를
 * 공유하고 정렬만 달라진다 — timeline은 period, board는 그룹 속성 기준이다.
 */
export const CareerRecordSortSchema = z.enum([
  "updated_desc",
  "updated_asc",
  "title_asc",
  "period_desc",
  "period_asc",
]);

export const ListCareerRecordsQuerySchema = z.strictObject({
  categoryId: UuidSchema.optional(),
  status: CareerRecordStatusSchema.optional(),
  origin: CareerRecordOriginSchema.optional(),
  q: z.string().trim().min(1).max(200).optional(),
  sort: CareerRecordSortSchema.default("updated_desc"),
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const CareerRecordListItemSchema = CareerRecordSchema.extend({
  categoryKey: z.string().min(1).max(80),
  /** 화면 정의서의 "비어 있음" 상태. DB status와 달리 본문·속성이 모두 빈 것을 뜻한다(§6.2). */
  isEmpty: z.boolean(),
  periodFrom: z.iso.date().nullable(),
  periodTo: z.iso.date().nullable(),
  linkCount: z.number().int().nonnegative(),
  /** "사용처 N곳" — 이 기록을 인용한 포트폴리오 수. */
  usedInCount: z.number().int().nonnegative(),
});

/** 목록 하단 집계 바 — "8개 · 초안 3 · 비어 있음 1". */
export const CareerRecordSummarySchema = z.strictObject({
  total: z.number().int().nonnegative(),
  draft: z.number().int().nonnegative(),
  organized: z.number().int().nonnegative(),
  verified: z.number().int().nonnegative(),
  empty: z.number().int().nonnegative(),
});

export const CareerRecordListResponseSchema = z.strictObject({
  data: z.array(CareerRecordListItemSchema),
  page: PageInfoSchema,
  summary: CareerRecordSummarySchema,
});

export const CareerSkillIdParamsSchema = z.strictObject({
  skillId: UuidSchema,
});

export const CareerCategoryIdParamsSchema = z.strictObject({
  categoryId: UuidSchema,
});

export const CareerLinkRelationSchema = z.enum([
  "related",
  "parent",
  "duplicate_of",
]);

export const CreateCareerRecordLinkSchema = z.strictObject({
  toRecordId: UuidSchema,
  relation: CareerLinkRelationSchema,
});

export const CareerRecordLinkSchema = z.strictObject({
  id: UuidSchema,
  recordId: UuidSchema,
  relatedRecordId: UuidSchema,
  relation: CareerLinkRelationSchema,
  direction: z.enum(["outgoing", "incoming"]),
});

export const CareerViewFilterSchema = z.strictObject({
  property: z.string().min(1).max(64),
  operator: z.enum(["eq", "neq", "contains", "exists"]),
  value: CareerPropertyValueSchema.optional(),
});

export const CareerViewSortSchema = z.strictObject({
  property: z.string().min(1).max(64),
  direction: z.enum(["asc", "desc"]),
});

export const CreateCareerViewSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  viewType: CareerViewTypeSchema,
  filters: z.array(CareerViewFilterSchema).max(20).default([]),
  sorts: z.array(CareerViewSortSchema).max(10).default([]),
  visibleProperties: z.array(z.string().min(1).max(64)).max(50).default([]),
});

export const CareerViewSchema = CreateCareerViewSchema.extend({
  id: UuidSchema,
  categoryId: UuidSchema,
  sortOrder: z.number().int().nonnegative(),
});

export const CareerDeleteImpactSchema = z.strictObject({
  recordId: UuidSchema,
  portfolioCount: z.number().int().nonnegative(),
  blockCount: z.number().int().nonnegative(),
  deletedAt: TimestampSchema,
  purgeAfter: TimestampSchema,
});

export const CareerSkillEvidenceSpanSchema = z.strictObject({
  source: z.enum(["title", "body_md"]),
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  quote: z.string().min(1).max(5_000),
}).refine((span) => span.end > span.start, {
  message: "evidence end must be greater than start",
});

export const RecomputeCareerSkillSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  evidence: z.array(z.strictObject({
    recordId: UuidSchema,
    span: CareerSkillEvidenceSpanSchema,
  })).min(1).max(100),
});

export const CareerSkillSchema = z.strictObject({
  id: UuidSchema,
  name: z.string().min(1).max(120),
  level: z.number().int().min(1).max(5),
  evidenceCount: z.number().int().positive(),
  strength: z.enum(["weak", "supported", "strong"]),
  lastUsedAt: TimestampSchema,
  computedAt: TimestampSchema,
});

export const CareerSkillEvidenceSchema = z.strictObject({
  recordId: UuidSchema,
  recordTitle: z.string().max(300),
  span: CareerSkillEvidenceSpanSchema,
});

export const CareerSkillEvidenceResponseSchema = z.strictObject({
  data: z.array(CareerSkillEvidenceSchema),
});

export type CareerViewType = z.infer<typeof CareerViewTypeSchema>;
export type CareerRecordStatus = z.infer<typeof CareerRecordStatusSchema>;
export type CareerRecordOrigin = z.infer<typeof CareerRecordOriginSchema>;
export type CareerRecord = z.infer<typeof CareerRecordSchema>;
export type CareerPropertyDefinition = z.infer<
  typeof CareerPropertyDefinitionSchema
>;
export type CareerPropertySchema = z.infer<typeof CareerPropertySchemaSchema>;
export type CareerProperties = z.infer<typeof CareerPropertiesSchema>;
export type CareerCategory = z.infer<typeof CareerCategorySchema>;
export type CreateCareerCategory = z.infer<typeof CreateCareerCategorySchema>;
export type CreateCareerRecord = z.infer<typeof CreateCareerRecordSchema>;
export type CareerRecordSort = z.infer<typeof CareerRecordSortSchema>;
export type ListCareerRecordsQuery = z.infer<typeof ListCareerRecordsQuerySchema>;
export type CareerRecordListItem = z.infer<typeof CareerRecordListItemSchema>;
export type CareerRecordSummary = z.infer<typeof CareerRecordSummarySchema>;
export type CareerRecordListResponse = z.infer<
  typeof CareerRecordListResponseSchema
>;
export type UpdateCareerRecord = z.infer<typeof UpdateCareerRecordSchema>;
export type CreateCareerView = z.infer<typeof CreateCareerViewSchema>;
export type RecomputeCareerSkill = z.infer<typeof RecomputeCareerSkillSchema>;
export type CareerSkill = z.infer<typeof CareerSkillSchema>;

// ── §8.3 「기록 정리」 — 모델이 내는 정리본 ───────────────────────────

/**
 * 대화 답변 하나를 기록으로 정리한다.
 *
 * §8.3이 이 계약에 붙인 조항 둘 —
 * **사용자가 말하지 않은 수치를 만들지 않는다**, 그리고
 * **비어 있는 항목은 null로 반환한다(추측 금지).** 그래서 STAR 네 칸이 전부
 * nullable이다. 말하지 않은 상황을 지어내 채우느니 비워 두는 편이 낫다.
 */
export const RECORD_STAR_KEYS = ["situation", "task", "action", "result"] as const;

export const RecordCleanupSchema = z.strictObject({
  /** 기록의 제목. 답변 첫 줄이 아니라 무엇에 대한 기록인지. */
  title: z.string().trim().min(1).max(120),
  /** 어떤 상황이었나. 말하지 않았으면 null. */
  situation: z.string().trim().min(1).max(600).nullable(),
  /** 무엇을 맡았나. */
  task: z.string().trim().min(1).max(600).nullable(),
  /** 무엇을 했나. */
  action: z.string().trim().min(1).max(1_200).nullable(),
  /** 어떻게 되었나. */
  result: z.string().trim().min(1).max(600).nullable(),
  /** 답변에 실제로 나온 수치. 없으면 빈 배열. */
  metrics: z.array(z.string().trim().min(1).max(120)).max(8),
  /** 이 기록이 보여주는 역량. */
  competencies: z.array(z.string().trim().min(1).max(60)).max(8),
});

export type RecordCleanup = z.infer<typeof RecordCleanupSchema>;

/* ── 온보딩 1단계 · 커리어 프로필 (화면 10c) ── */

/**
 * 화면의 직무 칩 8종.
 *
 * 자유 입력이 아니라 **닫힌 목록**이다. 이 값으로 공고를 고르고 질문을 만들
 * 것이라면, 사람마다 다르게 적은 문자열을 나중에 맞춰 볼 방법이 없다.
 */
export const TargetRoleSchema = z.enum([
  "백엔드",
  "프론트엔드",
  "데이터",
  "ML · AI",
  "모바일",
  "DevOps",
  "기획 · PM",
  "디자인",
]);

/** 화면의 "지금 가장 급한 것" 세 갈래. */
export const CareerGoalSchema = z.enum(["explore", "build", "organize"]);

/** 슬라이더 상한. **12는 "12년 이상"이다.** */
export const MAX_EXPERIENCE_YEARS = 12;

export const CareerProfileSchema = z.strictObject({
  /** 빈 배열은 "아직 안 정했다"는 뜻이다. 그것도 답이라 막지 않는다. */
  targetRoles: z.array(TargetRoleSchema).max(8),
  experienceYears: z.number().int().min(0).max(MAX_EXPERIENCE_YEARS),
  primaryGoal: CareerGoalSchema,
  updatedAt: TimestampSchema,
});

/** 저장은 통째로 덮어쓴다 — 화면이 세 값을 한 번에 정하므로 부분 갱신이 없다. */
export const SaveCareerProfileSchema = z.strictObject({
  targetRoles: z.array(TargetRoleSchema).max(8),
  experienceYears: z.number().int().min(0).max(MAX_EXPERIENCE_YEARS),
  primaryGoal: CareerGoalSchema,
});

export const CareerProfileResponseSchema = z.strictObject({
  data: CareerProfileSchema,
});

/** 아직 온보딩을 지나지 않은 사람에게는 프로필이 없다. */
export const OptionalCareerProfileResponseSchema = z.strictObject({
  data: CareerProfileSchema.nullable(),
});

export type TargetRole = z.infer<typeof TargetRoleSchema>;
export type CareerGoal = z.infer<typeof CareerGoalSchema>;
export type CareerProfile = z.infer<typeof CareerProfileSchema>;
export type SaveCareerProfile = z.infer<typeof SaveCareerProfileSchema>;
