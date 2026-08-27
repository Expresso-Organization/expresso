import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  ApiErrorResponseSchema,
  CursorPaginationQuerySchema,
  CurrentUserResponseSchema,
  CareerCategoriesResponseSchema,
  CareerRecordResponseSchema,
  CreateBrewSchema,
  RecomputeCareerSkillSchema,
  SubmitJobPostingSchema,
  ExplainableMatchSchema,
  LayoutSpecSchema,
  LayoutCandidatesSchema,
  LayoutDraftSchema,
  contrastRatio,
  checkClassName,
  isCompiledClassName,
  mediaAssetUrl,
  mediaSrcSet,
  flattenRuns,
  draftBlockText,
  normalizeListItem,
  TextRunSchema,
  GenerationDraftBlockSchema,
  MediaWidthQuerySchema,
  PortfolioMediaSchema,
  EntitlementDecisionResponseSchema,
  IdempotencyKeySchema,
  IdentitySessionIdParamsSchema,
  IssuedIdentitySessionSchema,
  JobAnalysisExtractionSchema,
  InterviewSessionSchema,
  JobProgressEventSchema,
  UpdateBrewMaterialsSchema,
  createCursorPageSchema,
  createJobEnvelopeSchema,
  expressoOpenApiDocument,
  formatResourceEtag,
  parseResourceEtag,
  composeTemplateStyle,
  PAGE_KIT_CSS,
  pageKitPrompt,
  PortfolioPlanSchema,
  RecipeDraftSchema,
} from "./index.js";

const ids = {
  job: "11111111-1111-4111-8111-111111111111",
  user: "22222222-2222-4222-8222-222222222222",
};

describe("advisory recipe and plan contracts", () => {
  it("keeps a single complete section even when source links and editorial lists are empty", () => {
    expect(RecipeDraftSchema.parse({
      plan: {
        positioning: { headlineIntent: "소개", valueProposition: "가치", differentiators: [] },
        requirementCoverage: [], narrativeArc: "한 페이지 흐름", claims: [], exclusions: [], rationale: "초안 이유",
      },
      sections: [{
        title: "소개", purpose: "전체 초안", targetLength: 0, goal: "읽기 시작", points: [], metrics: [],
        tone: "professional", format: "narrative", exclude: [], takeaway: "한 가지", contentPattern: "hero",
        interactionOpportunity: null, items: [],
      }],
      unused: [],
    }).sections).toHaveLength(1);

    expect(PortfolioPlanSchema.parse({
      version: 1,
      target: { company: "회사", role: "직무", primaryReaders: [], decisionGoal: "검토" },
      positioning: { headlineIntent: "소개", valueProposition: "가치", differentiators: [] },
      requirementCoverage: [], narrative: { arc: "흐름", sectionOrder: [] },
      sections: [{
        id: ids.job, title: "소개", purpose: "전체 초안", takeaway: "한 가지", evidenceIds: [],
        contentPattern: "hero", interactionOpportunity: null, targetLength: 0,
      }],
      claims: [{ id: "claim-1", intent: "검토할 주장", evidenceIds: [], allowedNumbers: [] }],
      exclusions: [], unusedEvidence: [], companyContext: [], rationale: "초안 이유",
    }).claims[0]?.evidenceIds).toEqual([]);
  });
});

