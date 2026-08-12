import {
  AnalyticsAggregationResponseSchema,
  MediaAssetResponseSchema,
  GeneratedPageSchema,
  type RegeneratePage,
  type CreateMediaBlock,
  AnalyticsDashboardResponseSchema,
  API_PREFIX,
  AuthSessionResponseSchema,
  InsightResponseSchema,
  MetricCatalogResponseSchema,
  WidgetListResponseSchema,
  type AddWidget,
  type AnalyticsPeriodPreset,
  type UpdateWidget,
  CareerCategoriesResponseSchema,
  CareerRecordListResponseSchema,
  CareerRecordResponseSchema,
  CurrentUserResponseSchema,
  HomeReadModelSchema,
  JobPostingDetailResponseSchema,
  BrewStateResponseSchema,
  ConsentListResponseSchema,
  DeploymentListResponseSchema,
  DeploymentSchema,
  EntitlementDecisionResponseSchema,
  type EntitlementCapability,
  ApplyPortfolioEditResultSchema,
  type PublishPortfolio,
  type SubmitExport,
  PortfolioEditProposalSchema,
  type ConsentScope,
  type PortfolioEditCommand,
  BrewJobResponseSchema,
  BrewMaterialsResponseSchema,
  InterviewSessionResponseSchema,
  JobAnalysisResultSchema,
  ReanalysisRequestResultSchema,
  InterviewAnswerResultSchema,
  RecipeResponseSchema,
  CompanyResearchResponseSchema,
  type ReplaceCompanyResearch,
  JobPostingListResponseSchema,
  LayoutCandidateListResponseSchema,
  InterpretedJobSearchSchema,
  PortfolioDetailResponseSchema,
  PortfolioListResponseSchema,
  PortfolioRevisionsResponseSchema,
  RecentJobSearchListResponseSchema,
  AnalyzedJobPostingResponseSchema,
  ImportedJobPostingResponseSchema,
  JobSourceListResponseSchema,
  SubmittedJobPostingResponseSchema,
  TemplatePreviewsResponseSchema,
  GenerationJobStatusResponseSchema,
  type CreateBrew,
  type SubmitGeneration,
  type SubmitJobPosting,
  type ListJobPostingsQuery,
  type ListPortfolioRevisionsQuery,
  type ListCareerRecordsQuery,
  type ListPortfoliosQuery,
  type Login,
  type Signup,
} from "@expresso/contracts";
import { z } from "zod";

import { API_BASE_URL, request, requestNoContent } from "./client";

export const auth = {
  signup: (input: Signup) =>
    request(`${API_PREFIX}/auth/signup`, AuthSessionResponseSchema, {
      method: "POST",
      body: input,
    }),

  login: (input: Login) =>
    request(`${API_PREFIX}/auth/login`, AuthSessionResponseSchema, {
      method: "POST",
      body: input,
    }),

  logout: (accessToken: string) =>
    requestNoContent(`${API_PREFIX}/auth/logout`, {
      method: "POST",
      accessToken,
    }),

  me: (accessToken: string) =>
    request(`${API_PREFIX}/me`, CurrentUserResponseSchema, {
      accessToken,
      cache: "no-store",
    }),
};

const HomeResponseSchema = z.strictObject({ data: HomeReadModelSchema });

export const engagement = {
  /** 00 홈 — 초안 · 포트폴리오 · 추천 공고 · 지표를 한 번에 읽는다. */
  home: (accessToken: string) =>
    request(`${API_PREFIX}/home`, HomeResponseSchema, {
      accessToken,
      cache: "no-store",
    }),
};

