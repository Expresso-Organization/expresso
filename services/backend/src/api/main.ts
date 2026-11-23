import { randomUUID } from "node:crypto";
import { AgentCredentials } from "../modules/agent-chat/index.js";
import { AgentChatError, AgentChatService, type AgentBrewDeps, type AgentWorkDeps } from "../modules/agent-chat/index.js";
import { ChromiumSiteCapturer } from "../platform/browser/site-capture.js";
import { GithubRepoReader } from "../platform/github/repo-reader.js";
import { ClaudeAgentRuntime } from "../platform/agent/runtime.js";
import { buildApi } from "./build-app.js";
import { loadRuntimeConfig } from "../config/runtime-config.js";
import { connectMongoUntilReady, createMongoResource } from "../platform/mongodb.js";
import { safeErrorSummary } from "../platform/observability.js";
import { createRedisResource, createStreamRedis } from "../platform/redis.js";
import { IdentityService } from "../modules/identity/index.js";
import { RemoteGoogleIdTokenVerifier } from "../modules/identity/google.js";
import { EntitlementService, outreachGate } from "../modules/entitlements/index.js";
import { UsageService } from "../modules/usage/index.js";
import { CareerService } from "../modules/career/index.js";
import { GoalDemandService, JobMarketService } from "../modules/jobs/index.js";
import { AiSearchInterpreter } from "../modules/jobs/search-interpreter.js";
import { AiFactsReader, createJobSourceAdapters, BundledMarkReader, JobIngestService, JobUrlImporter, SiteMarkReader } from "../modules/jobs/ingest/index.js";
import { JobBoardService } from "../modules/jobs/index.js";
import { JobAnalysisService } from "../modules/job-analysis/index.js";
import { BrewTrashService, MaterialsError, MaterialsService } from "../modules/materials/index.js";
import { InterviewService } from "../modules/interview/index.js";
import { RecipeService } from "../modules/recipe/index.js";
import { CompanyResearchService } from "../modules/company-research/index.js";
import { BrewJobService } from "../modules/brew-jobs/index.js";
import { ConsentService } from "../modules/consent/index.js";
import { AiBlockEditor } from "../modules/portfolio-editing/editor.js";
import { AiLayoutRemixer } from "../modules/layout/remixer.js";
import { AiInsightWriter } from "../modules/analytics/writer.js";
import { createAiClient, createPostingFactsAiClient } from "../platform/ai/create-client.js";
import { MongoAiUsageSink } from "../platform/ai/usage-sink.js";
import { createMailer } from "../platform/mail/create-mailer.js";
import { DesignSystemService } from "../modules/design-systems/service.js";
import { TemplateService } from "../modules/templates/index.js";
import { GenerationError, GenerationService } from "../modules/generation/index.js";
import { PortfolioEditingService } from "../modules/portfolio-editing/index.js";
import { PortfolioReadService, PortfolioTrashService } from "../modules/portfolios/index.js";
import { LayoutService } from "../modules/layout/index.js";
import { PublishingService } from "../modules/publishing/index.js";
import { MediaService } from "../modules/media/index.js";
import { DesignChatError, DesignChatService, PageElementEditor, PageService } from "../modules/page/index.js";
import { PageStream } from "../modules/page/stream.js";
import { freePageGenerator } from "../modules/page/briefed-generator.js";
import { StructuredPageGenerator } from "../modules/page/structured-generator.js";
import { FormatRoutingPageGenerator } from "../modules/page/format-router.js";
import { createMediaStorage } from "../platform/storage/create-storage.js";
import { AnalyticsService } from "../modules/analytics/index.js";
import { EngagementService, UnifiedSearchService } from "../modules/engagement/index.js";
import { ActivityService } from "../modules/activities/index.js";
import { ProposalService } from "../modules/proposals/index.js";
import { ConsultantCommitments, ConsultantDiagnoses, ConsultantService } from "../modules/consultant/index.js";
import { AccountLifecycleService } from "../modules/account-lifecycle/index.js";
import { AdminService } from "../modules/admin/index.js";
import { CareerDocumentService } from "../modules/career-editor/index.js";
import { AiClientProposalAdapter, SelectedBlockTextAiProposalAdapter } from "../modules/career-editor/ai-adapter.js";
import { createReliableQueue } from "../platform/queue.js";

