import { loadRuntimeConfig } from "../config/runtime-config.js";
import { MongoOutboxDispatcher } from "../platform/mongo-outbox.js";
import { createMongoResource } from "../platform/mongodb.js";
import { createReliableQueue } from "../platform/queue.js";
import { safeErrorSummary } from "../platform/observability.js";
import { createQueueWorker } from "./create-queue-worker.js";
import { QUEUE_NAMES, queueNameFor } from "./queue-routing.js";
import { Wake, watchOutboxInserts } from "./outbox-wake.js";
import { runPollLoop } from "./poll-loop.js";
import { closeWorkerRuntime } from "./shutdown.js";
import { JobAnalysisService } from "../modules/job-analysis/index.js";
import { UnavailableRequirementExtractor } from "../modules/job-analysis/extractor.js";
import { AiRequirementExtractor } from "../modules/job-analysis/ai-extractor.js";
import { createAiClient } from "../platform/ai/create-client.js";
import { MongoAiUsageSink } from "../platform/ai/usage-sink.js";
import { createJobAnalysisProcessor } from "./processors/job-analysis.js";
import { GenerationService } from "../modules/generation/index.js";
import { AiSentenceWriter, UnavailableSentenceWriter } from "../modules/generation/writer.js";
import { AiLayoutDesigner } from "../modules/layout/designer.js";
import { createGenerationProcessor } from "./processors/generation.js";
import { BrewJobService } from "../modules/brew-jobs/index.js";
import { ConsentService } from "../modules/consent/index.js";
import { InterviewService } from "../modules/interview/index.js";
import { AiQuestionWriter } from "../modules/interview/question-writer.js";
import { AiRecordCleaner } from "../modules/career/record-cleaner.js";
import { RecipeService } from "../modules/recipe/index.js";
import { AiRecipePlanner } from "../modules/recipe/planner.js";
import { createBrewJobProcessor } from "./processors/brew-jobs.js";
import { createRecordCleanupProcessor } from "./processors/record-cleanup.js";
import { PublishingService } from "../modules/publishing/index.js";
import { AnalyticsService } from "../modules/analytics/index.js";
import { createAnalyticsProcessor } from "./processors/analytics.js";
import { EngagementService } from "../modules/engagement/index.js";
import { ConsoleNotificationProvider, createNotificationProcessor } from "./processors/notifications.js";
import { AccountLifecycleService } from "../modules/account-lifecycle/index.js";
import { SchedulingService } from "../modules/scheduling/index.js";
import { AiFactsReader, createJobSourceAdapters, BundledMarkReader, JobIngestService, SiteMarkReader } from "../modules/jobs/ingest/index.js";
import { createScheduledJobProcessor } from "./processors/scheduled-jobs.js";
import { PageService } from "../modules/page/index.js";
import { PageStream } from "../modules/page/stream.js";
import { createStreamRedis } from "../platform/redis.js";
import { AiPageGenerator } from "../modules/page/generator.js";
import { StructuredPageGenerator } from "../modules/page/structured-generator.js";
import { FormatRoutingPageGenerator } from "../modules/page/format-router.js";
import { MediaService } from "../modules/media/index.js";
import { ChromiumPageMeasurer } from "../platform/browser/page-measurer.js";
import { createPageRefineProcessor } from "./processors/page-refine.js";
import { createMediaStorage } from "../platform/storage/create-storage.js";
import { CareerDocumentService } from "../modules/career-editor/index.js";
import { MongoCareerPropertySchemaService } from "../modules/career/index.js";
import { createCareerDocumentCompactionProcessor } from "./processors/career-document-compaction.js";
import { createCareerDocumentProjectionProcessor } from "./processors/career-document-projection.js";
import { CAREER_PROPERTY_MUTATION_JOBS, createCareerPropertyMutationProcessor } from "./processors/career-property-mutation.js";
import { MongoCareerComputationService } from "../modules/career-computation/index.js";
import { createCareerComputationProcessor } from "./processors/career-computation.js";

// 처리 중인 잡을 기다리지 않으므로 남은 일은 연결을 닫는 것뿐입니다. RestartSec(3초)보다 오래 끌 까닭이 없습니다.
const FATAL_SHUTDOWN_DEADLINE_MS = 3_000;

function logWorkerFatal(error: unknown): void {
  console.error(JSON.stringify({
    level: "error",
    event: "worker.fatal",
    message: "worker is exiting because MongoDB client is unusable",
    error: safeErrorSummary(error),
  }));
}