export const portfolios = {
  /** 00 홈 카드 · 사이드바. 최근 편집 순. */
  list: (accessToken: string, query: Partial<ListPortfoliosQuery> = {}) =>
    request(`${API_PREFIX}/portfolios`, PortfolioListResponseSchema, {
      accessToken,
      cache: "no-store",
      query: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.cursor ? { cursor: query.cursor } : {}),
        ...(query.limit ? { limit: query.limit } : {}),
      },
    }),

  /** 04 에디터 캔버스 · 08b 배포. 섹션과 블록을 모두 담는다. */
  get: (accessToken: string, portfolioId: string) =>
    request(
      `${API_PREFIX}/portfolios/${portfolioId}`,
      PortfolioDetailResponseSchema,
      { accessToken, cache: "no-store" },
    ),

  /** 03 지면 3안. 가장 최근 생성이 낸 후보와 지금 고른 것. */
  layouts: (accessToken: string, portfolioId: string) =>
    request(
      `${API_PREFIX}/portfolios/${portfolioId}/layouts`,
      LayoutCandidateListResponseSchema,
      { accessToken, cache: "no-store" },
    ),

  /** 03에서 하나를 고른다. 고른 지면이 공개 사이트에 그대로 실린다. */
  selectLayout: (accessToken: string, portfolioId: string, layoutId: string) =>
    request(
      `${API_PREFIX}/portfolios/${portfolioId}/layouts/${layoutId}/select`,
      LayoutCandidateListResponseSchema,
      { accessToken, method: "POST" },
    ),

  /** 04 "말로 고치기" — 지면 전체를 한 문장으로 바꾼다(§8.3 지면 변형). */
  remixLayout: (accessToken: string, portfolioId: string, instruction: string) =>
    request(
      `${API_PREFIX}/portfolios/${portfolioId}/layouts/remix`,
      LayoutCandidateListResponseSchema,
      { accessToken, method: "POST", body: { instruction } },
    ),

  /** 04c 변경 이력과 되돌릴 수 있는 지점. */
  revisions: (
    accessToken: string,
    portfolioId: string,
    query: Partial<ListPortfolioRevisionsQuery> = {},
  ) =>
    request(
      `${API_PREFIX}/portfolios/${portfolioId}/revisions`,
      PortfolioRevisionsResponseSchema,
      {
        accessToken,
        cache: "no-store",
        query: {
          ...(query.actor ? { actor: query.actor } : {}),
          ...(query.cursor ? { cursor: query.cursor } : {}),
          ...(query.limit ? { limit: query.limit } : {}),
        },
      },
    ),
};

export const entitlements = {
  /** 이 기능을 쓸 수 있나. 화면이 잠긴 이유를 말하려면 답이 있어야 한다. */
  check: (accessToken: string, capability: EntitlementCapability) =>
    request(
      `${API_PREFIX}/entitlements/${capability}`,
      EntitlementDecisionResponseSchema,
      { accessToken, cache: "no-store" },
    ),
};

export const publishing = {
  /** 08b 버전 목록. 되돌릴 대상을 여기서 고른다. */
  deployments: (accessToken: string, portfolioId: string) =>
    request(
      `${API_PREFIX}/portfolios/${portfolioId}/deployments`,
      DeploymentListResponseSchema,
      { accessToken, cache: "no-store" },
    ),

  /** 배포. 주소를 바꿔 배포하면 옛 주소는 30일간 새 주소로 넘어간다. */
  publish: (accessToken: string, portfolioId: string, input: PublishPortfolio) =>
    request(
      `${API_PREFIX}/portfolios/${portfolioId}/deployments`,
      z.strictObject({ data: DeploymentSchema }),
      { accessToken, method: "POST", body: input },
    ),

  /** 옛 버전으로 되돌린다. 지운 것이 아니라 그때 나간 사본을 다시 세우는 것이다. */
  rollback: (accessToken: string, portfolioId: string, deploymentId: string) =>
    request(
      `${API_PREFIX}/portfolios/${portfolioId}/deployments/${deploymentId}/rollback`,
      z.strictObject({ data: DeploymentSchema }),
      { accessToken, method: "POST" },
    ),

  /** 공개 중단. 주소만 닫히고 문서와 기록은 그대로 남는다. */
  unpublish: (accessToken: string, portfolioId: string) =>
    request(
      `${API_PREFIX}/portfolios/${portfolioId}/publication`,
      z.strictObject({ data: z.strictObject({ portfolioId: z.uuid(), status: z.literal("unlisted") }) }),
      { accessToken, method: "DELETE" },
    ),

  /** PDF · 덱 내보내기. 잡을 돌려주고 워커가 만든다. */
  submitExport: (
    accessToken: string,
    portfolioId: string,
    input: SubmitExport,
    idempotencyKey: string,
  ) =>
    request(
      `${API_PREFIX}/portfolios/${portfolioId}/exports`,
      z.strictObject({ data: z.looseObject({ id: z.uuid(), status: z.string() }) }),
      { accessToken, method: "POST", body: input, idempotencyKey },
    ),
};

