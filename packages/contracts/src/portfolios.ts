import { z } from "zod";

import { PageInfoSchema, TimestampSchema, UuidSchema } from "./common.js";
import { LayoutSpecSchema } from "./layout.js";

/**
 * 포트폴리오 읽기 계약.
 *
 * 소유자가 자기 포트폴리오를 읽는 경로다 — 공개 조회(`/v1/public/portfolios/:slug`)와
 * 다르다. 04 에디터 캔버스, 00 홈 카드, 08b 배포 화면이 이 계약을 쓴다.
 */

export const PortfolioStatusSchema = z.enum(["draft", "published", "unlisted"]);

export const PortfolioContactVisibilitySchema = z.enum([
  "hidden",
  "on_request",
  "public",
]);

export const PortfolioDeploymentSchema = z.strictObject({
  id: UuidSchema,
  version: z.number().int().positive(),
  subdomain: z.string().min(1).max(63),
  customDomain: z.string().max(253).nullable(),
  seoIndexable: z.boolean(),
  contactVisibility: PortfolioContactVisibilitySchema,
  publishedAt: TimestampSchema.nullable(),
  /** 편집본과 공개본이 갈렸는지 — 08b의 "새 버전 배포" 판단에 쓴다. */
  hasUnpublishedChanges: z.boolean(),
});

export const PortfolioSummarySchema = z.strictObject({
  id: UuidSchema,
  brewId: UuidSchema,
  title: z.string().min(1).max(300),
  status: PortfolioStatusSchema,
  templateCode: z.string().min(1).max(80),
  templateName: z.string().min(1).max(120),
  sectionCount: z.number().int().nonnegative(),
  /** 숨긴 섹션을 뺀 수. 04 섹션 패널의 "6 표시 + 1 숨김"에 쓴다. */
  visibleSectionCount: z.number().int().nonnegative(),
  blockCount: z.number().int().nonnegative(),
  deployment: PortfolioDeploymentSchema.nullable(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});

export const PortfolioListResponseSchema = z.strictObject({
  data: z.array(PortfolioSummarySchema),
  page: PageInfoSchema,
});

export const ListPortfoliosQuerySchema = z.strictObject({
  status: PortfolioStatusSchema.optional(),
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const PortfolioBlockKindSchema = z.enum([
  "heading",
  "paragraph",
  "list",
  "metric",
  /** 근거의 수치로 그리는 그림. content는 `PortfolioChartSchema` 모양이다. */
  "chart",
  "media",
]);

/** 기록과 값이 어긋났는지 — 04b의 "직접 고친 값은 기록과 달라질 수 있습니다". */
export const PortfolioBlockSyncStateSchema = z.enum([
  "synced",
  "stale",
  "detached",
]);

export const PortfolioBlockSchema = z.strictObject({
  id: UuidSchema,
  /** 섹션 안의 순서. 문장 순서가 곧 지면 순서다. */
  orderNo: z.number().int().nonnegative(),
  kind: PortfolioBlockKindSchema,
  content: z.record(z.string(), z.unknown()),
  style: z.record(z.string(), z.unknown()),
  sourceRecordId: UuidSchema.nullable(),
  syncState: PortfolioBlockSyncStateSchema,
  /** P3 — 직접 고친 블록은 잠기고 AI 재생성 대상에서 빠진다. */
  locked: z.boolean(),
});

export const PortfolioSectionSchema = z.strictObject({
  id: UuidSchema,
  orderNo: z.number().int().nonnegative(),
  /** 섹션 제목은 레시피가 소유한다. 레시피 연결이 끊기면 null. */
  title: z.string().max(300).nullable(),
  recipeSectionId: UuidSchema.nullable(),
  visible: z.boolean(),
  hiddenReason: z.string().max(300).nullable(),
  blocks: z.array(PortfolioBlockSchema),
});

export const PortfolioDetailSchema = PortfolioSummarySchema.extend({
  templateStyle: z.record(z.string(), z.unknown()),
  /**
   * 고른 지면(§8.3 지면 생성). 아직 만들지 않았으면 null이고, 그때 화면은
   * 가장 단순한 기본 배치로 그린다.
   */
  layout: LayoutSpecSchema.nullable(),
  sections: z.array(PortfolioSectionSchema),
});

export const PortfolioDetailResponseSchema = z.strictObject({
  data: PortfolioDetailSchema,
});

/**
 * 파라미터 이름은 `id`다 — 기존 `/v1/portfolios/:id/...` 라우트와 같은 자리에
 * 다른 이름을 쓰면 Fastify 라우터가 등록을 거부한다.
 */
export const PortfolioIdParamsSchema = z.strictObject({
  id: UuidSchema,
});

// ── 04c 변경 이력 ─────────────────────────────────────────────────────

export const PortfolioRevisionActorSchema = z.enum(["user", "ai"]);
export const PortfolioRevisionKindSchema = z.enum(["edit", "revert", "restore"]);

export const PortfolioRevisionSchema = z.strictObject({
  id: UuidSchema,
  actor: PortfolioRevisionActorSchema,
  changeKind: PortfolioRevisionKindSchema,
  summary: z.string().min(1).max(500),
  blockId: UuidSchema.nullable(),
  createdAt: TimestampSchema,
  /** 최신 항목은 "지금 보는 상태"라 되돌리기 버튼을 숨긴다. */
  isCurrent: z.boolean(),
});

export const PortfolioCheckpointSchema = z.strictObject({
  id: UuidSchema,
  kind: z.enum(["initial_generation", "edit", "manual"]),
  label: z.string().min(1).max(120),
  createdAt: TimestampSchema,
});

export const PortfolioRevisionsResponseSchema = z.strictObject({
  data: z.strictObject({
    revisions: z.array(PortfolioRevisionSchema),
    checkpoints: z.array(PortfolioCheckpointSchema),
  }),
  page: PageInfoSchema,
});

export const ListPortfolioRevisionsQuerySchema = z.strictObject({
  actor: PortfolioRevisionActorSchema.optional(),
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type PortfolioStatus = z.infer<typeof PortfolioStatusSchema>;
export type PortfolioDeployment = z.infer<typeof PortfolioDeploymentSchema>;
export type PortfolioSummary = z.infer<typeof PortfolioSummarySchema>;
export type PortfolioBlock = z.infer<typeof PortfolioBlockSchema>;
export type PortfolioSection = z.infer<typeof PortfolioSectionSchema>;
export type PortfolioDetail = z.infer<typeof PortfolioDetailSchema>;
export type PortfolioRevision = z.infer<typeof PortfolioRevisionSchema>;
export type PortfolioCheckpoint = z.infer<typeof PortfolioCheckpointSchema>;
export type ListPortfoliosQuery = z.infer<typeof ListPortfoliosQuerySchema>;
export type ListPortfolioRevisionsQuery = z.infer<
  typeof ListPortfolioRevisionsQuerySchema
>;
