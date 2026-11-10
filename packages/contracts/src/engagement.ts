import { z } from "zod";
import { TimestampSchema, UuidSchema } from "./common.js";
import { ListJobPostingsQuerySchema } from "./job-board.js";

export const NotificationKindSchema = z.enum(["deadline", "saved_search", "generation", "traffic"]);
export const NotificationPreferenceSchema = z.strictObject({ kind: NotificationKindSchema, enabled: z.boolean() });
export const NotificationSchema = z.strictObject({
  id: UuidSchema,
  kind: NotificationKindSchema,
  targetUrl: z.string().min(1).max(2_000),
  /** 알림이 가리키는 대상 이름(포트폴리오 제목, 「회사 · 공고 제목」). 문장은 화면이 만든다. */
  subject: z.string().max(300).nullable(),
  readAt: TimestampSchema.nullable(),
  deliveryStatus: z.enum(["queued", "sending", "sent", "failed", "suppressed"]),
  attempts: z.number().int().nonnegative(),
  createdAt: TimestampSchema,
});

export const NotificationReadAllResultSchema = z.strictObject({ updated: z.number().int().nonnegative() });

/**
 * 00c 통합 검색. 기록 · 공고 · 포트폴리오를 각 화면의 검색 규칙으로 찾는다.
 * `limit`은 종류마다 적용한다 — 세 종류를 섞어 자르면 한 종류가 다른 종류를 밀어낸다.
 */
export const UnifiedSearchQuerySchema = z.strictObject({
  q: z.string().trim().min(1).max(200),
  /** 공고 묶음에 거는 근무지 나라. 공고 탐색이 아무것도 안 고른 첫 화면에 거는 나라를 화면이 그대로 넘긴다. */
  country: ListJobPostingsQuerySchema.shape.country,
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const UnifiedSearchItemSchema = z.strictObject({
  id: UuidSchema,
  type: z.enum(["record", "portfolio", "job"]),
  title: z.string().min(1),
  subtitle: z.string(),
});

/** 기록(제목 순) · 공고(일치도 순) · 포트폴리오(최근 수정 순)를 이 순서로 이어 붙인다. */
export const UnifiedSearchResponseSchema = z.strictObject({ data: z.array(UnifiedSearchItemSchema) });

export const HomeReadModelSchema = z.strictObject({
  activeBrews: z.array(z.strictObject({
    id: UuidSchema, status: z.string(), updatedAt: TimestampSchema,
    /** 화면에 보일 제작 이름. 공고 없이 시작한 제작의 이름, 없으면 공고 제목. 둘 다 없으면 null. */
    title: z.string().max(300).nullable(),
    /** 공고로 시작한 제작의 회사. 공고 없이 시작했으면 null. */
    company: z.strictObject({ name: z.string(), logoUrl: z.string().max(300).nullable() }).nullable(),
  })),
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
export type Notification = z.infer<typeof NotificationSchema>;
export type UnifiedSearchQuery = z.infer<typeof UnifiedSearchQuerySchema>;
export type UnifiedSearchItem = z.infer<typeof UnifiedSearchItemSchema>;
export type UnifiedSearchResponse = z.infer<typeof UnifiedSearchResponseSchema>;
export type HomeReadModel = z.infer<typeof HomeReadModelSchema>;

