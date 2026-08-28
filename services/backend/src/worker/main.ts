import { setTimeout as delay } from "node:timers/promises";

import { loadRuntimeConfig } from "../config/runtime-config.js";
import { OutboxDispatcher } from "../platform/outbox.js";
import { createMysqlResource } from "../platform/mysql.js";
import { createReliableQueue } from "../platform/queue.js";
import { safeErrorSummary } from "../platform/observability.js";
import { createQueueWorker } from "./create-queue-worker.js";
import { JobAnalysisService } from "../modules/job-analysis/index.js";
import { UnavailableRequirementExtractor } from "../modules/job-analysis/extractor.js";
import { AiRequirementExtractor } from "../modules/job-analysis/ai-extractor.js";
import { createAiClient } from "../platform/ai/create-client.js";
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
import { createExportProcessor } from "./processors/export.js";
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

const config = loadRuntimeConfig();
const database = createMysqlResource(config.databaseUrl);
const jobs = createReliableQueue<Record<string, unknown>>(
  "domain-jobs",
  config.redisUrl,
  config.queuePrefix,
);
const dispatcher = new OutboxDispatcher({
  sql: database.sql,
  queue: jobs.queue,
  batchSize: config.outboxBatchSize,
  maxAttempts: config.outboxMaxAttempts,
});
const abortController = new AbortController();
// AI가 꺼져 있으면(`AI_PROVIDER=off`) 요건 추출과 문장 생성은 멈춘다.
const ai = createAiClient(config);
// 계약을 부르기 전에 지나는 문. 워커에서 도는 계약도 예외가 아니다.
const consentService = new ConsentService(database.sql);
const jobAnalysisService = new JobAnalysisService(database.sql);
const generationService = new GenerationService(database.sql, consentService);
// 지면을 만드는 쪽이 여기다 — 조각은 전부 이 프로세스에서 나간다.
const pageStream = new PageStream(createStreamRedis(config.redisUrl), {
  prefix: config.queuePrefix,
});
const pageService = new PageService(database.sql, consentService, pageStream);
const analysisProcessor = createJobAnalysisProcessor(
  jobAnalysisService,
  ai ? new AiRequirementExtractor(ai) : new UnavailableRequirementExtractor(),
);
// AI가 없으면 여기서 멈춘다 — 규칙으로 흉내 낸 문장과 요건을 제품에 두지 않는다.
const generationProcessor = createGenerationProcessor(
  generationService,
  ai ? new AiSentenceWriter(ai) : new UnavailableSentenceWriter(),
  ai ? new AiLayoutDesigner(ai) : null,
  ai ? { service: pageService, generator: new AiPageGenerator(ai) } : null,
);
// 질문 생성 · 레시피 생성도 여기서 돈다. HTTP 요청은 잡만 만들고 바로 돌아간다.
const brewJobService = new BrewJobService(database.sql);
const interviewService = new InterviewService(
  database.sql,
  ai ? new AiQuestionWriter(ai) : null,
  ai ? new AiRecordCleaner(ai) : null,
  consentService,
);
const recipeService = new RecipeService(database.sql, ai ? new AiRecipePlanner(ai) : null, consentService);
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
});
const recordCleanupProcessor = createRecordCleanupProcessor(interviewService);
const publishingService = new PublishingService(database.sql, config.assetSigningSecret);
const exportProcessor = createExportProcessor(publishingService);
const analyticsService = new AnalyticsService(database.sql, config.analyticsVisitorSalt ? { visitorSalt: config.analyticsVisitorSalt } : {});
const analyticsProcessor = createAnalyticsProcessor(analyticsService);
const engagementService = new EngagementService(database.sql);
const notificationProcessor = createNotificationProcessor(engagementService, new ConsoleNotificationProvider());
const accountLifecycleService = new AccountLifecycleService(database.sql);
// 수집은 여기서만 돈다 — 바깥을 부르는 일은 요청 경로가 아니라 워커의 일이다.
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
const schedulingService = new SchedulingService(database.sql, { analytics: analyticsService, accounts: accountLifecycleService, ingest: jobIngestService });
const scheduledJobProcessor = createScheduledJobProcessor(schedulingService);
const queueWorker = createQueueWorker<Record<string, unknown>, Record<string, unknown>>({
  queueName: "domain-jobs",
  redisUrl: config.redisUrl,
  prefix: config.queuePrefix,
  deadLetterQueue: jobs.deadLetterQueue,
  processor: async (job) => {
    if (job.name === "job.normalize") return analysisProcessor(job);
    if (job.name === "record.cleanup") return recordCleanupProcessor(job);
    if (job.name === "interview.draft") return brewJobProcessor(job);
    if (job.name === "recipe.draft") return brewJobProcessor(job);
    if (job.name === "portfolio.generate") return generationProcessor(job);
    if (job.name === "portfolio.export") return exportProcessor(job);
    if (job.name === "analytics.aggregate") return analyticsProcessor(job);
    if (job.name === "notification.deliver") return notificationProcessor(job);
    if (job.name === "scheduled.execute") return scheduledJobProcessor(job);
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
  }),
);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    console.info(
      JSON.stringify({ level: "info", message: "stopping worker", signal }),
    );
    abortController.abort();
  });
}

while (!abortController.signal.aborted) {
  try {
    await schedulingService.scheduleDue();
    const result = await dispatcher.pollOnce();
    if (result.published || result.retried || result.deadLettered) {
      console.info(
        JSON.stringify({ level: "info", message: "outbox poll completed", ...result }),
      );
    }
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        message: "outbox poll failed",
        error: safeErrorSummary(error),
      }),
    );
  }

  try {
    await delay(config.outboxPollIntervalMs, undefined, {
      signal: abortController.signal,
    });
  } catch (error) {
    if (!abortController.signal.aborted) throw error;
  }
}

await Promise.allSettled([queueWorker.close(), jobs.close(), database.close()]);
