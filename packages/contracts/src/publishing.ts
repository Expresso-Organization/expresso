import { z } from "zod";
import { TimestampSchema, UuidSchema } from "./common.js";
import { GeneratedPageDeploymentSnapshotSchema } from "./page.js";

export const SlugSchema = z.string().min(3).max(63).regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/);

export const PublishPortfolioSchema = z.strictObject({
  slug: SlugSchema,
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

/** 새 자유 HTML 배포가 넣는 스냅샷의 최소 호환 모양. */
export const FreeHtmlDeploymentSnapshotSchema = z.strictObject({
  portfolioId: UuidSchema,
  title: z.string(),
  templateId: UuidSchema,
  sections: z.array(z.unknown()),
  generatedPage: GeneratedPageDeploymentSnapshotSchema,
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
export type SubmitExport = z.infer<typeof SubmitExportSchema>;
export type DeploymentSummary = z.infer<typeof DeploymentSummarySchema>;