const config = loadRuntimeConfig();
if (!config.mongodbUrl || !config.mongodbDatabase) throw new Error("MongoDB runtime configuration is missing");
const database = createMongoResource(config.mongodbUrl, { databaseName: config.mongodbDatabase });
/*
 * 첫 작업에 연결을 맡기면 그 연결이 실패한 클라이언트는 다시 열리지 않습니다. 잡을 받기 전에 직접 연결하고,
 * 실패하면 끝내서 systemd가 다시 띄우게 합니다. 한 주기가 서버 선택 3초 + RestartSec 3초라 StartLimit(10초에 5회)에
 * 걸리지 않습니다.
 */
try {
  await database.client.connect();
} catch (error) {
  logWorkerFatal(error);
  process.exit(1);
}
const workerConcurrency = config.workerConcurrency ?? 1;
const jobs = createReliableQueue<Record<string, unknown>>(
  QUEUE_NAMES.domain,
  config.redisUrl,
  config.queuePrefix,
);
/*
 * 생성은 3~5분이 걸려 분석 · 질문(수십 초)과 줄을 나눕니다. 같은 줄이면 생성이 자리를 모두 차지했을 때 짧은 작업도
 * 몇 분을 기다립니다.
 */
const generationJobs = createReliableQueue<Record<string, unknown>>(
  QUEUE_NAMES.generation,
  config.redisUrl,
  config.queuePrefix,
);
/*
 * 다듬기는 초안을 저장한 뒤 뒤에서 도는 일이라 따로 줄을 섭니다. 같은 줄에 두면 다듬기가 자리를 차지한 동안
 * 사용자의 다음 생성이 기다립니다 — 2026-10-26 체험 서버에서 직전 판의 다듬기(211초) 뒤에 새 생성이 섰습니다.
 */
const refineJobs = createReliableQueue<Record<string, unknown>>(
  QUEUE_NAMES.refine,
  config.redisUrl,
  config.queuePrefix,
);
/*
 * 커리어 문서 투영 · 압축 · 계산 · 속성 변경은 몇 초 안에 끝나야 화면 값이 맞습니다. AI를 기다리는 줄에 두면
 * bodyMd와 수식 값이 그동안 낡습니다(2026-11-02 감사). 따로 줄을 섭니다.
 */