describe("HTTP contract primitives", () => {
  it("accepts the stable error envelope and rejects unknown error codes", () => {
    expect(
      ApiErrorResponseSchema.parse({
        error: {
          code: "VALIDATION_ERROR",
          message: "title is required",
          requestId: "req_12345678",
          details: { field: "title" },
        },
      }),
    ).toMatchObject({ error: { code: "VALIDATION_ERROR" } });

    expect(() =>
      ApiErrorResponseSchema.parse({
        error: {
          code: "SOMETHING_NEW",
          message: "unstable code",
          requestId: "req_12345678",
        },
      }),
    ).toThrow();
  });

  it("normalizes cursor limits and rejects values outside the contract", () => {
    expect(CursorPaginationQuerySchema.parse({})).toEqual({ limit: 20 });
    expect(CursorPaginationQuerySchema.parse({ limit: "100" }).limit).toBe(100);
    expect(() => CursorPaginationQuerySchema.parse({ limit: 101 })).toThrow();

    const pageSchema = createCursorPageSchema(z.strictObject({ id: z.uuid() }));
    expect(
      pageSchema.parse({
        data: [{ id: ids.user }],
        page: { nextCursor: null, hasNextPage: false },
      }).data,
    ).toHaveLength(1);
  });

  it("validates idempotency keys and quoted resource versions", () => {
    expect(IdempotencyKeySchema.parse("record-create:1234567890")).toBe(
      "record-create:1234567890",
    );
    expect(() => IdempotencyKeySchema.parse("short")).toThrow();
    expect(formatResourceEtag(12)).toBe('"v12"');
    expect(parseResourceEtag('"v12"')).toBe(12);
    expect(() => parseResourceEtag("12")).toThrow();
  });
});

describe("identity contracts", () => {
  it("validates protected user and opaque session boundaries", () => {
    expect(
      CurrentUserResponseSchema.parse({
        data: {
          id: ids.user,
          email: "user@example.com",
          displayName: "User",
          planCode: "free",
        },
      }).data.planCode,
    ).toBe("free");
    expect(
      IdentitySessionIdParamsSchema.parse({ sessionId: ids.job }).sessionId,
    ).toBe(ids.job);
    expect(
      IssuedIdentitySessionSchema.parse({
        sessionId: ids.job,
        accessToken: `exps_${"a".repeat(43)}`,
        expiresAt: "2026-08-10T00:00:00Z",
      }).accessToken,
    ).toMatch(/^exps_/);

    expect(() =>
      IssuedIdentitySessionSchema.parse({
        sessionId: ids.job,
        accessToken: "plaintext-token",
        expiresAt: "2026-08-10T00:00:00Z",
      }),
    ).toThrow();
  });
});

describe("entitlement contracts", () => {
  it("uses one decision shape for generation, export, and advanced analysis", () => {
    for (const capability of [
      "portfolio.generate",
      "export.document",
      "analysis.advanced",
    ] as const) {
      const parsed = EntitlementDecisionResponseSchema.parse({
        data: {
          capability,
          planCode: "free",
          allowed: capability === "portfolio.generate",
          reason: capability === "portfolio.generate"
            ? "ENTITLED"
            : "PLAN_REQUIRED",
          ...(capability === "portfolio.generate"
            ? {
                usage: {
                  periodStart: "2026-08-01",
                  resetsAt: "2026-08-31T15:00:00Z",
                  used: 2,
                  limit: 3,
                  remaining: 1,
                },
              }
            : {}),
        },
      });
      expect(parsed.data.capability).toBe(capability);
    }
  });
});

describe("career contracts", () => {
  it("validates categories, versioned records, and exact skill spans", () => {
    expect(
      CareerCategoriesResponseSchema.parse({
        data: [{
          id: ids.job,
          key: "experience",
          name: "경험",
          icon: "briefcase",
          defaultView: "table",
          isSystem: true,
          propertySchema: {},
          sortOrder: 0,
          recordCount: 0,
          version: 1,
        }],
      }).data,
    ).toHaveLength(1);
    expect(
      CareerRecordResponseSchema.parse({
        data: {
          id: ids.job,
          categoryId: ids.user,
          title: "Backend migration",
          status: "draft",
          origin: "manual",
          properties: {},
          bodyMd: "Implemented an immutable migration.",
          version: 2,
          updatedAt: "2026-08-09T00:00:00Z",
        },
        resource: { version: 2, updatedAt: "2026-08-09T00:00:00Z" },
      }).resource.version,
    ).toBe(2);
    expect(
      RecomputeCareerSkillSchema.parse({
        name: "PostgreSQL",
        evidence: [{
          recordId: ids.job,
          span: { source: "body_md", start: 15, end: 24, quote: "immutable" },
        }],
      }).evidence,
    ).toHaveLength(1);
    expect(() =>
      RecomputeCareerSkillSchema.parse({ name: "No Evidence", evidence: [] }),
    ).toThrow();
  });
});