export const consents = {
  /** 10d 온보딩과 09 설정이 읽는다. 범위마다 지금 상태 하나씩. */
  list: (accessToken: string) =>
    request(`${API_PREFIX}/consents`, ConsentListResponseSchema, {
      accessToken,
      cache: "no-store",
    }),

  grant: (accessToken: string, scopes: ConsentScope[], policyVersion: number) =>
    request(`${API_PREFIX}/consents`, ConsentListResponseSchema, {
      accessToken,
      method: "POST",
      body: { scopes, policyVersion },
    }),

  revoke: (accessToken: string, scope: ConsentScope) =>
    request(`${API_PREFIX}/consents/${scope}`, ConsentListResponseSchema, {
      accessToken,
      method: "DELETE",
    }),
};

export const brews = {
  /**
   * 제작을 시작한다. 재료 순위는 이때 한 번 매겨진다.
   *
   * 분석이 먼저다 — 공고가 무엇을 요구하는지 모르면 순위를 매길 기준이 없다.
   */
  create: (accessToken: string, input: CreateBrew) =>
    request(`${API_PREFIX}/brews`, BrewMaterialsResponseSchema, {
      accessToken,
      method: "POST",
      body: input,
    }),

  /** 위저드가 자기 자리를 되찾는다 — 어느 세션, 어느 레시피, 만들어지는 중인지. */
  get: (accessToken: string, brewId: string) =>
    request(`${API_PREFIX}/brews/${brewId}`, BrewStateResponseSchema, {
      accessToken,
      cache: "no-store",
    }),

  /** 01b 질문 만들기. 계약을 부르는 일이라 잡을 돌려준다(202). */
  startInterview: (accessToken: string, brewId: string, idempotencyKey: string) =>
    request(`${API_PREFIX}/brews/${brewId}/interview-sessions`, BrewJobResponseSchema, {
      accessToken,
      method: "POST",
      idempotencyKey,
    }),

  /** 02b 레시피 짜기. 이것도 잡이다. */
  createRecipe: (accessToken: string, brewId: string, idempotencyKey: string) =>
    request(`${API_PREFIX}/brews/${brewId}/recipes`, BrewJobResponseSchema, {
      accessToken,
      method: "POST",
      idempotencyKey,
    }),

  /** 01b 재료. 공고에 맞춰 매긴 순위와 지금 고른 것. */
  materials: (accessToken: string, brewId: string) =>
    request(`${API_PREFIX}/brews/${brewId}/materials`, BrewMaterialsResponseSchema, {
      accessToken,
      cache: "no-store",
    }),

  /** 고른 재료를 저장한다. 보낸 목록이 곧 고른 것 전부다. */
  selectMaterials: (accessToken: string, brewId: string, recordIds: string[]) =>
    request(`${API_PREFIX}/brews/${brewId}/materials`, BrewMaterialsResponseSchema, {
      accessToken,
      method: "PUT",
      body: { recordIds },
    }),

  /** 01b 제작 모드. Cowork는 PRO다. */
  setMode: (accessToken: string, brewId: string, mode: "solo" | "collab") =>
    request(`${API_PREFIX}/brews/${brewId}`, BrewMaterialsResponseSchema, {
      accessToken,
      method: "PATCH",
      body: { mode },
    }),
};

export const templates = {
  /**
   * 03 템플릿 후보. 기업 톤·업종과 겹치는 순으로 서고 맨 앞에 추천이 붙는다.
   *
   * 미리보기는 **이 레시피의 실제 섹션**으로 그린다 — 남의 글로 채운 미리보기는
   * 고를 근거가 되지 못한다.
   */
  previews: (accessToken: string, recipeId: string, useCompanyColors: boolean) =>
    request(
      `${API_PREFIX}/recipes/${recipeId}/template-previews`,
      TemplatePreviewsResponseSchema,
      {
        accessToken,
        cache: "no-store",
        query: { useCompanyColors: String(useCompanyColors) },
      },
    ),
};

