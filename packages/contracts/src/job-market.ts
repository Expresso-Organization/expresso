import { z } from "zod";

import { TimestampSchema, UuidSchema } from "./common.js";

export const SubmitJobPostingSchema = z.strictObject({
  companyName: z.string().trim().min(1).max(200),
  companyDomain: z.string().trim().max(255).optional(),
  title: z.string().trim().min(1).max(300),
  sourceUrl: z.url().max(2_000).optional(),
  descriptionRaw: z.string().min(200).max(1_000_000),
});

export const SubmittedJobPostingSchema = z.strictObject({
  jobPostingId: UuidSchema,
  jobAnalysisId: UuidSchema,
  status: z.literal("queued"),
  deduplicated: z.boolean(),
});

/**
 * 게시판에 있는 공고를 내 분석으로 가져온다.
 *
 * 붙여넣기와 다른 점은 **공고가 이미 있다**는 것이다. 새로 만드는 것은 나의
 * 분석뿐이라 본문을 다시 보내지 않는다 — 다시 보내면 해시가 달라져 같은 공고가
 * 두 벌 생긴다.
 *
 * 이미 이 공고를 분석했으면 그 분석을 그대로 돌려준다(`reused`). 분석은 공고당
 * 한 벌이어야 커버리지도 요건도 어느 쪽이 내 것인지 말할 수 있다.
 */
export const AnalyzedJobPostingSchema = z.strictObject({
  jobPostingId: UuidSchema,
  jobAnalysisId: UuidSchema,
  status: z.enum(["queued", "running", "done", "failed"]),
  reused: z.boolean(),
});

export const SubmittedJobPostingResponseSchema = z.strictObject({
  data: SubmittedJobPostingSchema,
});

export const AnalyzedJobPostingResponseSchema = z.strictObject({
  data: AnalyzedJobPostingSchema,
});

export const JobSearchFieldSchema = z.enum([
  "role",
  "experience",
  "work_type",
  "location",
  "salary",
  "company_size",
  "technology",
]);

export const JobSearchConditionSchema = z.strictObject({
  field: JobSearchFieldSchema,
  value: z.union([z.string().min(1).max(200), z.number().nonnegative()]),
  enabled: z.boolean(),
  confidence: z.number().min(0).max(1),
});

export const InterpretJobSearchSchema = z.strictObject({
  query: z.string().trim().min(2).max(1_000),
  resultCount: z.number().int().nonnegative().default(0),
});

export const InterpretedJobSearchSchema = z.strictObject({
  originalQuery: z.string().min(2).max(1_000),
  conditions: z.array(JobSearchConditionSchema),
  needsClarification: z.boolean(),
  example: z.string().optional(),
  recentSearchId: UuidSchema,
});

export const SaveJobSearchSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  originalQuery: z.string().min(2).max(1_000),
  conditions: z.array(JobSearchConditionSchema).max(30),
  notify: z.boolean().default(false),
});

export const SavedJobSearchSchema = SaveJobSearchSchema.extend({
  id: UuidSchema,
  createdAt: TimestampSchema,
});

export const UpsertJobInterestSchema = z.strictObject({
  stage: z.enum(["saved", "applied", "closed"]),
  deadlineAt: TimestampSchema.nullable().default(null),
  memo: z.string().max(5_000).nullable().default(null),
});

export const JobRequirementsSchema = z.strictObject({
  technologies: z.array(z.string().min(1).max(100)).default([]),
  impacts: z.array(z.string().min(1).max(200)).default([]),
  roles: z.array(z.string().min(1).max(200)).default([]),
  conditions: z.array(z.string().min(1).max(200)).default([]),
});

/**
 * 축은 요건을 묶어 보여주는 **분류**다. 배점이 아니다.
 *
 * 예전에는 축마다 만점(40 / 30 / 20 / 10)을 두고 가중 합을 냈는데, 그 숫자의
 * 근거를 댈 수 없어 걷어냈다. 공고가 기술을 네 줄, 근무 조건을 한 줄 적었다면
 * 그 자체로 기술이 총점에 네 배 들어간다 — 따로 가중할 이유가 없다(§8.1).
 */
export const MatchAxisSchema = z.strictObject({
  /** 공고가 이 축에서 요구한 항목 수. 0이면 총점 계산에서 통째로 빠진다. */
  required: z.number().int().nonnegative(),
  covered: z.number().int().nonnegative(),
  matched: z.array(z.string()),
  missing: z.array(z.string()),
});

export const ExplainableMatchSchema = z
  .strictObject({
    jobPostingId: UuidSchema,
    /** round(100 × covered ÷ required). */
    total: z.number().int().min(0).max(100),
    covered: z.number().int().nonnegative(),
    /**
     * 공고가 명시한 요건 수. 0이면 점수를 내지 않는다 — 요건을 못 읽은 것과
     * 요건이 없는 것을 만점으로 뭉뚱그리면 추출기가 약할수록 점수가 높아진다.
     */
    required: z.number().int().positive(),
    axes: z.strictObject({
      technology: MatchAxisSchema,
      impact: MatchAxisSchema,
      role: MatchAxisSchema,
      conditions: MatchAxisSchema,
    }),
    reason: z.string().min(1).max(500),
    nextAction: z.string().min(1).max(500),
    computedAt: TimestampSchema,
  })
  .superRefine((match, context) => {
    const axes = Object.values(match.axes);
    const required = axes.reduce((sum, axis) => sum + axis.required, 0);
    const covered = axes.reduce((sum, axis) => sum + axis.covered, 0);
    if (required !== match.required || covered !== match.covered) {
      context.addIssue({
        code: "custom",
        message: "match totals must be the sum of the axes",
        path: ["axes"],
      });
    }
    if (match.total !== Math.round((100 * match.covered) / match.required)) {
      context.addIssue({
        code: "custom",
        message: "match total must be the coverage ratio",
        path: ["total"],
      });
    }
  });

export const JobDemandSummarySchema = z.strictObject({
  sampleSize: z.number().int().nonnegative(),
  demandRatios: z.record(z.string(), z.number().min(0).max(1)).nullable(),
});

export type SubmitJobPosting = z.infer<typeof SubmitJobPostingSchema>;
export type AnalyzedJobPosting = z.infer<typeof AnalyzedJobPostingSchema>;
export type JobSearchCondition = z.infer<typeof JobSearchConditionSchema>;
export type SaveJobSearch = z.infer<typeof SaveJobSearchSchema>;
export type UpsertJobInterest = z.infer<typeof UpsertJobInterestSchema>;
export type JobRequirements = z.infer<typeof JobRequirementsSchema>;
export type ExplainableMatch = z.infer<typeof ExplainableMatchSchema>;