describe("job market contracts", () => {
  it("rejects short source text and validates explainable four-axis scores", () => {
    expect(() => SubmitJobPostingSchema.parse({
      companyName: "Example",
      title: "Engineer",
      descriptionRaw: "too short",
    })).toThrow();
    const match = {
      jobPostingId: ids.job,
      total: 75,
      covered: 3,
      required: 4,
      axes: {
        technology: { required: 2, covered: 1, matched: ["postgresql"], missing: ["kafka"] },
        impact: { required: 1, covered: 1, matched: ["scale"], missing: [] },
        role: { required: 0, covered: 0, matched: [], missing: [] },
        conditions: { required: 1, covered: 1, matched: ["remote"], missing: [] },
      },
      reason: "One technology gap remains.",
      nextAction: "Add one record with that technology.",
      computedAt: "2026-08-09T00:00:00Z",
    };
    expect(ExplainableMatchSchema.parse(match).total).toBe(75);
    // 총점은 축의 합에서만 나온다 — 따로 적은 숫자를 믿지 않는다.
    expect(() => ExplainableMatchSchema.parse({ ...match, total: 90 })).toThrow();
    expect(() => ExplainableMatchSchema.parse({ ...match, covered: 4 })).toThrow();
    // 요건이 0개면 애초에 점수가 성립하지 않는다.
    expect(() => ExplainableMatchSchema.parse({
      ...match,
      total: 0,
      covered: 0,
      required: 0,
      axes: {
        technology: { required: 0, covered: 0, matched: [], missing: [] },
        impact: { required: 0, covered: 0, matched: [], missing: [] },
        role: { required: 0, covered: 0, matched: [], missing: [] },
        conditions: { required: 0, covered: 0, matched: [], missing: [] },
      },
    })).toThrow();
  });
});

describe("job analysis contracts", () => {
  it("requires three to six requirements with bounded exact-source coordinates", () => {
    const requirement = {
      label: "PostgreSQL 운영 경험",
      kind: "must" as const,
      axis: "technology" as const,
      sourceSpan: { start: 0, end: 15, quote: "PostgreSQL 운영 경험" },
    };
    const normalized = {
      technologies: ["postgresql"],
      impacts: [],
      roles: ["backend"],
      conditions: [],
    };

    expect(JobAnalysisExtractionSchema.parse({
      requirements: [requirement, requirement, requirement],
      normalized,
    }).requirements).toHaveLength(3);
    expect(() => JobAnalysisExtractionSchema.parse({
      requirements: [requirement, requirement],
      normalized,
    })).toThrow();
    expect(() => JobAnalysisExtractionSchema.parse({
      requirements: [
        { ...requirement, sourceSpan: { start: 2, end: 2, quote: "bad" } },
        requirement,
        requirement,
      ],
      normalized,
    })).toThrow();
  });
});

describe("brew material contracts", () => {
  it("allows none to ten unique selected records", () => {
    expect(CreateBrewSchema.parse({ jobAnalysisId: ids.job })).toMatchObject({
      jobAnalysisId: ids.job,
      lengthPreset: "single",
    });
    expect(UpdateBrewMaterialsSchema.parse({ recordIds: [ids.job] }).recordIds)
      .toEqual([ids.job]);
    // 재료를 하나도 고르지 않은 채로 진행할 수 있다 — 빈 배열은 계약이 받는다.
    expect(UpdateBrewMaterialsSchema.parse({ recordIds: [] }).recordIds).toEqual([]);
    expect(() => UpdateBrewMaterialsSchema.parse({
      recordIds: Array.from({ length: 11 }, () => ids.job),
    })).toThrow();
    expect(() => UpdateBrewMaterialsSchema.parse({
      recordIds: [ids.job, ids.job],
    })).toThrow();
  });
});

