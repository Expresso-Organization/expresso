import { z } from "zod";
import { TimestampSchema, UuidSchema } from "./common.js";
import { GeneratedPageDeploymentSnapshotSchema } from "./page.js";

export const SlugSchema = z.string().min(3).max(63).regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/);

/**
 * 공개 주소로 받을 수 없는 이름.
 *
 * 주소는 `{slug}.expresso.ai.kr`이 된다. 제품이 이미 쓰는 서브도메인(`dev`)과 앞으로
 * 쓸 자리를 사용자가 먼저 가져가면 그 이름은 포트폴리오가 된다.
 */
export const RESERVED_SLUGS = ["www", "dev", "api", "app", "admin", "mail", "status", "static", "site"] as const;

/** 새로 배포할 때 받는 주소. 이미 저장된 주소를 읽을 때는 `SlugSchema`를 쓴다. */
export const PublicSlugSchema = SlugSchema.refine(
  (slug) => !(RESERVED_SLUGS as readonly string[]).includes(slug),
  { message: "reserved slug" },
);

export const PublishPortfolioSchema = z.strictObject({
  slug: PublicSlugSchema,
  seo: z.strictObject({
    title: z.string().min(1).max(70).optional(),
    description: z.string().min(1).max(160).optional(),
    indexable: z.boolean().default(false),
  }).default({ indexable: false }),
  contactVisibility: z.enum(["public", "on_request", "hidden"]).default("hidden"),
});

export const DeploymentSchema = z.strictObject({
  id: UuidSchema,
  portfolioId: UuidSchema,
  version: z.number().int().positive(),
  slug: SlugSchema,
  snapshot: z.record(z.string(), z.unknown()),
  seo: z.record(z.string(), z.unknown()),
  contactVisibility: z.enum(["public", "on_request", "hidden"]),
  publishedAt: TimestampSchema,
});

/**
 * 배포한 지면의 섹션 목록.
 *
 * 자유 생성 지면의 `<section>`은 포트폴리오 섹션과 이어져 있지 않다. 그래서 배포할 때
 * 문서에서 바로 뽑는다 — 다른 section 안에 있지 않은 `<section>`을 문서 순서대로, 제목은
 * 그 안의 첫 h1–h3. 방문 기록은 이 id로 섹션을 가리킨다.
 */
export const DeploymentOutlineSectionSchema = z.strictObject({
  id: UuidSchema,
  title: z.string().min(1).max(80).nullable(),
});

/** 새 자유 HTML 배포가 넣는 스냅샷의 최소 호환 모양. */
export const FreeHtmlDeploymentSnapshotSchema = z.strictObject({
  portfolioId: UuidSchema,
  title: z.string(),
  templateId: UuidSchema,
  sections: z.array(z.unknown()),
  generatedPage: GeneratedPageDeploymentSnapshotSchema,
  /** 섹션 목록이 생기기 전에 배포한 판에는 없다. 그 판은 섹션 체류를 받지 않는다. */
  outline: z.array(DeploymentOutlineSectionSchema).max(100).optional(),
});

/**
 * 08b가 읽는 배포 이력 한 줄.
 *
 * 무거운 `snapshot`은 빼고 **그 버전이 무엇을 담고 있었는지**만 센다. 되돌리기는
 * 여기 있는 `id`로 한다.
 */
export const DeploymentSummarySchema = z.strictObject({
  id: UuidSchema,
  version: z.number().int().positive(),
  slug: SlugSchema,
  publishedAt: TimestampSchema,
  /** 지금 이 주소로 열리는 버전인가. */
  isCurrent: z.boolean(),
  seoIndexable: z.boolean(),
  contactVisibility: z.enum(["public", "on_request", "hidden"]),
  /** 배포 당시 사본에서 센 수. 지금 편집본이 아니라 그때 나간 것이다. */
  sectionCount: z.number().int().nonnegative(),
  blockCount: z.number().int().nonnegative(),
});

export const DeploymentListResponseSchema = z.strictObject({
  data: z.array(DeploymentSummarySchema).max(50),
});

export const PublicPortfolioSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("portfolio"), deployment: DeploymentSchema }),
  z.strictObject({ kind: z.literal("redirect"), from: SlugSchema, to: SlugSchema, expiresAt: TimestampSchema }),
]);

export const SubmitExportSchema = z.strictObject({
  kind: z.enum(["pdf", "deck"]),
  pageFormat: z.enum(["letter", "a4"]).nullable().default(null),
});

export const ReplaceResumeSchema = z.strictObject({
  fileUrl: z.string().min(1).max(2_000).regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*\.(?:pdf|doc|docx)$/i),
});

export const SignedAssetSchema = z.strictObject({
  assetId: UuidSchema,
  url: z.string().min(1),
  expiresAt: TimestampSchema,
});

export type PublishPortfolio = z.infer<typeof PublishPortfolioSchema>;
export type DeploymentOutlineSection = z.infer<typeof DeploymentOutlineSectionSchema>;
export type FreeHtmlDeploymentSnapshot = z.infer<typeof FreeHtmlDeploymentSnapshotSchema>;
export type SubmitExport = z.infer<typeof SubmitExportSchema>;
export type DeploymentSummary = z.infer<typeof DeploymentSummarySchema>;