const careerJobs = createReliableQueue<Record<string, unknown>>(
  QUEUE_NAMES.career,
  config.redisUrl,
  config.queuePrefix,
);
const queues = { [QUEUE_NAMES.domain]: jobs.queue, [QUEUE_NAMES.generation]: generationJobs.queue, [QUEUE_NAMES.refine]: refineJobs.queue, [QUEUE_NAMES.career]: careerJobs.queue };
const queueFor = (name: string) => queues[queueNameFor(name)];
const dispatcher = new MongoOutboxDispatcher({
  context: database,
  queue: { add: (name, payload, options) => queueFor(name).add(name, payload, options) },
  batchSize: config.outboxBatchSize,
  maxAttempts: config.outboxMaxAttempts,
});
const abortController = new AbortController();
let stoppingOnFatal = false;
const stopOnFatal = (error: unknown) => {
  if (stoppingOnFatal) return;
  stoppingOnFatal = true;
  logWorkerFatal(error);
  process.exitCode = 1;
  // 처리 중인 잡은 어차피 저장하지 못합니다. 닫는 일이 멈춰도 프로세스가 살아 있는 상태로 돌아가지 않게 끊습니다.
  setTimeout(() => process.exit(1), FATAL_SHUTDOWN_DEADLINE_MS).unref();
  abortController.abort();
};
// AI가 꺼져 있으면(`AI_PROVIDER=off`) 요건 추출과 문장 생성은 멈춘다.
const aiUsage = new MongoAiUsageSink(database);
const ai = createAiClient(config, aiUsage);
// 계약을 부르기 전에 지나는 문. 워커에서 도는 계약도 예외가 아니다.
const consentService = new ConsentService(database);
const jobAnalysisService = new JobAnalysisService(database);
const generationService = new GenerationService(database, consentService);
// 지면을 만드는 쪽이 여기다 — 조각은 전부 이 프로세스에서 나간다.
const pageStream = new PageStream(createStreamRedis(config.redisUrl), {
  prefix: config.queuePrefix,
});
const pageService = new PageService(database, consentService, pageStream);
// 생성한 지면을 실제 브라우저로 재는 측정기입니다. 브라우저는 처음 잴 때 띄우고, 띄우지 못하면 생성은 측정 없이 이어갑니다.
const mediaService = new MediaService(database, createMediaStorage(config));
const pageMeasurer = new ChromiumPageMeasurer((assetId, width) => mediaService.read(assetId, width).catch(() => null));
// 생성과 다듬기가 같은 생성기를 씁니다. 다듬기는 초안을 저장한 뒤 `page.refine`으로 이어서 돕니다.
const structuredPageGenerator = ai ? new StructuredPageGenerator(ai, pageMeasurer) : null;
const pageRefineProcessor = createPageRefineProcessor(pageService, structuredPageGenerator);
const analysisProcessor = createJobAnalysisProcessor(
  jobAnalysisService,
  ai ? new AiRequirementExtractor(ai) : new UnavailableRequirementExtractor(),
);
// 생성 완료 알림을 생성 처리기가 만들기 때문에 먼저 둔다.
const engagementService = new EngagementService(database);
// AI가 없으면 여기서 멈춘다 — 규칙으로 흉내 낸 문장과 요건을 제품에 두지 않는다.
const generationProcessor = createGenerationProcessor(
  generationService,
  ai ? new AiSentenceWriter(ai) : new UnavailableSentenceWriter(),
  ai ? new AiLayoutDesigner(ai) : null,
  // 지면 방식은 생성마다 고른다(구조화 생성 · 자유 생성). 고르지 않은 생성은 설정 값을 따른다.
  ai ? {
    service: pageService,
    generator: new FormatRoutingPageGenerator(
      { html: new AiPageGenerator(ai), "json-render": structuredPageGenerator! },
      config.pageGenerationFormat ?? "json-render",
    ),
  } : null,
  engagementService,
  // 멈추는 중에 끊긴 생성은 실패로 확정하지 않는다. 새 Worker가 다시 돌린다.
  abortController.signal,
);
// 질문 생성 · 레시피 생성도 여기서 돈다. HTTP 요청은 잡만 만들고 바로 돌아간다.
const brewJobService = new BrewJobService(database);
const interviewService = new InterviewService(
  database,
  ai ? new AiQuestionWriter(ai) : null,
  ai ? new AiRecordCleaner(ai) : null,
  consentService,
);
const recipeService = new RecipeService(database, ai ? new AiRecipePlanner(ai) : null, consentService);
const brewJobProcessor = createBrewJobProcessor(brewJobService, {
  interview: {
    async run({ userId, brewId, idempotencyKey }) {
      return (await interviewService.start(userId, brewId, idempotencyKey)).id;
    },
  },
  recipe: {
    async run({ userId, brewId, idempotencyKey }) {
      return (await recipeService.generate(userId, brewId, idempotencyKey)).id;
    },
  },
  // 구성이 끝나면 그 구성을 기다리던 생성을 이어서 시작한다(구성 전에 맡긴 생성).
}, generationService);
const recordCleanupProcessor = createRecordCleanupProcessor(interviewService);
const publishingService = new PublishingService(database, config.assetSigningSecret);
const analyticsService = new AnalyticsService(database, config.analyticsVisitorSalt ? { visitorSalt: config.analyticsVisitorSalt } : {});
const analyticsProcessor = createAnalyticsProcessor(analyticsService);
const notificationProcessor = createNotificationProcessor(engagementService, new ConsoleNotificationProvider());
const accountLifecycleService = new AccountLifecycleService(database);
const careerDocumentService = new CareerDocumentService(database, config.assetSigningSecret);
const careerPropertyMutationProcessor = createCareerPropertyMutationProcessor(new MongoCareerPropertySchemaService(database));
const careerDocumentCompactionProcessor = createCareerDocumentCompactionProcessor(careerDocumentService);
const careerDocumentProjectionProcessor = createCareerDocumentProjectionProcessor(careerDocumentService);
const careerComputationProcessor = createCareerComputationProcessor(new MongoCareerComputationService(database));
// 수집은 여기서만 돈다 — 바깥을 부르는 일은 요청 경로가 아니라 워커의 일이다.
const jobIngestService = new JobIngestService(
  database,
  createJobSourceAdapters(config),
  // AI가 꺼져 있으면 본문을 읽지 않는다. 규칙 폴백을 두지 않는 이유는
  // 정확도가 조용히 갈리기 때문이다 — 화면은 그 둘을 구분해 말할 수 없다.
  ai ? new AiFactsReader(ai) : null,
  // 회사 로고는 AI와 무관하다 — 회사가 자기 사이트에 걸어 둔 아이콘을 받는다.
  // 저장소에 넣어 둔 파일이 있으면 그것이 먼저다(받아 올 수 없는 회사가 있다).
  new BundledMarkReader(new SiteMarkReader()),
);
const schedulingService = new SchedulingService(database, { analytics: analyticsService, accounts: accountLifecycleService, ingest: jobIngestService, notifications: engagementService });
const scheduledJobProcessor = createScheduledJobProcessor(schedulingService);
const queueWorker = createQueueWorker<Record<string, unknown>, Record<string, unknown>>({
  queueName: QUEUE_NAMES.domain,
  redisUrl: config.redisUrl,
  prefix: config.queuePrefix,
  deadLetterQueue: jobs.deadLetterQueue,
  concurrency: workerConcurrency,
  onFatalError: stopOnFatal,
  stopping: abortController.signal,
  processor: async (job) => {
    if (job.name === "job.normalize") return analysisProcessor(job);
    if (job.name === "record.cleanup") return recordCleanupProcessor(job);
    if (job.name === "interview.draft") return brewJobProcessor(job);
    if (job.name === "recipe.draft") return brewJobProcessor(job);
    // 생성 전용 줄을 만들기 전에 이 줄에 들어온 잡이 남아 있으면 여기서 끝낸다.
    if (job.name === "portfolio.generate") return generationProcessor(job);
    if (job.name === "page.refine") return pageRefineProcessor(job);
    if (job.name === "analytics.aggregate") return analyticsProcessor(job);
    if (job.name === "notification.deliver") return notificationProcessor(job);
    if (job.name === "scheduled.execute") return scheduledJobProcessor(job);
    if (job.name === "career.document.compact") return careerDocumentCompactionProcessor(job) as Promise<Record<string, unknown>>;
    if (job.name === "career.document.project") return careerDocumentProjectionProcessor(job) as Promise<Record<string, unknown>>;
    if (job.name === "career.computation") return careerComputationProcessor(job) as unknown as Promise<Record<string, unknown>>;
    if (CAREER_PROPERTY_MUTATION_JOBS.has(job.name)) return careerPropertyMutationProcessor(job);
    throw new Error(`Unsupported domain job: ${job.name}`);
  },
  onDeadLetterError(error) {
    console.error(JSON.stringify({
      level: "error",
      message: "failed to persist dead-letter job",
      error: safeErrorSummary(error),
    }));
  },
});