describe("interview contracts", () => {
  it("requires three grounded questions and reports stable progress", () => {
    const question = {
      id: ids.job,
      order: 0,
      text: "어떤 장애를 해결했나요?",
      basis: {
        type: "requirement" as const,
        requirementId: ids.job,
        coverage: "missing" as const,
        evidence: "장애 대응 경험이 필요합니다.",
      },
      rationale: "공고가 장애 대응을 요구하는데 기록에 없습니다.",
      replacedFromId: null,
      skipped: false,
      answered: false,
    };
    expect(InterviewSessionSchema.parse({
      id: ids.job,
      brewId: ids.user,
      status: "open",
      currentOrder: 0,
      answeredCount: 0,
      questionCount: 3,
      questionsMayAdapt: true,
      questions: [question, { ...question, order: 1 }, { ...question, order: 2 }],
    }).questions).toHaveLength(3);
    expect(() => InterviewSessionSchema.parse({
      id: ids.job,
      brewId: ids.user,
      status: "open",
      currentOrder: 0,
      answeredCount: 0,
      questionCount: 2,
      questionsMayAdapt: true,
      questions: [question, { ...question, order: 1 }],
    })).toThrow();
  });
});

describe("background job contracts", () => {
  const payloadSchema = z.strictObject({ jobPostingId: z.uuid() });
  const envelopeSchema = createJobEnvelopeSchema("job_analysis", payloadSchema);

  it("accepts a versioned job payload and rejects an invalid payload", () => {
    const envelope = {
      schemaVersion: 1,
      jobId: ids.job,
      type: "job_analysis",
      userId: ids.user,
      idempotencyKey: "analysis:1234567890",
      traceId: "trace_12345678",
      enqueuedAt: "2026-08-09T00:00:00Z",
      payload: { jobPostingId: ids.job },
    };

    expect(envelopeSchema.parse(envelope).type).toBe("job_analysis");
    expect(() => envelopeSchema.parse({ ...envelope, type: "generation" })).toThrow();
    expect(() =>
      envelopeSchema.parse({ ...envelope, payload: { jobPostingId: "bad" } }),
    ).toThrow();
  });

  it("requires structured failure evidence only for failed states", () => {
    const base = {
      schemaVersion: 1,
      jobId: ids.job,
      stage: "extracting_requirements",
      progress: 50,
      occurredAt: "2026-08-09T00:00:00Z",
    };

    expect(
      JobProgressEventSchema.parse({ ...base, status: "running" }).status,
    ).toBe("running");
    expect(() =>
      JobProgressEventSchema.parse({ ...base, status: "failed" }),
    ).toThrow();
    expect(
      JobProgressEventSchema.parse({
        ...base,
        status: "failed",
        failure: {
          code: "PROVIDER_TIMEOUT",
          retryable: true,
          message: "provider timed out",
        },
      }).failure,
    ).toMatchObject({ retryable: true });
  });
});