/** 회사 검색 결과를 fact와 signal로 정제한 뒤 설계 모델에 전달하는 입구. */
export const companyResearch = {
  list: (accessToken: string, brewId: string) =>
    request(
      `${API_PREFIX}/brews/${brewId}/company-research`,
      CompanyResearchResponseSchema,
      { accessToken, cache: "no-store" },
    ),

  replace: (accessToken: string, brewId: string, input: ReplaceCompanyResearch) =>
    request(
      `${API_PREFIX}/brews/${brewId}/company-research`,
      CompanyResearchResponseSchema,
      { accessToken, method: "PUT", body: input },
    ),
};

export const generation = {
  /** 03 추출하기. 3분쯤 걸리는 일이라 잡을 돌려준다(202). */
  submit: (accessToken: string, input: SubmitGeneration, idempotencyKey: string) =>
    request(`${API_PREFIX}/generation-jobs`, GenerationJobStatusResponseSchema, {
      accessToken,
      method: "POST",
      idempotencyKey,
      body: input,
    }),

  status: (accessToken: string, generationJobId: string) =>
    request(
      `${API_PREFIX}/generation-jobs/${generationJobId}`,
      GenerationJobStatusResponseSchema,
      { accessToken, cache: "no-store" },
    ),
};

export const portfolioEditing = {
  /** 04 블록 하나를 말로 고친다. 돌아오는 것은 **제안**이다(§8.3 부분 편집). */
  instruct: (accessToken: string, portfolioId: string, blockId: string, instruction: string) =>
    request(
      `${API_PREFIX}/portfolios/${portfolioId}/blocks/${blockId}/edit-preview`,
      z.strictObject({ data: PortfolioEditProposalSchema }),
      { accessToken, method: "POST", body: { operation: "instruct", instruction } },
    ),

  /** 04b 속성 패널 — 값과 모양을 직접 고친다. 같은 문을 지나 이력에 남는다. */
  edit: (
    accessToken: string,
    portfolioId: string,
    blockId: string,
    command: PortfolioEditCommand,
  ) =>
    request(
      `${API_PREFIX}/portfolios/${portfolioId}/blocks/${blockId}/edit-preview`,
      z.strictObject({ data: PortfolioEditProposalSchema }),
      { accessToken, method: "POST", body: command },
    ),

  /** 04 블록 차례. 한 섹션 안의 순서를 통째로 보낸다. */
  reorderBlocks: (
    accessToken: string,
    portfolioId: string,
    sectionId: string,
    blockIds: string[],
  ) =>
    request(
      `${API_PREFIX}/portfolios/${portfolioId}/sections/${sectionId}/blocks/order`,
      z.strictObject({
        data: z.strictObject({ blockIds: z.array(z.uuid()), revisionId: z.uuid().optional() }),
      }),
      { accessToken, method: "PATCH", body: { blockIds } },
    ),

  /** 블록 하나 더. 사람이 만든 자리라 잠긴 채로 붙는다. */
  duplicateBlock: (accessToken: string, portfolioId: string, blockId: string) =>
    request(
      `${API_PREFIX}/portfolios/${portfolioId}/blocks/${blockId}/duplicate`,
      z.strictObject({
        data: z.strictObject({ blockId: z.uuid(), revisionId: z.uuid().optional() }),
      }),
      { accessToken, method: "POST" },
    ),

  /** 블록 지우기. 서버가 지우기 직전에 복원 지점을 하나 뜬다. */
  deleteBlock: (accessToken: string, portfolioId: string, blockId: string) =>
    request(
      `${API_PREFIX}/portfolios/${portfolioId}/blocks/${blockId}`,
      z.strictObject({
        data: z.strictObject({
          blockId: z.uuid(),
          snapshotId: z.string(),
          revisionId: z.uuid().optional(),
        }),
      }),
      { accessToken, method: "DELETE" },
    ),

  /** 04c 되돌리기. 그 뒤에 같은 블록이 또 바뀌었으면 409로 되묻는다. */
  revertRevision: (accessToken: string, revisionId: string, confirmConflict = false) =>
    request(
      `${API_PREFIX}/portfolio-revisions/${revisionId}/revert`,
      z.strictObject({
        data: z.strictObject({
          revisionId: z.uuid().optional(),
          conflictResolved: z.boolean(),
        }),
      }),
      { accessToken, method: "POST", body: { confirmConflict } },
    ),

  /** 04c 복원. 그 지점의 섹션 순서 · 숨김 · 블록을 통째로 되돌린다. */
  restore: (accessToken: string, portfolioId: string, snapshotId: string) =>
    request(
      `${API_PREFIX}/portfolios/${portfolioId}/restore`,
      z.strictObject({
        data: z.strictObject({
          snapshotId: z.uuid(),
          preRestoreSnapshotId: z.uuid().optional(),
          revisionId: z.uuid().optional(),
        }),
      }),
      { accessToken, method: "POST", body: { snapshotId, confirm: true } },
    ),

  /** 04 섹션 숨김. 지우지 않고 배포에서만 뺀다. */
  setSectionVisible: (
    accessToken: string,
    portfolioId: string,
    sectionId: string,
    visible: boolean,
  ) =>
    request(
      `${API_PREFIX}/portfolios/${portfolioId}/sections/${sectionId}`,
      z.strictObject({
        data: z.strictObject({
          sectionId: z.uuid(),
          visible: z.boolean(),
          revisionId: z.uuid().optional(),
        }),
      }),
      { accessToken, method: "PATCH", body: { visible } },
    ),

  /** 04 섹션 순서. 지면 전체의 차례를 통째로 보낸다. */
  reorderSections: (accessToken: string, portfolioId: string, sectionIds: string[]) =>
    request(
      `${API_PREFIX}/portfolios/${portfolioId}/sections/order`,
      z.strictObject({
        data: z.strictObject({
          sectionIds: z.array(z.uuid()),
          revisionId: z.uuid().optional(),
        }),
      }),
      { accessToken, method: "PATCH", body: { sectionIds } },
    ),

  /** "그대로 두기". 제안이 실제 블록이 된다. */
  apply: (accessToken: string, proposalId: string) =>
    request(
      `${API_PREFIX}/portfolio-edit-proposals/${proposalId}/apply`,
      z.strictObject({ data: ApplyPortfolioEditResultSchema }),
      { accessToken, method: "POST" },
    ),
};