const config = loadRuntimeConfig();
if (!config.mongodbUrl || !config.mongodbDatabase) throw new Error("MongoDB runtime configuration is missing");
const database = createMongoResource(config.mongodbUrl, { databaseName: config.mongodbDatabase });
const redis = createRedisResource(config.redisUrl);
const identityService = new IdentityService(database, { mailer: createMailer(config), appBaseUrl: config.appBaseUrl });
// 클라이언트 ID가 없으면 만들지 않는다 — 라우트가 503으로 답하고, 화면은
// 버튼을 열지 않는다. 검증기 없이 도는 척하는 경로를 두지 않는다.
const googleIdTokenVerifier = config.googleClientId
  ? new RemoteGoogleIdTokenVerifier({ clientId: config.googleClientId })
  : null;
const entitlementService = new EntitlementService(database);
const usageService = new UsageService(database);
const careerService = new CareerService(database);
const jobUrlImporter = new JobUrlImporter();
const jobBoardService = new JobBoardService(database);
const jobAnalysisService = new JobAnalysisService(database);
const materialsService = new MaterialsService(database);
const interviewService = new InterviewService(database);
const recipeService = new RecipeService(database);
const companyResearchService = new CompanyResearchService(database);
const designSystemService = new DesignSystemService(database);
const templateService = new TemplateService(database, recipeService);
const generationService = new GenerationService(database);
// 04b "말로 고치기"만 요청 안에서 계약을 부른다 — 사용자가 결과를 보고
// 적용할지 정하는 대화형 편집이라 뒤로 미룰 수 없다(§8.3은 이 화면을
// 스트리밍으로 그린다. 지금은 한 번에 받는다).
const aiUsage = new MongoAiUsageSink(database);
const ai = createAiClient(config, aiUsage);
const factsAi = createPostingFactsAiClient(config, aiUsage);

// 수집은 매일 아침 워커가 돌린다. API에는 목록·수동 실행과 주소 읽기만 있으면 된다.
const jobIngestService = new JobIngestService(
  database,
  createJobSourceAdapters(config),
  // AI가 꺼져 있으면 본문을 읽지 않는다. 규칙 폴백을 두지 않는 이유는
  // 정확도가 조용히 갈리기 때문이다 — 화면은 그 둘을 구분해 말할 수 없다.
  factsAi ? new AiFactsReader(factsAi) : null,
  // 회사 로고는 AI와 무관하다 — 회사가 자기 사이트에 걸어 둔 아이콘을 받는다.
  // 저장소에 넣어 둔 파일이 있으면 그것이 먼저다(받아 올 수 없는 회사가 있다).
  new BundledMarkReader(new SiteMarkReader()),
);
// 계약을 부르기 전에 지나는 문. 규칙 폴백은 지나지 않는다.
const consentService = new ConsentService(database);
// 자연어 검색도 요청 안에서 계약을 부른다 — 검색은 사용자가 입력하고 바로
// 결과를 보는 화면이라 뒤로 미룰 수 없다. AI가 꺼져 있으면 규칙 폴백
// (search-parser.ts)이 그대로 돈다.
const jobMarketService = new JobMarketService(
  database,
  ai ? new AiSearchInterpreter(ai) : null,
  consentService,
);
const portfolioEditingService = new PortfolioEditingService(
  database,
  ai ? new AiBlockEditor(ai) : null,
  consentService,
);
const portfolioReadService = new PortfolioReadService(database);
const layoutService = new LayoutService(database, ai ? new AiLayoutRemixer(ai) : null, consentService);
const brewJobService = new BrewJobService(database);
const publishingService = new PublishingService(database, config.assetSigningSecret);
const mediaService = new MediaService(database, createMediaStorage(config));
// 생성 지면의 저장·조회·직접 편집을 제공합니다.
// 만들어지는 지면이 지나는 길. 워커가 쓰고 여기서 읽어 브라우저로 흘린다.
const pageStream = new PageStream(createStreamRedis(config.redisUrl), {
  prefix: config.queuePrefix,
});
const pageService = new PageService(database, consentService, pageStream);
// AI가 켜져 있을 때 모델이 내용·Spec 또는 HTML을 생성합니다. 다시 뽑기는 직전 지면의 방식을 따르고,
// 직전 지면이 없으면 설정 값을 씁니다(`FormatRoutingPageGenerator`). 자유 생성은 정리본 · 디자인 지침으로 CSS 전체를 씁니다.
const pageGenerator = ai
  ? new FormatRoutingPageGenerator(
      { html: freePageGenerator(ai), "json-render": new StructuredPageGenerator(ai) },
      config.pageGenerationFormat ?? "json-render",
    )
  : null;