describe("OpenAPI conformance", () => {
  it("publishes every shared schema as an OpenAPI 3.1 component", () => {
    expect(expressoOpenApiDocument.openapi).toBe("3.1.0");
    expect(Object.keys(expressoOpenApiDocument.components.schemas)).toEqual([
      "ApiErrorResponse",
      "CursorPaginationQuery",
      "PageInfo",
      "ResourceVersion",
      "IdempotencyHeaders",
      "IfMatchHeader",
      "JobEnvelopeBase",
      "JobProgressEvent",
      "AuthenticatedUser",
      "CurrentUserResponse",
      "IdentitySessionIdParams",
      "IssuedIdentitySession",
      "EntitlementUsage",
      "EntitlementDecision",
      "EntitlementCapabilityParams",
      "EntitlementDecisionResponse",
      "CareerCategory",
      "CareerCategoriesResponse",
      "CareerRecord",
      "CareerRecordResponse",
      "CreateCareerRecord",
      "UpdateCareerRecord",
      "CareerView",
      "CareerDeleteImpact",
      "RecomputeCareerSkill",
      "CareerSkill",
      "CareerSkillEvidenceResponse",
      "SubmitJobPosting",
      "SubmittedJobPosting",
      "JobSearchCondition",
      "InterpretedJobSearch",
      "JobRequirements",
      "ExplainableMatch",
      "JobDemandSummary",
      "JobAnalysisExtraction",
      "RequirementCoverage",
      "JobAnalysisStatus",
      "JobAnalysisResult",
      "ReanalysisRequestResult",
      "CreateBrew",
      "BrewMaterial",
      "BrewMaterials",
      "UpdateBrewMaterials",
      "InterviewQuestionBasis",
      "InterviewQuestion",
      "InterviewAnswer",
      "InterviewSession",
      "SaveInterviewAnswer",
      "InterviewAnswerResult",
      "RecipeEvidencePath",
      "RecipeItem",
      "RecipeSection",
      "Recipe",
      "RecipeEdit",
      "RecipeEditResult",
      "TemplateStyle",
      "TemplatePreview",
      "TemplatePreviews",
      "SubmitGeneration",
      "GenerationJobStatus",
      "GenerationOutput",
      "PortfolioEditCommand",
      "PortfolioEditProposal",
      "ApplyPortfolioEditResult",
      "RestorePortfolio",
      "PublishPortfolio",
      "Deployment",
      "PublicPortfolio",
      "SubmitExport",
      "ReplaceResume",
      "SignedAsset",
      "AnalyticsEvent",
      "DashboardViewInput",
      "DerivedMetricInput",
      "Insight",
      "NotificationPreference",
      "Notification",
      "UnifiedSearchQuery",
      "UnifiedSearchItem",
      "HomeReadModel",
      "AccountExport",
      "DeletionRequest",
      "CancelDeletion",
    ]);

    for (const schema of Object.values(
      expressoOpenApiDocument.components.schemas,
    )) {
      expect(schema).toMatchObject({
        $schema: "https://json-schema.org/draft/2020-12/schema",
      });
    }
  });
});

describe("본문의 결", () => {
  it("run을 이어 붙인 평문이 근거 검증을 받는다 — 두 곳에 같은 글을 적게 하지 않는다", () => {
    const runs = [
      { text: "정산 배치를 " },
      { text: "3시간 40분에서 24분으로", mark: "strong" as const },
      { text: " 줄였습니다." },
    ];
    expect(flattenRuns(runs)).toBe("정산 배치를 3시간 40분에서 24분으로 줄였습니다.");
    // 모델이 runs로 내면 text는 우리가 만든다.
    expect(draftBlockText({ runs })).toBe(flattenRuns(runs));
    // 쌍으로 낸 목록도 평문 한 벌이 나온다.
    expect(draftBlockText({ items: ["Java", { term: "역할", value: "백엔드" }] }))
      .toBe("Java\n역할 백엔드");
  });

  it("링크는 바깥으로 나가는 주소만 받는다", () => {
    expect(TextRunSchema.safeParse({ text: "논문", href: "https://example.com/p" }).success)
      .toBe(true);
    // 남의 브라우저에서 열리는 지면이다. 스크립트 주소를 실을 수 없다.
    expect(TextRunSchema.safeParse({ text: "x", href: "javascript:alert(1)" }).success)
      .toBe(false);
    expect(TextRunSchema.safeParse({ text: "x", href: "/relative" }).success).toBe(false);
  });

  it("목록 항목은 문자열이거나 이름–값 쌍이다", () => {
    expect(normalizeListItem("Kotlin")).toEqual({ term: null, value: "Kotlin" });
    expect(normalizeListItem({ term: "기간", value: "2024–2026" }))
      .toEqual({ term: "기간", value: "2024–2026" });
  });

  it("글이 하나도 없는 블록은 만들 수 없다", () => {
    const base = { section: 1, kind: "paragraph" as const, sources: [1] };
    expect(GenerationDraftBlockSchema.safeParse(base).success).toBe(false);
    expect(GenerationDraftBlockSchema.safeParse({ ...base, text: "한 줄" }).success).toBe(true);
    // runs는 문장에만 — 목록에 붙이면 어디에 그릴지 알 수 없다.
    expect(GenerationDraftBlockSchema.safeParse({
      ...base, kind: "list", runs: [{ text: "가" }],
    }).success).toBe(false);
  });
});

