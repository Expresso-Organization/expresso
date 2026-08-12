import { z } from "zod";

import { OffsetPageInfoSchema, TimestampSchema, UuidSchema } from "./common.js";
import { JobRequirementsSchema, MatchAxisSchema } from "./job-market.js";

/**
 * 공고 읽기 계약.
 *
 * 00b 검색 결과 · 06 공고 탐색 · 06b 공고 상세가 쓴다. 공고 자체는 전역이고
 * 일치도(`match_score`) · 관심(`interest`) · 해석(`job_analysis`)만 사용자별로
 * 붙는다 — 그래서 같은 공고라도 사람마다 다르게 보인다.
 */

export const JobPostingSourceSchema = z.enum(["api", "partner", "user_input"]);

const HexColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

export const JobPostingCompanySchema = z.strictObject({
  id: UuidSchema,
  name: z.string().min(1).max(200),
  domain: z.string().max(255).nullable(),
  industry: z.string().max(120).nullable(),
  /** 06b가 "공고 말투"로 보여주는 한 줄. */
  toneSummary: z.string().max(1_000).nullable(),
  /**
   * 카드 이니셜 아바타. 글자와 색 모두 정의서가 회사마다 정해 둔 값이다 —
   * 한글 이름에도 라틴 이니셜을 쓰므로 이름에서 잘라낼 수 없다.
   */
  initial: z.string().length(1).nullable(),
  avatarBackground: HexColorSchema.nullable(),
  avatarColor: HexColorSchema.nullable(),
  /**
   * 회사 마크를 내려받는 주소. 못 받아 둔 회사는 null이고, 화면은 이니셜
   * 아바타로 그린다.
   *
   * 회사 서버를 그대로 링크하지 않는다 — 그러면 **보는 사람의 IP가 그 회사로
   * 간다.** 우리가 한 번 받아 둔 바이트를 우리 주소로 내보낸다. 주소 끝의
   * `v=`는 내용 지문이라, 그림이 바뀌면 주소도 바뀐다.
   */
  logoUrl: z.string().max(300).nullable(),
});

/** 06b 톤 카드는 색과 인상까지 쓴다. 목록에는 필요 없어 상세에서만 넓힌다. */
export const JobPostingCompanyDetailSchema = JobPostingCompanySchema.extend({
  /** 표시 순서가 있는 색. 템플릿 스타일용 `tonePalette`와 별개다. */
  brandColors: z.array(HexColorSchema),
  tonePalette: z.record(z.string(), z.string()).nullable(),
  toneImpression: z.string().max(300).nullable(),
});

export const JobTechnologySchema = z.strictObject({
  name: z.string().min(1).max(100),
  /** 내 기록에서 확인된 기술인지. 일치도를 아직 계산하지 않았으면 null. */
  matched: z.boolean().nullable(),
});

/**
 * 일치도 = 공고가 명시한 요건 중 내 기록이 닿는 비율. 축은 분류일 뿐
 * 배점이 아니다(§8.1). 요건을 못 읽은 공고는 이 값 자체가 null이다.
 */
export const JobPostingMatchSchema = z.strictObject({
  total: z.number().int().min(0).max(100),
  covered: z.number().int().nonnegative(),
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
});

export const JobInterestStageSchema = z.enum(["saved", "applied", "closed"]);

export const JobInterestSchema = z.strictObject({
  id: UuidSchema,
  stage: JobInterestStageSchema,
  deadlineAt: TimestampSchema.nullable(),
  memo: z.string().max(5_000).nullable(),
  updatedAt: TimestampSchema,
});

/** 이 공고로 시작한 제작. 06 "관심 공고" 레일의 상태 줄이 이걸로 갈린다. */
export const JobBrewStateSchema = z.strictObject({
  id: UuidSchema,
  status: z.enum(["draft", "interviewing", "recipe", "generating", "done"]),
  answered: z.number().int().nonnegative(),
  questionCount: z.number().int().nonnegative(),
  portfolioId: UuidSchema.nullable(),
});