export const analytics = {
  /** 07이 여는 순간 읽는 것. 집계·추이·나눠 보기·저장된 해설이 한 번에 온다. */
  dashboard: (accessToken: string, portfolioId: string, period: AnalyticsPeriodPreset) =>
    request(
      `${API_PREFIX}/portfolios/${portfolioId}/analytics/dashboard`,
      AnalyticsDashboardResponseSchema,
      { accessToken, cache: "no-store", query: { period } },
    ),

  /** "지금 집계" — 아직 계산되지 않은 날을 큐에 넣는다. 계산은 워커가 한다. */
  aggregate: (accessToken: string, portfolioId: string, period: AnalyticsPeriodPreset) =>
    request(
      `${API_PREFIX}/portfolios/${portfolioId}/analytics/aggregate`,
      AnalyticsAggregationResponseSchema,
      { accessToken, method: "POST", body: { period } },
    ),

  /** "해설 읽기" — 여기서만 모델을 부른다(§8.3 분석 해설). */
  insight: (accessToken: string, portfolioId: string, period: AnalyticsPeriodPreset) =>
    request(
      `${API_PREFIX}/portfolios/${portfolioId}/analytics/insight`,
      InsightResponseSchema,
      { accessToken, method: "POST", body: { period } },
    ),

  /** 07b 지표 라이브러리. 못 쓰는 것도 왜 못 쓰는지와 함께 온다. */
  metrics: (accessToken: string) =>
    request(`${API_PREFIX}/analytics/metrics`, MetricCatalogResponseSchema, {
      accessToken,
      cache: "no-store",
    }),

  /** "대시보드 편집" — 기본 지면을 내 것으로 굳힌다. */
  editLayout: (accessToken: string, portfolioId: string, period: AnalyticsPeriodPreset) =>
    request(
      `${API_PREFIX}/portfolios/${portfolioId}/dashboard-layout`,
      WidgetListResponseSchema,
      { accessToken, method: "POST", body: { period } },
    ),

  /** "레이아웃 초기화". */
  resetLayout: (accessToken: string, portfolioId: string) =>
    request(
      `${API_PREFIX}/portfolios/${portfolioId}/dashboard-layout`,
      WidgetListResponseSchema,
      { accessToken, method: "DELETE" },
    ),

  addWidget: (
    accessToken: string,
    portfolioId: string,
    body: AddWidget & { period: AnalyticsPeriodPreset },
  ) =>
    request(`${API_PREFIX}/portfolios/${portfolioId}/widgets`, WidgetListResponseSchema, {
      accessToken,
      method: "POST",
      body,
    }),

  /** 끌어 놓기. 지면 전체의 차례를 통째로 보낸다. */
  reorderWidgets: (accessToken: string, portfolioId: string, widgetIds: string[]) =>
    request(`${API_PREFIX}/portfolios/${portfolioId}/widgets/order`, WidgetListResponseSchema, {
      accessToken,
      method: "PATCH",
      body: { widgetIds },
    }),

  updateWidget: (accessToken: string, widgetId: string, body: UpdateWidget) =>
    request(`${API_PREFIX}/widgets/${widgetId}`, WidgetListResponseSchema, {
      accessToken,
      method: "PATCH",
      body,
    }),

  deleteWidget: (accessToken: string, widgetId: string) =>
    request(`${API_PREFIX}/widgets/${widgetId}`, WidgetListResponseSchema, {
      accessToken,
      method: "DELETE",
    }),
};