describe("올린 그림", () => {
  const media = {
    assetId: ids.job,
    alt: "결제 관제 대시보드",
    frame: "browser" as const,
    width: 2400,
    height: 1350,
    variants: [640, 1280, 1920, 2400],
  };

  it("폭마다 주소를 하나씩 내밀고 브라우저가 고른다", () => {
    expect(mediaAssetUrl("https://api.example.com/", ids.job)).toBe(
      `https://api.example.com/v1/media/${ids.job}`,
    );
    expect(mediaAssetUrl("https://api.example.com", ids.job, 640)).toBe(
      `https://api.example.com/v1/media/${ids.job}?w=640`,
    );

    const srcSet = mediaSrcSet("https://api.example.com", PortfolioMediaSchema.parse(media));
    expect(srcSet).toContain(`?w=640 640w`);
    expect(srcSet).toContain(`?w=2400 2400w`);
    expect(srcSet?.split(", ")).toHaveLength(4);
  });

  it("변형이 없으면 srcset을 내밀지 않는다 — 옛 자산과 변환 실패가 여기로 온다", () => {
    const bare = PortfolioMediaSchema.parse({ ...media, variants: [] });
    expect(mediaSrcSet("https://api.example.com", bare)).toBeUndefined();
  });

  it("요청할 수 있는 폭에 상한이 있다 — 주소가 무한히 갈라지면 캐시가 쓸모없어진다", () => {
    expect(MediaWidthQuerySchema.parse({ w: "640" }).w).toBe(640);
    expect(MediaWidthQuerySchema.safeParse({ w: "99999" }).success).toBe(false);
    expect(MediaWidthQuerySchema.safeParse({ w: "0" }).success).toBe(false);
  });
});

