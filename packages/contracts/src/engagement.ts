import { z } from "zod";
import { TimestampSchema, UuidSchema } from "./common.js";

export const NotificationKindSchema = z.enum(["deadline", "saved_search", "generation", "traffic"]);
export const NotificationPreferenceSchema = z.strictObject({ kind: NotificationKindSchema, enabled: z.boolean() });
export const NotificationSchema = z.strictObject({
  id: UuidSchema,
  kind: NotificationKindSchema,
  targetUrl: z.string().min(1).max(2_000),
  readAt: TimestampSchema.nullable(),
  deliveryStatus: z.enum(["queued", "sending", "sent", "failed", "suppressed"]),
  attempts: z.number().int().nonnegative(),
  createdAt: TimestampSchema,
});

export const UnifiedSearchQuerySchema = z.strictObject({
  q: z.string().min(1).max(200),
  cursor: z.string().min(1).max(1_000).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const UnifiedSearchItemSchema = z.strictObject({
  id: UuidSchema,
  type: z.enum(["record", "portfolio", "job"]),
  title: z.string().min(1),
  subtitle: z.string(),
});

export const HomeReadModelSchema = z.strictObject({
  activeBrews: z.array(z.strictObject({ id: UuidSchema, status: z.string(), updatedAt: TimestampSchema })),
  portfolios: z.array(z.strictObject({ id: UuidSchema, title: z.string(), status: z.string() })),
  recommendedJobs: z.array(z.strictObject({
    id: UuidSchema, title: z.string(), company: z.string(), score: z.number(),
    /** 회사 마크 주소. 못 받아 둔 회사는 null이고 화면이 첫 글자로 그린다. */
    companyLogoUrl: z.string().max(300).nullable(),
  })),
  keyMetrics: z.array(z.strictObject({ key: z.string(), value: z.number() })),
  empty: z.strictObject({ brews: z.boolean(), portfolios: z.boolean(), recommendations: z.boolean(), metrics: z.boolean() }),
});

export type NotificationKind = z.infer<typeof NotificationKindSchema>;
export type UnifiedSearchQuery = z.infer<typeof UnifiedSearchQuerySchema>;
export type HomeReadModel = z.infer<typeof HomeReadModelSchema>;