export const jobAnalyses = {
  /** 01 공고 분석 — 요건과 그 근거 문장, 내 기록이 덮는지. */
  get: (accessToken: string, jobAnalysisId: string) =>
    request(
      `${API_PREFIX}/job-analyses/${jobAnalysisId}`,
      z.strictObject({ data: JobAnalysisResultSchema }),
      { accessToken, cache: "no-store" },
    ),

  /** "다시 분석". 큐에 들어가고, 무엇이 영향을 받는지 함께 돌려준다. */
  reanalyze: (accessToken: string, jobAnalysisId: string) =>
    request(
      `${API_PREFIX}/job-analyses/${jobAnalysisId}/reanalyze`,
      z.strictObject({ data: ReanalysisRequestResultSchema }),
      { accessToken, method: "POST" },
    ),
};

export const brewJobs = {
  /** 만들어지는 중인 것의 진행 상태. */
  get: (accessToken: string, jobId: string) =>
    request(`${API_PREFIX}/brew-jobs/${jobId}`, BrewJobResponseSchema, {
      accessToken,
      cache: "no-store",
    }),
};

export const interview = {
  /** 01b 대화. 질문 · 답변 · 진행도가 모두 여기 있다. */
  session: (accessToken: string, sessionId: string) =>
    request(`${API_PREFIX}/interview-sessions/${sessionId}`, InterviewSessionResponseSchema, {
      accessToken,
      cache: "no-store",
    }),

  answer: (
    accessToken: string,
    sessionId: string,
    questionId: string,
    input: { inputType: "text" | "voice"; transcript: string },
    idempotencyKey: string,
  ) =>
    request(
      `${API_PREFIX}/interview-sessions/${sessionId}/answers/${questionId}`,
      z.strictObject({ data: InterviewAnswerResultSchema }),
      { accessToken, method: "PUT", body: input, idempotencyKey },
    ),

  /** 01b "질문 바꾸기". 같은 근거를 다른 각도에서 다시 묻는다. */
  replaceQuestion: (accessToken: string, sessionId: string, questionId: string) =>
    request(
      `${API_PREFIX}/interview-sessions/${sessionId}/questions/${questionId}/replace`,
      InterviewSessionResponseSchema,
      { accessToken, method: "POST" },
    ),

  skipQuestion: (accessToken: string, sessionId: string, questionId: string) =>
    request(
      `${API_PREFIX}/interview-sessions/${sessionId}/questions/${questionId}/skip`,
      InterviewSessionResponseSchema,
      { accessToken, method: "POST" },
    ),
};