describe("layout spec", () => {
  const base = {
    type: { display: "serif-editorial" as const, body: "sans-neutral" as const, scaleRatio: 1.333, measure: 62 },
    palette: { ink: "#16223A", paper: "#FFFFFF", accent: "#9A4030", muted: "#5A6473" },
    rhythm: { density: "spacious" as const, sectionGap: 96 },
    pageClassName: "font-body text-ink bg-paper break-keep",
    sectionLabelClassName: "text-step-1 font-mono tracking-widest text-accent",
    sections: [
      {
        portfolioSectionId: ids.job,
        className: "py-24 px-8 bg-paper",
        innerClassName: "grid gap-6 max-w-measure mx-auto",
      },
    ],
    blockClasses: { heading: "text-step4 font-display", metric: "text-step3 text-accent" },
    rationale: "수치가 많아 지표를 크게 세웠습니다.",
  };

  it("읽을 수 없는 지면은 계약에서 거절한다", () => {
    expect(LayoutSpecSchema.parse(base).rationale).toContain("지표");
    // 흰 지면에 옅은 회색 본문 — 예뻐 보여도 못 읽는다.
    expect(() => LayoutSpecSchema.parse({
      ...base, palette: { ...base.palette, ink: "#BBBBBB" },
    })).toThrow();
    expect(contrastRatio("#16223A", "#FFFFFF")).toBeGreaterThan(4.5);
  });

  it("통과한 클래스는 반드시 그려진다 — 어휘와 CSS가 한 소스다", () => {
    expect(checkClassName("grid grid-cols-3 gap-8 tracking-tight italic").ok).toBe(true);
    // 블록이 섹션을 벗어나는 것은 표현이 아니라 사고다.
    expect(checkClassName("absolute inset-0 z-50").rejected).toHaveLength(3);
    // 색은 팔레트 토큰만 — 대비를 계산할 수 있어야 한다.
    expect(checkClassName("text-slate-400").rejected[0]?.reason).toContain("팔레트");
    expect(checkClassName("text-ink bg-accent").ok).toBe(true);
    // 임의값은 컴파일되지도, 검증되지도 않는다.
    expect(checkClassName("text-[13.7px]").ok).toBe(false);
    // 변형 접두사가 붙어도 본체를 본다.
    expect(checkClassName("md:absolute").ok).toBe(false);

    // 어휘 밖은 거절한다. 전에는 통과시킨 뒤 **조용히 사라졌다** —
    // 모델은 자기가 짠 지면이 그려졌는지 알 방법이 없었다.
    expect(checkClassName("w-24").ok).toBe(true);
    expect(checkClassName("w-97").ok).toBe(false);
    expect(checkClassName("backdrop-blur-sm").rejected[0]?.reason).toContain("어휘");
    expect(isCompiledClassName("min-w-0")).toBe(true);
    expect(isCompiledClassName("hover:opacity-80")).toBe(true);
  });

  it("그라디언트는 자리에 따라 갈린다 — 표지는 되고 지면 배경은 안 된다", () => {
    // 섹션 배경에 깔린 두 단 그라디언트가 AI 티의 대표 자리다.
    expect(checkClassName("bg-linear-to-r from-accent to-ink", "section").ok).toBe(false);
    // 카드 표지에서는 그라디언트가 표지 미술이다.
    expect(checkClassName("bg-linear-to-br from-accent/40 to-ink/20", "block").ok).toBe(true);
    // 스펙에서도 자리마다 다르게 걸린다.
    expect(() => LayoutSpecSchema.parse({
      ...base, sections: [{ ...base.sections[0]!, className: "bg-linear-to-b from-accent to-paper" }],
    })).toThrow(/표지/);
    expect(LayoutSpecSchema.parse({
      ...base,
      sections: [{
        ...base.sections[0]!,
        items: [{
          kind: "group" as const,
          className: "rounded-2xl p-6 bg-linear-to-br from-accent/40 to-ink/20",
          items: [{ kind: "block" as const, blockId: ids.user }],
        }],
      }],
    }).sections[0]?.items).toHaveLength(1);
  });

  it("배치 나무가 블록을 묶는다 — 카드는 여기서 나온다", () => {
    const withCard = {
      ...base,
      sections: [{
        ...base.sections[0]!,
        items: [
          { kind: "label" as const, className: "text-step-1 font-mono uppercase" },
          {
            kind: "group" as const,
            className: "border border-hairline rounded-2xl p-6 grid gap-3",
            items: [
              { kind: "block" as const, blockId: ids.user, className: "text-step2 font-display" },
              { kind: "block" as const, blockId: ids.job },
            ],
          },
        ],
      }],
    };
    expect(LayoutSpecSchema.parse(withCard).sections[0]?.items).toHaveLength(2);
    // 옛 지면에는 나무가 없다. 그때는 블록을 순서대로 눕힌다.
    expect(LayoutSpecSchema.parse(base).sections[0]?.items).toEqual([]);
    // 같은 블록을 두 번 세우면 같은 문장이 지면에 두 번 나온다.
    expect(() => LayoutDraftSchema.parse({
      ...base,
      sections: [{
        section: 1,
        className: "py-24 px-8",
        innerClassName: "grid gap-6",
        items: [
          { kind: "block" as const, block: 3 },
          { kind: "group" as const, className: "grid gap-2", items: [{ kind: "block" as const, block: 3 }] },
        ],
      }],
    })).toThrow(/두 번/);
  });

  it("막힌 클래스가 든 스펙은 통째로 거절한다", () => {
    expect(() => LayoutSpecSchema.parse({
      ...base, pageClassName: "bg-indigo-600",
    })).toThrow(/팔레트/);
  });

  it("같은 섹션을 두 번 놓지 않는다", () => {
    expect(() => LayoutSpecSchema.parse({
      ...base, sections: [base.sections[0]!, base.sections[0]!],
    })).toThrow(/두 번/);
  });

  it("초안은 섹션을 번호로 가리킨다 — 모델에게 UUID를 옮겨 적게 하지 않는다", () => {
    const { sections: _placed, ...shared } = base;
    const draft = {
      ...shared,
      sections: [{ section: 1, className: "py-24 px-8", innerClassName: "grid gap-6" }],
    };
    expect(LayoutDraftSchema.parse(draft).sections[0]?.section).toBe(1);
    // 같은 번호를 두 번 놓으면 한 섹션이 지면에서 사라진다.
    expect(() => LayoutDraftSchema.parse({
      ...draft, sections: [draft.sections[0]!, draft.sections[0]!],
    })).toThrow(/두 번/);
    // 초안도 같은 대비 기준을 받는다 — 여기서 걸러야 재생성이 걸린다.
    expect(() => LayoutDraftSchema.parse({
      ...draft, palette: { ...base.palette, ink: "#BBBBBB" },
    })).toThrow();
  });

  it("후보 3안은 서체·밀도·골격이 겹쳐서는 안 된다", () => {
    const recolored = { ...base, palette: { ...base.palette, accent: "#2A48B8" } };
    expect(() => LayoutCandidatesSchema.parse({ candidates: [base, recolored, base] }))
      .toThrow(/충분히 다르지/);
    expect(LayoutCandidatesSchema.parse({
      candidates: [
        base,
        { ...base, type: { ...base.type, display: "mono-technical" as const } },
        { ...base, rhythm: { ...base.rhythm, density: "compact" as const } },
      ],
    }).candidates).toHaveLength(3);
  });
});

