import { buildApi } from "./build-app.js";
import { loadRuntimeConfig } from "../config/runtime-config.js";
import { createMysqlResource } from "../platform/mysql.js";
import { createRedisResource, createStreamRedis } from "../platform/redis.js";
import { IdentityService } from "../modules/identity/index.js";
import { RemoteGoogleIdTokenVerifier } from "../modules/identity/google.js";
import { EntitlementService } from "../modules/entitlements/index.js";
import { CareerService } from "../modules/career/index.js";
import { JobMarketService } from "../modules/jobs/index.js";
import { AiFactsReader, createJobSourceAdapters, BundledMarkReader, JobIngestService, JobUrlImporter, SiteMarkReader } from "../modules/jobs/ingest/index.js";
import { JobBoardService } from "../modules/jobs/index.js";
import { JobAnalysisService } from "../modules/job-analysis/index.js";
import { MaterialsService } from "../modules/materials/index.js";
import { InterviewService } from "../modules/interview/index.js";
import { RecipeService } from "../modules/recipe/index.js";
import { CompanyResearchService } from "../modules/company-research/index.js";
import { BrewJobService } from "../modules/brew-jobs/index.js";
import { ConsentService } from "../modules/consent/index.js";
import { AiBlockEditor } from "../modules/portfolio-editing/editor.js";
import { AiLayoutRemixer } from "../modules/layout/remixer.js";
import { AiInsightWriter } from "../modules/analytics/writer.js";
import { createAiClient } from "../platform/ai/create-client.js";
import { TemplateService } from "../modules/templates/index.js";
import { GenerationService } from "../modules/generation/index.js";
import { PortfolioEditingService } from "../modules/portfolio-editing/index.js";
import { PortfolioReadService } from "../modules/portfolios/index.js";
import { LayoutService } from "../modules/layout/index.js";
import { PublishingService } from "../modules/publishing/index.js";
import { MediaService } from "../modules/media/index.js";
import { PageService } from "../modules/page/index.js";
import { PageStream } from "../modules/page/stream.js";
import { AiPageGenerator } from "../modules/page/generator.js";
import { createMediaStorage } from "../platform/storage/create-storage.js";
import { AnalyticsService } from "../modules/analytics/index.js";
import { EngagementService } from "../modules/engagement/index.js";
import { AccountLifecycleService } from "../modules/account-lifecycle/index.js";

const config = loadRuntimeConfig();
const database = createMysqlResource(config.databaseUrl);
const redis = createRedisResource(config.redisUrl);
const identityService = new IdentityService(database.sql);
// 클라이언트 ID가 없으면 만들지 않는다 — 라우트가 503으로 답하고, 화면은
// 버튼을 열지 않는다. 검증기 없이 도는 척하는 경로를 두지 않는다.
const googleIdTokenVerifier = config.googleClientId
  ? new RemoteGoogleIdTokenVerifier({ clientId: config.googleClientId })
  : null;
const entitlementService = new EntitlementService(database.sql);
const careerService = new CareerService(database.sql);
const jobMarketService = new JobMarketService(database.sql);
const jobUrlImporter = new JobUrlImporter();
const jobBoardService = new JobBoardService(database.sql);
const jobAnalysisService = new JobAnalysisService(database.sql);
const materialsService = new MaterialsService(database.sql);
const interviewService = new InterviewService(database.sql);
const recipeService = new RecipeService(database.sql);
const companyResearchService = new CompanyResearchService(database.sql);
const templateService = new TemplateService(database.sql, recipeService);
const generationService = new GenerationService(database.sql);
// 04b "말로 고치기"만 요청 안에서 계약을 부른다 — 사용자가 결과를 보고
// 적용할지 정하는 대화형 편집이라 뒤로 미룰 수 없다(§8.3은 이 화면을
// 스트리밍으로 그린다. 지금은 한 번에 받는다).
const ai = createAiClient(config);

