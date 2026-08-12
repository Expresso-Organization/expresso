import { z } from "zod";

import { TimestampSchema, UuidSchema } from "./common.js";
import { JobRequirementsSchema } from "./job-market.js";

export const JobSourceSpanSchema = z.strictObject({
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  quote: z.string().min(1).max(5_000),
}).refine((span) => span.end > span.start);

/**
 * 일치도의 네 축(§8.1). `other`는 "어느 축에도 확실히 안 붙는다"는 뜻이고,
 * 총점에는 들어가되 축 게이지에서는 빠진다 — 억지로 분류하지 않는다.
 */
export const JobRequirementAxisSchema = z.enum([
  "technology",
  "impact",
  "role",
  "conditions",
  "other",
]);

export const ExtractedRequirementSchema = z.strictObject({
  label: z.string().trim().min(1).max(300),
  kind: z.enum(["must", "nice", "tone"]),
  axis: JobRequirementAxisSchema,
  sourceSpan: JobSourceSpanSchema,
});

export const JobAnalysisExtractionSchema = z.strictObject({
  requirements: z.array(ExtractedRequirementSchema).min(3).max(6),
  normalized: JobRequirementsSchema,
});

/**
 * 모델이 내는 모양. 내부 계약(`JobAnalysisExtractionSchema`)과 **다르다**.
 *
 * 글자 위치(`start`/`end`)를 모델에게 세라고 하지 않는다 — 인용문만 받고
 * 위치는 원문에서 우리가 찾는다. 원문에 없는 인용은 그 항목을 버린다
 * (§8.3 환각 방지 ②). 그래서 여기서는 3–8개를 허용하고, 버린 뒤에도 3개가
 * 남아야 내부 계약을 만족한다.
 */
export const JobAnalysisAiOutputSchema = z.strictObject({
  requirements: z
    .array(
      z.strictObject({
        label: z.string().trim().min(1).max(300),
        kind: z.enum(["must", "nice", "tone"]),
        axis: JobRequirementAxisSchema,
        /** 공고 원문에서 그대로 잘라 온 문장. 한 글자도 바꾸지 않는다. */
        quote: z.string().min(1).max(5_000),
      }),
    )
    .min(3)
    .max(8),
  normalized: JobRequirementsSchema,
});

export const RequirementCoverageSchema = z.strictObject({
  requirementId: UuidSchema,
  label: z.string().min(1).max(300),
  kind: z.enum(["must", "nice", "tone"]),
  /** 아직 분류되지 않았거나 어느 축에도 안 붙으면 null. */
  axis: JobRequirementAxisSchema.exclude(["other"]).nullable(),
  sourceSpan: JobSourceSpanSchema,
  coverage: z.enum(["covered", "partial", "missing"]),
  coveredBy: z.array(UuidSchema),
});

export const JobAnalysisStatusSchema = z.strictObject({
  jobAnalysisId: UuidSchema,
  status: z.enum(["queued", "running", "done", "failed"]),
  stage: z.enum(["queued", "extracting", "validating", "covering", "done", "failed"]),
  attempts: z.number().int().nonnegative(),
  resultVersion: z.number().int().nonnegative(),
  failure: z.strictObject({
    code: z.string().min(1).max(100),
    retryable: z.boolean(),
  }).nullable(),
  analyzedAt: TimestampSchema.nullable(),
});

export const JobAnalysisResultSchema = z.strictObject({
  analysis: JobAnalysisStatusSchema,
  requirements: z.array(RequirementCoverageSchema),
  previous: z.strictObject({
    version: z.number().int().positive(),
    requirements: z.array(RequirementCoverageSchema),
    archivedAt: TimestampSchema,
  }).nullable(),
});

export const ReanalysisRequestResultSchema = z.strictObject({
  jobAnalysisId: UuidSchema,
  status: z.literal("queued"),
  targetVersion: z.number().int().positive(),
  impact: z.strictObject({
    brewCount: z.number().int().nonnegative(),
    recipeCount: z.number().int().nonnegative(),
  }),
});

export type JobSourceSpan = z.infer<typeof JobSourceSpanSchema>;
export type ExtractedRequirement = z.infer<typeof ExtractedRequirementSchema>;
export type JobAnalysisExtraction = z.infer<typeof JobAnalysisExtractionSchema>;
export type JobAnalysisAiOutput = z.infer<typeof JobAnalysisAiOutputSchema>;
export type JobRequirementAxis = z.infer<typeof JobRequirementAxisSchema>;
export type RequirementCoverage = z.infer<typeof RequirementCoverageSchema>;
export type JobAnalysisResult = z.infer<typeof JobAnalysisResultSchema>;