describe("문법 합성", () => {
  const base = {
    background: "#ffffff", text: "#1f2937", accent: "#2563eb",
    font: "sans", density: "comfortable", structure: "single-column",
  };

  it("적은 축만 바뀌고 나머지는 템플릿을 따른다", () => {
    // 이게 깨지면 템플릿을 고쳐도 조정한 포트폴리오가 따라오지 않는다.
    expect(composeTemplateStyle(base, { structure: "dense-grid", density: "compact" }))
      .toEqual({ ...base, structure: "dense-grid", density: "compact" });
  });

  it("조정이 없으면 템플릿 그대로", () => {
    expect(composeTemplateStyle(base, {})).toEqual(base);
    expect(composeTemplateStyle(base, null)).toEqual(base);
  });

  it("조정이 깨졌으면 무시하고 템플릿을 쓴다", () => {
    // 반쯤 적용된 문법으로 뽑으면 고른 것과 다른 지면이 나오고 이유를 알 수 없다.
    expect(composeTemplateStyle(base, { structure: "존재하지-않음" })).toEqual(base);
  });

  it("템플릿 자체가 깨졌으면 문법 없이 간다", () => {
    expect(composeTemplateStyle({}, { density: "compact" })).toBeNull();
  });
});

describe("키트", () => {
  it("CSS에 있는 변형은 프롬프트가 전부 알려 준다", () => {
    // 어휘 때 배운 것과 같다 — 실려 나가는 것과 가르치는 것이 갈리면, 모델이
    // 모르는 채로 안 쓰거나 없는 걸 쓴다. 둘 다 조용히 실패한다.
    const doc = pageKitPrompt();
    const inCss = new Set(
      [...PAGE_KIT_CSS.matchAll(/\.(k-[a-z-]+--[a-z-]+)/g)]
        .flatMap(([, name]) => name ? [name] : []),
    );
    // 골격은 문법이 정하므로 변형 목록이 아니라 `.k-page--<골격>`으로 안내한다.
    const variants = [...inCss].filter((name) => !name.startsWith("k-page--"));

    expect(variants.length).toBeGreaterThan(20);
    expect(variants.filter((name) => !doc.includes(name))).toEqual([]);
  });

  it("등장 애니메이션은 @supports 안에 있다", () => {
    // 밖에 있으면 스크롤 타임라인을 모르는 브라우저에서 opacity:0에 멈춰
    // **본문이 통째로 안 보인다.** 실제로 그렇게 만들었다가 잡았다.
    const guarded = PAGE_KIT_CSS.split("@supports").slice(1).join("@supports");
    for (const rule of ["k-reveal{", "k-stagger", "k-progress{display:block"]) {
      expect(guarded).toContain(rule);
    }
  });
});