const pageEditor = ai ? new PageElementEditor(ai) : null;
// 디자인을 정하는 대화. 답은 이 프로세스에서 뒤로 만든다. AI가 꺼져 있으면 두지 않고, 화면은 카탈로그 화면을 연다.
const designChatService = ai ? new DesignChatService(database, ai, consentService) : null;
const analyticsService = new AnalyticsService(database, {
  ...(config.analyticsVisitorSalt ? { visitorSalt: config.analyticsVisitorSalt } : {}),
  // 해설은 07에서 사용자가 누를 때만 쓴다. 없으면 숫자를 다시 읽어 주는 한 문장이 남는다.
  writer: ai ? new AiInsightWriter(ai) : null,
  consent: consentService,
  // 기업 도메인 방문은 PRO다. 자격 판정이 없으면 아예 보여주지 않는다.
  entitlements: entitlementService,
});
const engagementService = new EngagementService(database);
const unifiedSearchService = new UnifiedSearchService({ records: careerService, jobs: jobBoardService, portfolios: portfolioReadService });
const accountLifecycleService = new AccountLifecycleService(database);
// 커리어 문서 작업은 Worker의 career-jobs 줄에서 처리합니다(포트폴리오 생성과 줄을 나눔).
const careerDocumentJobs = createReliableQueue<Record<string, unknown>>(
  "career-jobs",
  config.redisUrl,
  config.queuePrefix,
);
const careerDocumentService = new CareerDocumentService(
  database,
  config.assetSigningSecret,
  undefined,
  async (recordId, expectedSequence) => {
    await careerDocumentJobs.queue.add(
      "career.document.compact",
      { recordId, expectedSequence },
      { jobId: `career-document-compact-${recordId}-${expectedSequence}`, priority: 100 },
    );
  },
  config.careerAiDeterministicTest ? new SelectedBlockTextAiProposalAdapter() : ai ? new AiClientProposalAdapter(ai) : undefined,
  async (userId, recordId) => {
    // 2초 단위 작업 ID로 연달아 들어온 저장을 하나의 투영으로 합칩니다. 투영은 늘 최신 문서를 읽습니다.
    const window = Math.floor(Date.now() / 2_000);
    await careerDocumentJobs.queue.add(
      "career.document.project",
      { userId, recordId },
      { jobId: `career-document-project-${recordId}-${window}`, delay: 2_000, priority: 50 },
    );
  },
);
// 편집기 밖 본문 쓰기(PATCH bodyMd · 인터뷰 재답변)가 곧바로 편집기 문서와 열린 편집기에 들어가게 연결합니다.
careerService.setExternalBodyListener((userId, recordId) => careerDocumentService.syncExternalBody(userId, recordId));
interviewService.setExternalBodyListener((userId, recordId) => careerDocumentService.syncExternalBody(userId, recordId));
const consultantService = new ConsultantService(database);
const consultantCommitments = new ConsultantCommitments(database);
// 작업물 재료: 채팅에 붙인 그림 · 사이트 첫 화면 찍기 · 공개 깃허브 레포 읽기(`agent-chat/work-materials.ts`).
// 운영은 측정기와 같은 headless shell을 쓴다. 그 브라우저를 깔지 않은 개발 기기는 `SITE_CAPTURE_CHANNEL=chrome`으로 설치된 Chrome을 쓴다.
const siteCapturer = new ChromiumSiteCapturer(20_000, process.env.SITE_CAPTURE_CHANNEL?.trim() ? { channel: process.env.SITE_CAPTURE_CHANNEL.trim() } : {});
const repoReader = new GithubRepoReader(process.env.GITHUB_TOKEN?.trim() || null);
const agentWork: AgentWorkDeps = {
  ownsMedia: (userId, mediaId) => mediaService.owns(userId, mediaId),
  uploadImage: (userId, bytes) => mediaService.upload(userId, bytes),
  capture: url => siteCapturer.capture(url),
  readRepo: url => repoReader.read(url),
};
// 대화에서 시작하는 포트폴리오 제작이 쓰는 다른 모듈의 일(`agent-chat/brew-start.ts`).
const agentBrews: AgentBrewDeps = {
  openBrews: async userId => (await engagementService.home(userId)).activeBrews.length,
  analyzePosting: (userId, jobPostingId) => jobMarketService.analyzePosting(userId, jobPostingId),
  getResult: (userId, jobAnalysisId) => jobAnalysisService.getResult(userId, jobAnalysisId),
  createBrew: (userId, input) => materialsService.createBrew(userId, input),
  createFreeBrew: (userId, input) => materialsService.createFreeBrew(userId, input).then(state => ({ brewId: state.brewId, jobAnalysisId: state.jobAnalysisId })),
  readPostingUrl: url => jobUrlImporter.read(url),
  submitPosting: (userId, key, input) => jobMarketService.submitPosting(userId, key, input),
  brewOrigin: (userId, brewId) => materialsService.origin(userId, brewId),
  // 지운 제작(휴지통)과 없는 제작은 404다. 그 밖의 오류는 그대로 올린다.
  // 구성 잡이 줄에 있거나 도는 동안은 아직 interviewing이어도 구성 단계로 본다(구성이 저장될 때 recipe가 된다). 인터뷰를 더 하지 않게 한다.
  brewState: (userId, brewId) => materialsService.getState(userId, brewId).then(state => ({ status: state.status === "interviewing" && state.latestJob?.type === "recipe" && (state.latestJob.status === "queued" || state.latestJob.status === "running") ? "recipe" as const : state.status, selected: state.materials.selected, generation: state.latestGeneration ? { id: state.latestGeneration.id, status: state.latestGeneration.status } : null }), error => { if (error instanceof MaterialsError && error.statusCode === 404) return null; throw error; }),
  selectedRecords: (userId, brewId) => materialsService.getMaterials(userId, brewId).then(state => state.materials.filter(item => item.selected).map(item => ({ id: item.recordId, title: item.title }))),
  openInterview: (userId, brewId) => interviewService.openConversation(userId, brewId),
  interview: (userId, brewId) => interviewService.conversationState(userId, brewId),
  saveInterviewAnswer: (userId, brewId, input, idempotencyKey) => interviewService.saveConversationAnswer(userId, brewId, input, idempotencyKey),
  startRecipe: (userId, brewId) => brewJobService.submit(userId, "recipe", `recipe:${brewId}`, { brewId }),
  designDraw: async (userId, brewId, input) => {
    if (!designChatService) throw new AgentChatError(503, "design chat is not configured", "이 서버에서는 대화로 디자인을 고를 수 없습니다.");
    // 디자인 대화의 거절은 화면에 보일 문장을 갖고 있다. 대화의 오류로 옮겨 그 문장을 그대로 낸다.
    const chat = await designChatService.send(userId, brewId, { action: "draw", requestId: randomUUID(), ...input }).catch((error: unknown) => { throw error instanceof DesignChatError ? new AgentChatError(error.statusCode, error.message, error.publicMessage) : error; });
    return { designMessageId: chat.messages.at(-1)!.id };
  },
  startGeneration: async (userId, brewId, again) => {
    if (!designChatService) throw new AgentChatError(503, "design chat is not configured", "이 서버에서는 대화로 포트폴리오를 만들 수 없습니다.");
    const snippetId = (await designChatService.get(userId, brewId)).chat?.selectedSnippetId;
    if (!snippetId) throw new AgentChatError(409, "no selected snippet", "「이 스타일 고르기」로 첫 화면을 먼저 골라 주세요.");
    const state = await materialsService.getState(userId, brewId);
    const latest = state.latestGeneration;
    if (latest && (latest.status === "queued" || latest.status === "running")) return { generationId: latest.id };
    // 만드는 일은 이번 달 횟수를 쓴다. 이미 만든 포트폴리오는 「다시 뽑기」로 연 디자인에서만 다시 만든다.
    if (latest?.status === "done" && !again) throw new AgentChatError(409, "already generated", "이미 만든 포트폴리오가 있습니다. 「만든 포트폴리오 열기」로 열어 주세요.");
    // 두 번 눌러도 같은 키다. 실패하거나 멈춘 뒤에는 직전 생성이 달라 새 키다.
    const key = `chat-generation:${brewId}:${snippetId}:${latest?.id ?? "first"}`;
    const job = await generationService.submit(userId, key, { ...(state.recipeId ? { recipeId: state.recipeId } : { brewId }), designSnippetId: snippetId }).catch((error: unknown) => {
      if (!(error instanceof GenerationError)) throw error;
      const message = error.statusCode === 402 || error.statusCode === 403 ? "이번 달 크레딧을 다 썼습니다. 다음 달에 다시 만들거나 요금제를 올려 주세요." : error.statusCode === 404 ? "고른 첫 화면을 더 이상 쓸 수 없습니다. 다시 골라 주세요." : "만들기를 시작하지 못했습니다. 잠시 뒤 다시 눌러 주세요.";
      throw new AgentChatError(error.statusCode, error.message, message);
    });
    return { generationId: job.generationJobId };
  },
  designPropose: async (userId, brewId, input) => {
    if (!designChatService) throw new AgentChatError(503, "design chat is not configured", "이 서버에서는 대화로 디자인을 고를 수 없습니다.");
    const chat = await designChatService.propose(userId, brewId, { requestId: randomUUID(), ...input }).catch((error: unknown) => { throw error instanceof DesignChatError ? new AgentChatError(error.statusCode, error.message, error.publicMessage) : error; });
    return { designMessageId: chat.messages.at(-1)!.id };
  },
  designRevise: async (userId, brewId, input) => {
    if (!designChatService) throw new AgentChatError(503, "design chat is not configured", "이 서버에서는 대화로 디자인을 고를 수 없습니다.");
    const chat = await designChatService.revise(userId, brewId, { requestId: randomUUID(), ...input }).catch((error: unknown) => { throw error instanceof DesignChatError ? new AgentChatError(error.statusCode, error.message, error.publicMessage) : error; });
    return { designMessageId: chat.messages.at(-1)!.id };
  },
  designState: async (userId, brewId) => {
    const chat = designChatService ? (await designChatService.get(userId, brewId)).chat : null;
    if (!chat || chat.messages.length === 0) return null;
    const proposals = chat.messages.findLast(message => message.role === "assistant" && message.card?.kind === "proposals");
    const card = proposals?.role === "assistant" && proposals.card?.kind === "proposals" ? proposals.card : null;
    return {
      ready: !!card,
      busy: chat.run?.status === "running",
      styles: card?.styles.map(style => style.name) ?? [],
      layouts: card?.layouts.map(layout => layout.name) ?? [],
      screens: chat.snippets.map(snippet => snippet.name).slice(-12),
      selected: chat.snippets.find(snippet => snippet.id === chat.selectedSnippetId)?.name ?? null,
    };
  },
};
const activityService = new ActivityService(database);
const agentChatService = new AgentChatService(database, config.agentChatEnabled ? new ClaudeAgentRuntime(config.agentChatModel, aiUsage) : null, careerService, jobBoardService, careerDocumentService, consentService, new AgentCredentials(database, config.agentCredentialEncryptionKey), portfolioReadService, pageService, entitlementService, consultantService, consultantCommitments, { demand: new GoalDemandService(database), store: new ConsultantDiagnoses(database) }, { jobs: jobBoardService, activities: activityService, dismissed: userId => proposalService.dismissedKeys(userId) }, agentBrews, agentWork);
// API는 제안을 읽고 실행을 줄에 넣기만 한다. AI 실행은 워커가 한다(`writer`를 주지 않는다).
const proposalService = new ProposalService(database, { career: careerService, jobs: jobBoardService, activities: activityService, consent: consentService, entitled: outreachGate(entitlementService), writer: null });
const adminService = new AdminService(database, { identity: identityService, career: careerService, consent: consentService });
const app = buildApi({
  adminService,
  agentChatService,
  consultantService,
  consultantCommitments,
  activityService,
  proposalService,
  config,
  readinessChecks: [database.readinessCheck, redis.readinessCheck],
  identityService,
  ...(googleIdTokenVerifier ? { googleIdTokenVerifier } : {}),
  entitlementService,
  usageService,
  careerService,
  careerDocumentService,
  jobMarketService,
  jobIngestService,
  jobUrlImporter,
  jobBoardService,
  jobAnalysisService,
  materialsService,
  brewTrashService: new BrewTrashService(database),
  interviewService,
  recipeService,
  companyResearchService,
  brewJobService,
  designSystemService,
  templateService,
  generationService,
  portfolioEditingService,
  portfolioReadService,
  portfolioTrashService: new PortfolioTrashService(database),
  consentService,
  layoutService,
  publishingService,
  mediaService,
  pageService,
  pageStream,
  ...(pageGenerator ? { pageGenerator } : {}),
  pageEditor,
  designChatService,
  analyticsService,
  engagementService,
  unifiedSearchService,
  accountLifecycleService,
});