export const recipes = {
  /** 02b 레시피. 섹션 · 항목 · 근거 · 안 쓴 재료. */
  get: (accessToken: string, recipeId: string) =>
    request(`${API_PREFIX}/recipes/${recipeId}`, RecipeResponseSchema, {
      accessToken,
      cache: "no-store",
    }),
};

export const jobs = {
  /** 00b 검색 결과 · 06 공고 탐색. 점수 · 관심 · 기술 충족은 사람마다 다르다. */
  postings: (accessToken: string, query: Partial<ListJobPostingsQuery> = {}) =>
    request(`${API_PREFIX}/jobs/postings`, JobPostingListResponseSchema, {
      accessToken,
      cache: "no-store",
      query: {
        ...(query.q ? { q: query.q } : {}),
        ...(query.technology ? { technology: query.technology } : {}),
        ...(query.interested === undefined
          ? {}
          : { interested: String(query.interested) }),
        ...(query.stage ? { stage: query.stage } : {}),
        ...(query.deadline ? { deadline: query.deadline } : {}),
        // 이 셋이 빠져 있어 06 카테고리 칩이 눌려도 목록이 걸러지지 않았다.
        // 서버는 처음부터 받고 있었고 클라이언트가 안 실어 보냈다.
        ...(query.family ? { family: query.family } : {}),
        ...(query.country ? { country: query.country } : {}),
        ...(query.experience === undefined ? {} : { experience: String(query.experience) }),
        ...(query.workType ? { workType: query.workType } : {}),
        ...(query.company ? { company: query.company } : {}),
        ...(query.remote === undefined ? {} : { remote: String(query.remote) }),
        ...(query.sort ? { sort: query.sort } : {}),
        ...(query.page ? { page: query.page } : {}),
        ...(query.limit ? { limit: query.limit } : {}),
      },
    }),

  /** 06b 공고 상세. 원문과 근거 구간을 함께 받아 하이라이트한다. */
  posting: (accessToken: string, jobPostingId: string) =>
    request(
      `${API_PREFIX}/jobs/postings/${jobPostingId}`,
      JobPostingDetailResponseSchema,
      { accessToken, cache: "no-store" },
    ),

  /**
   * 00b · 06의 "이렇게 이해했습니다" 칩. 최근 검색도 여기서 남는다 —
   * 같은 말을 다시 검색하면 새 줄이 생기지 않고 마지막 줄이 갱신된다.
   */
  interpret: (accessToken: string, query: string, resultCount: number) =>
    request(`${API_PREFIX}/jobs/search/interpret`, InterpretedJobSearchSchema, {
      method: "POST",
      accessToken,
      body: { query, resultCount },
    }),

  /** 00b 우측 레일의 최근 검색. */
  recentSearches: (accessToken: string, limit?: number) =>
    request(`${API_PREFIX}/jobs/recent-searches`, RecentJobSearchListResponseSchema, {
      accessToken,
      cache: "no-store",
      query: limit ? { limit } : {},
    }),

  /**
   * 공고를 직접 붙여넣는다. 공고와 분석이 함께 생긴다(202).
   *
   * 요건을 뽑는 것은 워커가 하는 일이라 여기서는 자리만 만든다 — 01이 그
   * 진행을 그린다.
   */
  submit: (accessToken: string, input: SubmitJobPosting, idempotencyKey: string) =>
    request(`${API_PREFIX}/jobs/submissions`, SubmittedJobPostingResponseSchema, {
      accessToken,
      method: "POST",
      idempotencyKey,
      body: input,
    }),

  /**
   * 주소 한 건을 서버가 대신 읽는다. **저장하지 않는다** — 읽은 것을 화면이
   * 보여주고, 사용자가 고친 뒤 `submit`으로 제출한다.
   */
  readUrl: (accessToken: string, url: string) =>
    request(`${API_PREFIX}/jobs/url-imports`, ImportedJobPostingResponseSchema, {
      accessToken,
      method: "POST",
      body: { url },
    }),

  /** 어디서 모아 오는지. 06 헤더가 이걸로 "어디서 몇 건"을 말한다. */
  sources: (accessToken: string) =>
    request(`${API_PREFIX}/job-sources`, JobSourceListResponseSchema, {
      accessToken,
      cache: "no-store",
    }),

  /** 모아 둔 공고를 내 분석으로 가져온다. 이미 분석했으면 그것을 돌려준다. */
  analyzePosting: (accessToken: string, jobPostingId: string) =>
    request(
      `${API_PREFIX}/jobs/postings/${jobPostingId}/analyses`,
      AnalyzedJobPostingResponseSchema,
      { accessToken, method: "POST" },
    ),
};