export const JobPostingSummarySchema = z.strictObject({
  id: UuidSchema,
  title: z.string().min(1).max(300),
  company: JobPostingCompanySchema,
  source: JobPostingSourceSchema,
  sourceUrl: z.string().max(2_000).nullable(),
  /** 어느 채용 사이트에서 모아 왔는지. "원티드" · "잡코리아". */
  sourceBoard: z.string().max(60).nullable(),
  team: z.string().max(120).nullable(),
  /** "서울 강남" · "리모트 혼합" · "3년 이상" — 카드의 회사 줄을 만드는 조각. */
  location: z.string().max(120).nullable(),
  workType: z.string().max(60).nullable(),
  experienceLabel: z.string().max(60).nullable(),
  /** 06 카테고리 칩이 묶는 기준. "백엔드 · 데이터" 같은 표시 문구다. */
  family: z.string().max(60).nullable(),
  technologies: z.array(JobTechnologySchema),
  expiresAt: TimestampSchema.nullable(),
  /** 마감까지 남은 날. 상시 모집이면 null, 이미 지났으면 음수. */
  daysLeft: z.number().int().nullable(),
  /** 마감일이 없는 공고가 대신 적어 둔 말. "채용 시 마감". */
  deadlineNote: z.string().max(60).nullable(),
  match: JobPostingMatchSchema.nullable(),
  interest: JobInterestSchema.nullable(),
  brew: JobBrewStateSchema.nullable(),
  createdAt: TimestampSchema,
});

/** 06 우측 "이 N건이 공통으로 찾는 것". 페이지가 아니라 필터 전체에서 센다. */
export const JobPostingFacetSchema = z.strictObject({
  label: z.string().min(1).max(100),
  count: z.number().int().positive(),
  ratio: z.number().min(0).max(1),
});

/** 06 카테고리 칩. `key`를 그대로 질의에 되돌려 보내면 그 칩이 걸린다. */
export const JobPostingCategorySchema = z.strictObject({
  key: z.string().min(1).max(80),
  label: z.string().min(1).max(60),
  count: z.number().int().nonnegative(),
});

/** 회사 칩은 이름만으로는 못 건다 — 누를 때 보낼 id가 함께 있어야 한다. */
export const JobPostingCompanyFacetSchema = JobPostingFacetSchema.extend({
  key: UuidSchema,
});

export const JobPostingListSummarySchema = z.strictObject({
  total: z.number().int().nonnegative(),
  categories: z.array(JobPostingCategorySchema),
  commonTechnologies: z.array(JobPostingFacetSchema),
  /**
   * 이 결과가 요구하는데 내 기록에는 없는 기술. 00b "비어 있는 재료"와
   * 06 "비어 있는 재료"가 이걸 그린다. 일치도를 낸 공고에서만 셀 수 있다.
   */
  missingTechnologies: z.array(JobPostingFacetSchema),
  /** 나라별 건수. 걸린 것이 있는 나라만 선다. */
  countries: z.array(JobPostingFacetSchema),
  /**
   * 연차 칸막이별로 **그 연차면 지원할 수 있는** 건수. 상한이라 서로 겹치고,
   * 그래서 합이 전체와 같지 않다 — 화면이 그렇게 말해 줘야 한다.
   */
  experienceLevels: z.array(JobPostingFacetSchema),
  /** `재택` · `하이브리드` · `출근`별 건수. 한 공고가 여럿에 들 수 있다. */
  workTypes: z.array(JobPostingFacetSchema),
  /** 회사별 건수. `label`은 이름, `key`는 id다. */
  companies: z.array(JobPostingCompanyFacetSchema),
});

export const JobPostingListResponseSchema = z.strictObject({
  data: z.array(JobPostingSummarySchema),
  summary: JobPostingListSummarySchema,
  page: OffsetPageInfoSchema,
});

export const JobPostingSortSchema = z.enum(["match", "deadline", "recent"]);

/** 마감 필터. `urgent`는 06의 "마감 임박" 칩이다 — 7일 이내. */
export const JobDeadlineFilterSchema = z.enum(["urgent", "open", "always"]);

const BooleanQuerySchema = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