/*
 * API는 인프라가 없어도 뜨고 `/health/ready`가 503으로 답합니다(README). 첫 요청에 연결을 맡기면 그 연결이 실패한
 * 클라이언트는 닫힌 채로 남아 Mongo가 돌아와도 503에 머뭅니다. 뜨면서 연결될 때까지 직접 다시 시도합니다.
 */
const mongoConnection = new AbortController();
const mongoConnected = connectMongoUntilReady(database.client, {
  signal: mongoConnection.signal,
  onRetry(error) {
    app.log.warn({ error: safeErrorSummary(error) }, "MongoDB is unavailable; retrying connection");
  },
});

let stopping = false;

async function stop(signal: NodeJS.Signals): Promise<void> {
  if (stopping) return;
  stopping = true;

  app.log.info({ signal }, "stopping API");
  mongoConnection.abort();
  await app.close();
  await mongoConnected;
  await Promise.allSettled([database.close(), redis.close(), careerDocumentJobs.close()]);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void stop(signal).catch((error: unknown) => {
      app.log.error({ error }, "failed to stop API cleanly");
      process.exitCode = 1;
    });
  });
}

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error({ error }, "failed to start API");
  mongoConnection.abort();
  await mongoConnected;
  await Promise.allSettled([app.close(), database.close(), redis.close(), careerDocumentJobs.close()]);
  process.exitCode = 1;
}
