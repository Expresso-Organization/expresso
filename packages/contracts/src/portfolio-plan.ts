import { z } from "zod";

import { TimestampSchema, UuidSchema } from "./common.js";

export const CompanyResearchKindSchema = z.enum(["fact", "signal"]);
export const CompanyResearchConfidenceSchema = z.enum(["low", "medium", "high"]);

/** 검색 결과를 그대로 싣지 않고 사실과 해석을 분리해 보존한다. */
export const CompanyResearchItemSchema = z.strictObject({
  id: UuidSchema,
  companyId: UuidSchema,
  kind: CompanyResearchKindSchema,
  topic: z.string().min(1).max(100),
  statement: z.string().min(1).max(2_000),
  sourceUrl: z.string().url().max(2_000).nullable(),
  publishedAt: TimestampSchema.nullable(),
  capturedAt: TimestampSchema,
  confidence: CompanyResearchConfidenceSchema,
  basisFactIds: z.array(UuidSchema).max(20),
});

export const ReplaceCompanyResearchSchema = z.strictObject({
  items: z.array(z.strictObject({
    kind: CompanyResearchKindSchema,
    topic: z.string().trim().min(1).max(100),
    statement: z.string().trim().min(1).max(2_000),
    sourceUrl: z.string().url().max(2_000).nullable(),
    publishedAt: TimestampSchema.nullable(),
    confidence: CompanyResearchConfidenceSchema,
    /** signal만 fact의 요청 배열 위치를 가리킨다. */
    basisFactIndexes: z.array(z.number().int().nonnegative()).max(20),
  })).max(50),
});

export const CompanyResearchResponseSchema = z.strictObject({
  data: z.strictObject({ items: z.array(CompanyResearchItemSchema) }),
});

export const BrewCompanyResearchParamsSchema = z.strictObject({ brewId: UuidSchema });

export const PortfolioRequirementCoverageSchema = z.strictObject({
  requirementId: UuidSchema,
  requirementLabel: z.string().min(1).max(1_000),
  priority: z.number().min(0).max(1),
  evidenceIds: z.array(UuidSchema).max(10),
  coverage: z.enum(["covered", "partial", "missing"]),
  reason: z.string().min(1).max(500),
});

export const PortfolioClaimSchema = z.strictObject({
  id: z.string().min(1).max(100),
  intent: z.string().min(1).max(500),
  evidenceIds: z.array(UuidSchema).min(1).max(10),
  allowedNumbers: z.array(z.string().min(1).max(120)).max(20),
});

export const PortfolioPlanSectionSchema = z.strictObject({
  id: UuidSchema,
  title: z.string().min(1).max(300),
  purpose: z.string().min(1).max(1_000),
  takeaway: z.string().min(1).max(500),
  evidenceIds: z.array(UuidSchema).min(1).max(20),
  contentPattern: z.enum(["hero", "case-study", "metrics", "timeline", "capabilities", "about", "contact"]),
  interactionOpportunity: z.string().max(300).nullable(),
  targetLength: z.number().int().positive(),
});

/**
 * 공고·회사 조사·사용자 기록을 합쳐 만든 내용 설계 계약.
 *
 * 색, 폰트, 픽셀 배치는 없다. 그것들은 StyleSpec과 페이지 생성기의 책임이다.
 */
export const PortfolioPlanSchema = z.strictObject({
  version: z.literal(1),
  target: z.strictObject({
    company: z.string().min(1).max(300),
    role: z.string().min(1).max(300),
    primaryReaders: z.array(z.string().min(1).max(100)).min(1).max(5),
    decisionGoal: z.string().min(1).max(500),
  }),
  positioning: z.strictObject({
    headlineIntent: z.string().min(1).max(500),
    valueProposition: z.string().min(1).max(500),
    differentiators: z.array(z.string().min(1).max(300)).min(1).max(5),
  }),
  requirementCoverage: z.array(PortfolioRequirementCoverageSchema).max(20),
  narrative: z.strictObject({
    arc: z.string().min(1).max(1_000),
    sectionOrder: z.array(UuidSchema).min(1).max(10),
  }),
  sections: z.array(PortfolioPlanSectionSchema).min(1).max(10),
  claims: z.array(PortfolioClaimSchema).max(30),
  exclusions: z.array(z.string().min(1).max(500)).max(30),
  unusedEvidence: z.array(z.strictObject({
    evidenceId: UuidSchema,
    reason: z.string().min(1).max(500),
  })).max(40),
  companyContext: z.array(CompanyResearchItemSchema).max(50),
  rationale: z.string().min(1).max(2_000),
});

/** 설계 모델이 번호로 근거를 가리키는 중간 출력. UUID 전사는 서버가 한다. */
export const PortfolioPlanDraftCoreSchema = z.strictObject({
  positioning: z.strictObject({
    headlineIntent: z.string().min(1).max(500),
    valueProposition: z.string().min(1).max(500),
    differentiators: z.array(z.string().min(1).max(300)).min(1).max(5),
  }),
  requirementCoverage: z.array(z.strictObject({
    requirementSource: z.number().int().min(1).max(40),
    priority: z.number().min(0).max(1),
    evidenceSources: z.array(z.number().int().min(1).max(40)).max(10),
    coverage: z.enum(["covered", "partial", "missing"]),
    reason: z.string().min(1).max(500),
  })).max(20),
  narrativeArc: z.string().min(1).max(1_000),
  claims: z.array(z.strictObject({
    intent: z.string().min(1).max(500),
    evidenceSources: z.array(z.number().int().min(1).max(40)).min(1).max(10),
    allowedNumbers: z.array(z.string().min(1).max(120)).max(20),
  })).max(30),
  exclusions: z.array(z.string().min(1).max(500)).max(30),
  rationale: z.string().min(1).max(2_000),
});

export const PortfolioPlanningManifestSchema = z.strictObject({
  methodologyVersion: z.literal(1),
  model: z.string().min(1).max(200).nullable(),
  promptVersion: z.number().int().nonnegative(),
  attempts: z.number().int().min(1).max(2),
  sourceCounts: z.strictObject({
    records: z.number().int().nonnegative(),
    requirements: z.number().int().nonnegative(),
    answers: z.number().int().nonnegative(),
    companyResearch: z.number().int().nonnegative(),
  }),
  sourceUrls: z.array(z.string().url().max(2_000)).max(100),
  usage: z.strictObject({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    cacheReadTokens: z.number().int().nonnegative(),
    cacheCreationTokens: z.number().int().nonnegative(),
    durationMs: z.number().int().nonnegative(),
    costUsd: z.number().nonnegative().nullable(),
  }).nullable(),
});

export type CompanyResearchItem = z.infer<typeof CompanyResearchItemSchema>;
export type ReplaceCompanyResearch = z.infer<typeof ReplaceCompanyResearchSchema>;
export type PortfolioPlan = z.infer<typeof PortfolioPlanSchema>;
export type PortfolioPlanDraftCore = z.infer<typeof PortfolioPlanDraftCoreSchema>;
export type PortfolioPlanningManifest = z.infer<typeof PortfolioPlanningManifestSchema>;