export const ListJobPostingsQuerySchema = z.strictObject({
  q: z.string().trim().min(1).max(200).optional(),
  technology: z.string().trim().min(1).max(100).optional(),
  interested: BooleanQuerySchema.optional(),
  stage: JobInterestStageSchema.optional(),
  deadline: JobDeadlineFilterSchema.optional(),
  family: z.string().trim().min(1).max(60).optional(),
  /**
   * 근무지 나라. `location_region`을 나라로 묶어 건다 — 원문(`location`)은
   * 같은 서울이 다섯 표기로 흩어져 있어 그대로 걸면 절반이 빠진다.
   *
   * 지역(`서울`·`경기`)이 아니라 나라(`한국`)인 이유는, 고르는 사람에게
   * 필요한 첫 갈래가 "국내냐 국외냐"이기 때문이다. 국내 안에서 더 잘라야 할
   * 만큼 쌓이면 그때 한 겹 더 둔다.
   */
  country: z.string().trim().min(1).max(60).optional(),
  /**
   * **내 연차.** 요구 최소 연차가 이 값 이하인 공고만 남긴다.
   *
   * 구간이 아니라 상한인 이유는, 7년차가 `3년 이상`과 `7년 이상`에 모두
   * 지원할 수 있기 때문이다. 구간으로 자르면 고를 때마다 다른 구간의 자리를
   * 놓친다.
   *
   * 연차를 못 읽은 공고(`experience_min_years`가 null)는 **남긴다.** 우리가
   * 못 읽은 것을 지원 자격 미달로 바꿔 말할 수는 없다.
   */
  experience: z.coerce.number().int().min(0).max(50).optional(),
  /** `재택` · `하이브리드` · `출근`. 여럿이 적힌 공고는 그중 하나만 맞아도 걸린다. */
  workType: z.string().trim().min(1).max(20).optional(),
  /** 회사. 이름이 아니라 id로 건다 — 같은 이름을 두 회사가 쓸 수 있다. */
  company: UuidSchema.optional(),
  /** 06 "리모트" 칩. `work_type`에 리모트가 들어간 공고만 남긴다. */
  remote: BooleanQuerySchema.optional(),
  sort: JobPostingSortSchema.default("match"),
  /**
   * 몇 쪽인가. 1부터.
   *
   * 커서를 쓰지 않는다 — 이 목록은 훑어 내려가는 피드가 아니라 오가며 고르는
   * 화면이고, 커서로는 "3쪽으로"를 만들 수 없다.
   */
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// ── 06b 공고 상세 ─────────────────────────────────────────────────────

export const JobRequirementKindSchema = z.enum(["must", "nice", "tone"]);
export const JobRequirementCoverageSchema = z.enum([
  "covered",
  "partial",
  "missing",
]);

/**
 * 공고의 자격 요건. **요건은 공고에 붙는다** — 누가 읽든 같다. 사람마다
 * 다른 건 `coverage`와 `coveredBy`뿐이고, 아직 대조하지 않았으면 null이다.
 */
export const JobRequirementSchema = z.strictObject({
  id: UuidSchema,
  orderNo: z.number().int().nonnegative(),
  label: z.string().min(1).max(300),
  kind: JobRequirementKindSchema,
  /** 아직 이 공고를 내 기록과 대조하지 않았으면 null. "없음"이 아니다. */
  coverage: JobRequirementCoverageSchema.nullable(),
  /** 이 요구를 덮는 기록. 06b가 요건 아래 근거 줄로 보여준다. */
  coveredBy: z.array(
    z.strictObject({ id: UuidSchema, title: z.string().min(1).max(300) }),
  ),
  /**
   * 원문에서 이 요구가 나온 자리. 공고 원문은 불변이고 DB 트리거가 이 구간이
   * 원문과 글자까지 같은지 검사한다 — 06b는 이 값으로 원문을 하이라이트한다.
   */
  sourceSpan: z.strictObject({
    start: z.number().int().nonnegative(),
    end: z.number().int().positive(),
    quote: z.string().min(1),
  }),
});

/** 내가 이 공고를 해석한 작업의 상태. 요건 자체는 공고에 붙어 따로 온다. */
export const JobAnalysisSummarySchema = z.strictObject({
  id: UuidSchema,
  status: z.enum(["queued", "running", "done", "failed"]),
  progressStage: z.enum([
    "queued",
    "extracting",
    "validating",
    "covering",
    "done",
    "failed",
  ]),
  analyzedAt: TimestampSchema.nullable(),
});

/** 내 점수가 매겨진 공고들 사이에서 몇 번째인지. 06b의 "14건 중 2번째". */
export const JobPostingRankSchema = z.strictObject({
  position: z.number().int().positive(),
  total: z.number().int().positive(),
});

/** 06b "주요 업무" — 원문의 소제목과 그 아래 줄. */
export const JobDutyGroupSchema = z.strictObject({
  group: z.string().min(1).max(120),
  items: z.array(z.string().min(1).max(500)),
});

/**
 * 06b "우대 사항" — 항목마다 내 기록이 닿는지 표시가 붙는다.
 * 아직 이 공고를 해석하지 않았으면 `coverage`는 null이다. "없음"이 아니라
 * "대조한 적 없음"이라서, 화면도 그때는 표시를 그리지 않는다.
 */
export const JobPreferredItemSchema = z.strictObject({
  label: z.string().min(1).max(300),
  coverage: JobRequirementCoverageSchema.nullable(),
});

export const JobHiringStepSchema = z.strictObject({
  label: z.string().min(1).max(60),
});

/** 06b "이 공고로 만들면 이 기록들이 먼저 올라갑니다". */
export const JobTopRecordSchema = z.strictObject({
  id: UuidSchema,
  title: z.string().min(1).max(300),
});

export const JobPostingDetailSchema = JobPostingSummarySchema.extend({
  company: JobPostingCompanyDetailSchema,
  /** 원문 그대로. 근거 하이라이트가 글자 위치로 걸리므로 손대지 않는다. */
  descriptionRaw: z.string(),
  employmentType: z.string().max(120).nullable(),
  salaryNote: z.string().max(120).nullable(),
  duties: z.array(JobDutyGroupSchema),
  preferred: z.array(JobPreferredItemSchema),
  hiringProcess: z.array(JobHiringStepSchema),
  /** "평균 3주" 같은 절차 옆 단서. */
  processNote: z.string().max(120).nullable(),
  notice: z.string().max(2_000).nullable(),
  requirements: JobRequirementsSchema,
  /**
   * 공고의 자격 요건 + 내 커버리지. 해석을 돌린 적이 없어도 요건은 보인다 —
   * 다른 사람이 이미 읽어 뒀다면 그 결과가 공고에 남아 있기 때문이다.
   */
  criteria: z.array(JobRequirementSchema),
  analysis: JobAnalysisSummarySchema.nullable(),
  rank: JobPostingRankSchema.nullable(),
  topRecords: z.array(JobTopRecordSchema),
});

export const JobPostingDetailResponseSchema = z.strictObject({
  data: JobPostingDetailSchema,
});

/**
 * 파라미터 이름은 `id`다 — 기존 `/v1/jobs/postings/:id/interest`와 같은 자리에
 * 다른 이름을 쓰면 Fastify 라우터가 등록을 거부한다.
 */
export const JobPostingIdParamsSchema = z.strictObject({ id: UuidSchema });

// ── 00b 우측 레일 ─────────────────────────────────────────────────────

export const RecentJobSearchSchema = z.strictObject({
  id: UuidSchema,
  query: z.string().min(1).max(1_000),
  conditions: z.array(z.unknown()),
  resultCount: z.number().int().nonnegative(),
  createdAt: TimestampSchema,
});

export const RecentJobSearchListResponseSchema = z.strictObject({
  data: z.array(RecentJobSearchSchema),
});

export type JobPostingSummary = z.infer<typeof JobPostingSummarySchema>;
export type JobPostingDetail = z.infer<typeof JobPostingDetailSchema>;
export type JobPostingMatch = z.infer<typeof JobPostingMatchSchema>;
export type JobInterest = z.infer<typeof JobInterestSchema>;
export type JobRequirement = z.infer<typeof JobRequirementSchema>;
export type JobDutyGroup = z.infer<typeof JobDutyGroupSchema>;
export type JobPostingCategory = z.infer<typeof JobPostingCategorySchema>;
export type JobPostingFacet = z.infer<typeof JobPostingFacetSchema>;
export type JobPostingSort = z.infer<typeof JobPostingSortSchema>;
export type ListJobPostingsQuery = z.infer<typeof ListJobPostingsQuerySchema>;
export type RecentJobSearch = z.infer<typeof RecentJobSearchSchema>;