const careerProcessor = async (job: Parameters<typeof careerDocumentCompactionProcessor>[0]): Promise<Record<string, unknown>> => {
  if (job.name === "career.document.compact") return careerDocumentCompactionProcessor(job) as Promise<Record<string, unknown>>;
  if (job.name === "career.document.project") return careerDocumentProjectionProcessor(job) as Promise<Record<string, unknown>>;
  if (job.name === "career.computation") return careerComputationProcessor(job) as unknown as Promise<Record<string, unknown>>;
  if (CAREER_PROPERTY_MUTATION_JOBS.has(job.name)) return careerPropertyMutationProcessor(job);
  throw new Error(`Unsupported career job: ${job.name}`);
};
const careerWorker = createQueueWorker<Record<string, unknown>, Record<string, unknown>>({
  queueName: QUEUE_NAMES.career,
  redisUrl: config.redisUrl,
  prefix: config.queuePrefix,
  deadLetterQueue: careerJobs.deadLetterQueue,
  concurrency: 4,
  onFatalError: stopOnFatal,
  stopping: abortController.signal,
  processor: careerProcessor,
  onDeadLetterError(error) {
    console.error(JSON.stringify({ level: "error", message: "failed to persist dead-letter job", error: safeErrorSummary(error) }));
  },
});
careerWorker.on("error", (error) => {
  console.error(JSON.stringify({ level: "error", message: "queue worker error", error: safeErrorSummary(error) }));
});