// 수집은 매일 아침 워커가 돌린다. API에는 목록·수동 실행과 주소 읽기만 있으면 된다.
const jobIngestService = new JobIngestService(
  database.sql,
  createJobSourceAdapters(config),
  // AI가 꺼져 있으면 본문을 읽지 않는다. 규칙 폴백을 두지 않는 이유는
  // 정확도가 조용히 갈리기 때문이다 — 화면은 그 둘을 구분해 말할 수 없다.
  ai ? new AiFactsReader(ai) : null,
  // 회사 로고는 AI와 무관하다 — 회사가 자기 사이트에 걸어 둔 아이콘을 받는다.
  // 저장소에 넣어 둔 파일이 있으면 그것이 먼저다(받아 올 수 없는 회사가 있다).
  new BundledMarkReader(new SiteMarkReader()),
);
// 계약을 부르기 전에 지나는 문. 규칙 폴백은 지나지 않는다.
const consentService = new ConsentService(database.sql);
const portfolioEditingService = new PortfolioEditingService(
  database.sql,
  ai ? new AiBlockEditor(ai) : null,
  consentService,
);
const portfolioReadService = new PortfolioReadService(database.sql);
const layoutService = new LayoutService(database.sql, ai ? new AiLayoutRemixer(ai) : null, consentService);
const brewJobService = new BrewJobService(database.sql);
const publishingService = new PublishingService(database.sql, config.assetSigningSecret);
const mediaService = new MediaService(database.sql, createMediaStorage(config));
// 자유 생성 지면. 요청 안에서 계약을 부른다 — 사용자가 뽑기를 누르고 기다리는
// 화면이고, 결과가 곧 페이지 전체라 뒤로 미뤄 봐야 볼 것이 없다.
// 만들어지는 지면이 지나는 길. 워커가 쓰고 여기서 읽어 브라우저로 흘린다.
const pageStream = new PageStream(createStreamRedis(config.redisUrl), {
  prefix: config.queuePrefix,
});
const pageService = new PageService(database.sql, consentService, pageStream);
// AI가 꺼져 있으면 지면을 만들 길이 없다. 규칙 폴백을 두지 않는다 —
// 이 경로의 산출물은 **모델이 쓴 마크업 그 자체**여서 흉내 낼 것이 없다.
const pageGenerator = ai ? new AiPageGenerator(ai) : null;
const analyticsService = new AnalyticsService(database.sql, {
  ...(config.analyticsVisitorSalt ? { visitorSalt: config.analyticsVisitorSalt } : {}),
  // 해설은 07에서 사용자가 누를 때만 쓴다. 없으면 숫자를 다시 읽어 주는 한 문장이 남는다.
  writer: ai ? new AiInsightWriter(ai) : null,
  consent: consentService,
  // 기업 도메인 방문은 PRO다. 자격 판정이 없으면 아예 보여주지 않는다.
  entitlements: entitlementService,
});
const engagementService = new EngagementService(database.sql);
const accountLifecycleService = new AccountLifecycleService(database.sql);
const app = buildApi({
  config,
  readinessChecks: [database.readinessCheck, redis.readinessCheck],
  identityService,
  ...(googleIdTokenVerifier ? { googleIdTokenVerifier } : {}),
  entitlementService,
  careerService,
  jobMarketService,
  jobIngestService,
  jobUrlImporter,
  jobBoardService,
  jobAnalysisService,
  materialsService,
  interviewService,
  recipeService,
  companyResearchService,
  brewJobService,
  templateService,
  generationService,
  portfolioEditingService,
  portfolioReadService,
  consentService,
  layoutService,
  publishingService,
  mediaService,
  pageService,
  pageStream,
  ...(pageGenerator ? { pageGenerator } : {}),
  analyticsService,
  engagementService,
  accountLifecycleService,
});

let stopping = false;

async function stop(signal: NodeJS.Signals): Promise<void> {
  if (stopping) return;
  stopping = true;

  app.log.info({ signal }, "stopping API");
  await app.close();
  await Promise.allSettled([database.close(), redis.close()]);
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
  await Promise.allSettled([app.close(), database.close(), redis.close()]);
  process.exitCode = 1;
}