export const career = {
  categories: (accessToken: string) =>
    request(`${API_PREFIX}/career/categories`, CareerCategoriesResponseSchema, {
      accessToken,
      cache: "no-store",
    }),

  records: (accessToken: string, query: Partial<ListCareerRecordsQuery> = {}) =>
    request(`${API_PREFIX}/career/records`, CareerRecordListResponseSchema, {
      accessToken,
      cache: "no-store",
      query: {
        ...(query.categoryId ? { categoryId: query.categoryId } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.origin ? { origin: query.origin } : {}),
        ...(query.q ? { q: query.q } : {}),
        ...(query.sort ? { sort: query.sort } : {}),
        ...(query.cursor ? { cursor: query.cursor } : {}),
        ...(query.limit ? { limit: query.limit } : {}),
      },
    }),

  record: (accessToken: string, recordId: string) =>
    request(
      `${API_PREFIX}/career/records/${recordId}`,
      CareerRecordResponseSchema,
      { accessToken, cache: "no-store" },
    ),
};

/**
 * 이미지.
 *
 * 올리기는 다른 요청과 모양이 다르다 — **파일 바이트를 본문 그대로** 보낸다.
 * multipart를 쓰지 않는 이유는 서버 쪽에 적어 두었다(`modules/media/routes.ts`).
 */
export const media = {
  upload: async (accessToken: string, file: File) => {
    const response = await fetch(new URL(`${API_PREFIX}/media`, API_BASE_URL), {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": file.type,
      },
      body: file,
    });
    const payload = (await response.json()) as unknown;
    if (!response.ok) {
      const message = (payload as { error?: { message?: string } }).error?.message;
      throw new Error(message ?? "이미지를 올리지 못했습니다.");
    }
    return MediaAssetResponseSchema.parse(payload).data;
  },

  addBlock: (
    accessToken: string,
    portfolioId: string,
    sectionId: string,
    body: CreateMediaBlock,
  ) =>
    request(
      `${API_PREFIX}/portfolios/${portfolioId}/sections/${sectionId}/media-blocks`,
      z.object({ data: z.object({ blockId: z.string(), sectionId: z.string(), assetId: z.string() }) }),
      { method: "POST", accessToken, body },
    ),
};

/**
 * 자유 생성 지면.
 *
 * 블록 · 지면 후보와 달리 **한 장이 통째로** 온다. 고치는 자리가 없고, 대신
 * 지시를 붙여 다시 뽑는다. 앞 판은 지워지지 않으므로 되돌아갈 수 있다.
 */
export const page = {
  latest: (accessToken: string, portfolioId: string) =>
    request(
      `${API_PREFIX}/portfolios/${portfolioId}/page`,
      z.object({ data: GeneratedPageSchema }),
      { accessToken },
    ),

  history: (accessToken: string, portfolioId: string) =>
    request(
      `${API_PREFIX}/portfolios/${portfolioId}/page/history`,
      z.object({ data: z.array(GeneratedPageSchema) }),
      { accessToken },
    ),

  generate: (accessToken: string, portfolioId: string, body: RegeneratePage = {}) =>
    request(
      `${API_PREFIX}/portfolios/${portfolioId}/page`,
      z.object({ data: GeneratedPageSchema }),
      { method: "POST", accessToken, body },
    ),
};