const generationWorker = createQueueWorker<Record<string, unknown>, Record<string, unknown>>({
  queueName: QUEUE_NAMES.generation,
  redisUrl: config.redisUrl,
  prefix: config.queuePrefix,
  deadLetterQueue: generationJobs.deadLetterQueue,
  concurrency: workerConcurrency,
  onFatalError: stopOnFatal,
  stopping: abortController.signal,
  processor: (job) => generationProcessor(job),
  onDeadLetterError(error) {
    console.error(JSON.stringify({ level: "error", message: "failed to persist dead-letter job", error: safeErrorSummary(error) }));
  },
});

generationWorker.on("error", (error) => {
  console.error(JSON.stringify({ level: "error", message: "queue worker error", error: safeErrorSummary(error) }));
});

const refineWorker = createQueueWorker<Record<string, unknown>, Record<string, unknown>>({
  queueName: QUEUE_NAMES.refine,
  redisUrl: config.redisUrl,
  prefix: config.queuePrefix,
  deadLetterQueue: refineJobs.deadLetterQueue,
  concurrency: workerConcurrency,
  onFatalError: stopOnFatal,
  stopping: abortController.signal,
  processor: (job) => pageRefineProcessor(job),
  onDeadLetterError(error) {
    console.error(JSON.stringify({ level: "error", message: "failed to persist dead-letter job", error: safeErrorSummary(error) }));
  },
});

refineWorker.on("error", (error) => {
  console.error(JSON.stringify({ level: "error", message: "queue worker error", error: safeErrorSummary(error) }));
});

queueWorker.on("error", (error) => {
  console.error(JSON.stringify({
    level: "error",
    message: "queue worker error",
    error: safeErrorSummary(error),
  }));
});

console.info(
  JSON.stringify({
    level: "info",
    message: "worker runtime started",
    environment: config.nodeEnv,
    outboxPollIntervalMs: config.outboxPollIntervalMs,
    workerConcurrency,
  }),
);

const queueWorkers = [queueWorker, generationWorker, refineWorker, careerWorker];
/*
 * 멈추기 시작하면 곧바로 새 잡 받기를 멈춘다. 폴링 한 주기를 기다리는 동안 이 프로세스가 잡을 받으면, 받자마자 끊긴다.
 * `Worker.close`는 두 번 불러도 같은 약속을 돌려준다 — 아래 `closeWorkerRuntime`이 그 끝을 기다린다.
 */
abortController.signal.addEventListener("abort", () => {
  for (const worker of queueWorkers) void worker.close(stoppingOnFatal).catch(() => undefined);
}, { once: true });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    console.info(
      JSON.stringify({ level: "info", message: "stopping worker", signal }),
    );
    abortController.abort();
  });
}

// 아웃박스 행이 커밋되면 1초 주기를 기다리지 않고 발행한다. 흐름이 끊기면 같은 간격으로 다시 열고,
// 그동안 폴링은 그대로 돈다 — 흐름의 오류가 폴링 루프를 멈추지 않는다.
const outboxWake = new Wake();
const outboxWatch = watchOutboxInserts(database.db, () => outboxWake.notify(), {
  retryMs: config.outboxPollIntervalMs,
  signal: abortController.signal,
  onError(error) {
    console.error(JSON.stringify({ level: "warn", message: "outbox change stream failed", error: safeErrorSummary(error) }));
  },
});

await runPollLoop({
  intervalMs: config.outboxPollIntervalMs,
  signal: abortController.signal,
  wake: outboxWake,
  async poll() {
    if (config.scheduledJobsEnabled !== false) await schedulingService.scheduleDue();
    const result = await dispatcher.pollOnce();
    if (result.published || result.retried || result.deadLettered) {
      console.info(
        JSON.stringify({ level: "info", message: "outbox poll completed", ...result }),
      );
    }
  },
  onError(error) {
    console.error(
      JSON.stringify({
        level: "error",
        message: "outbox poll failed",
        error: safeErrorSummary(error),
      }),
    );
  },
  onFatal: stopOnFatal,
});

// fatal이면 처리 중인 잡을 기다리지 않습니다. 잠금이 만료되면 BullMQ의 stalled 처리가 다시 배달합니다.
// 그 밖에는 처리 중인 잡이 결과를 쓰거나 큐로 돌아갈 때까지 기다린 뒤에 연결을 닫습니다.
await closeWorkerRuntime({
  workers: queueWorkers,
  resources: [() => outboxWatch, () => jobs.close(), () => generationJobs.close(), () => refineJobs.close(), () => careerJobs.close(), () => database.close(), () => pageMeasurer.close()],
  force: stoppingOnFatal,
});
