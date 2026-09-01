import { z } from "zod";

const runtimeConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().min(1).default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4_000),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  MONGODB_URL: z.url().refine((value) => ["mongodb:", "mongodb+srv:"].includes(new URL(value).protocol), "MONGODB_URL must use mongodb:// or mongodb+srv://").default("mongodb://admin:expresso-admin@127.0.0.1:57017/expresso?authSource=admin&replicaSet=rs0"),
  MONGODB_DATABASE: z.string().regex(/^[A-Za-z0-9_-]{1,63}$/).default("expresso"),
  REDIS_URL: z.url().default("redis://127.0.0.1:6379"),
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().min(100).max(60_000).default(1_000),
  OUTBOX_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(25),
  OUTBOX_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
  QUEUE_PREFIX: z.string().regex(/^[a-z][a-z0-9-]{1,30}$/).default("expresso-mongo-v1"),
  ASSET_SIGNING_SECRET: z.string().min(16).default("expresso-local-asset-signing-secret"),
  MEDIA_PROVIDER: z.enum(["local", "s3"]).default("local"),
  MEDIA_DIR: z.string().min(1).default("var/media"),
  ANALYTICS_VISITOR_SALT: z.string().min(16).default("expresso-local-analytics-salt"),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(30_000),
  CAREER_SOCKET_ALLOWED_ORIGIN: z.url().default("http://127.0.0.1:3000"),

  /**
   * Google 로그인의 클라이언트 ID. **검증에만 쓴다** — ID 토큰의 `aud`가 우리
   * 것인지 보는 값이라 비밀이 아니다. 인가 코드 교환(client secret)은 웹이 한다.
   *
   * 없으면 `/v1/auth/google*`이 503으로 답한다. 검증기 없이 통과시키는 경로는
   * 두지 않는다 — 그건 아무나 로그인된다는 뜻이다.
   */
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),

  /**
   * AI 프로바이더. 기본은 `off` — 키도 로그인도 없이 앱 전체가 돌아야 하고,
   * 그때는 각 모듈의 규칙 기반 구현이 그대로 쓰인다.
   *
   * `claude-code`와 `codex`는 **개발 전용**이다. 이 머신에 로그인된 CLI로 부르고,
   * CI·컨테이너에서는 별도 인증 없이는 동작하지 않는다.
   */
  AI_PROVIDER: z.enum(["off", "claude-code", "codex", "fixture", "anthropic"]).default("off"),
  /**
   * 지면 생성만 다른 프로바이더로.
   *
   * **부분 출력을 낼 수 있는 프로바이더가 갈린다.** 2026-08-14 실측 —
   * codex `exec --json`은 최종 메시지를 한 덩어리로만 내고(짧은 응답 · 200줄
   * 지면 모두), claude-code는 `--include-partial-messages`로 구조화 출력을
   * 조각내 준다. 만들어지는 지면을 보여주는 화면은 뒤엣것이라야 살아난다.
   *
   * 값이 따로 든다 — 같은 실측에서 40줄짜리 히어로 하나에 6턴 · $0.093이었다
   * (에이전트가 `Write`·`Artifact`를 먼저 시도하다 거절당하고 마지막에
   * `StructuredOutput`을 부른다). 그래서 **이 계약 하나만** 가른다.
   *
   * 비우면 `AI_PROVIDER`를 그대로 쓴다. 그러면 조각은 안 흐르고 `done`만 간다 —
   * 진행률을 지어내지 않는다.
   */
  AI_PROVIDER_PAGE_GENERATION: z
    .enum(["claude-code", "codex", "fixture", "anthropic"])
    .optional(),
  /**
   * 고용24(워크넷) 공공 API 인증키. 공공데이터포털에서 발급받는다.
   *
   * 없으면 워크넷 어댑터를 만들지 않는다 — 키 없이 도는 척하면 매일 아침
   * 0건을 모으고 성공했다고 적는다.
   */
  WORK24_API_KEY: z.string().min(1).optional(),
  AI_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(600_000).default(180_000),
  AI_FIXTURE_DIR: z.string().min(1).default("fixtures/ai"),
  /** 호출을 픽스처로 남긴다. 탐색이 회귀 테스트를 먹여살리는 지점. */
  AI_RECORD: z.stringbool().default(false),
  CLAUDE_CLI_PATH: z.string().min(1).default("claude"),
  CODEX_CLI_PATH: z.string().min(1).default("codex"),
  /**
   * codex 홈을 사람이 쓰는 것과 갈라 놓는다. 비우면 사람 홈을 그대로 쓴다.
   *
   * 실측(2026-08-13): 사람 홈의 `AGENTS.md`가 호출마다 4,260토큰씩 실려 갔다.
   */
  CODEX_HOME: z.string().min(1).optional(),
  /** 계약별 모델 덮어쓰기 — `AI_MODEL_JOB_ANALYSIS=sonnet` 형태. */
  AI_MODEL_JOB_ANALYSIS: z.string().min(1).optional(),
  /** 공고 본문에서 급여·경력·근무형태를 읽는 계약. 163건을 한 번에 도는 자리라 모델을 갈아 볼 일이 잦다. */
  AI_MODEL_JOB_FACTS: z.string().min(1).optional(),
  AI_MODEL_SEARCH_INTERPRET: z.string().min(1).optional(),
  AI_MODEL_QUESTION_DRAFT: z.string().min(1).optional(),
  AI_MODEL_RECORD_CLEANUP: z.string().min(1).optional(),
  AI_MODEL_RECIPE_DRAFT: z.string().min(1).optional(),
  AI_MODEL_GENERATION: z.string().min(1).optional(),
  AI_MODEL_PARTIAL_EDIT: z.string().min(1).optional(),
  AI_MODEL_STYLE_REMIX: z.string().min(1).optional(),
  AI_MODEL_INSIGHT_NOTE: z.string().min(1).optional(),
});

export interface RuntimeConfig {
  nodeEnv: z.infer<typeof runtimeConfigSchema>["NODE_ENV"];
  host: string;
  port: number;
  logLevel: z.infer<typeof runtimeConfigSchema>["LOG_LEVEL"];
  mongodbUrl?: string;
  mongodbDatabase?: string;
  /** SQL 비교 테스트만 쓰는 과도기 입력입니다. 런타임 로더는 이 값을 만들지 않습니다. */
  databaseUrl?: string;
  redisUrl: string;
  outboxPollIntervalMs: number;
  outboxBatchSize: number;
  outboxMaxAttempts: number;
  queuePrefix: string;
  assetSigningSecret?: string;
  /** 올린 이미지를 어디에 두는가. `s3`는 아직 어댑터가 없다. */
  mediaProvider?: "local" | "s3";
  mediaDir?: string;
  analyticsVisitorSalt?: string;
  requestTimeoutMs?: number;
  careerSocketAllowedOrigin?: string;
  /** 없으면 Google 로그인 경로를 열지 않는다. */
  googleClientId?: string | undefined;
  /** 없으면 `off`. 키도 로그인도 없이 앱 전체가 돌아야 한다. */
  aiProvider?: "off" | "claude-code" | "codex" | "fixture" | "anthropic";
  /** 지면 생성만 갈아 끼울 때. 비우면 `aiProvider`와 같다. */
  aiPageGenerationProvider?: "claude-code" | "codex" | "fixture" | "anthropic";
  work24ApiKey?: string | undefined;
  aiTimeoutMs?: number;
  aiFixtureDir?: string;
  aiRecord?: boolean;
  claudeCliPath?: string;
  codexCliPath?: string;
  /** 없으면 사람이 쓰는 codex 홈을 그대로 쓴다. */
  codexHome?: string | undefined;
  aiModelOverrides?: Partial<Record<string, string>>;
}

export function loadRuntimeConfig(
  environment: NodeJS.ProcessEnv = process.env,
): RuntimeConfig {
  const result = runtimeConfigSchema.parse(environment);

  return {
    nodeEnv: result.NODE_ENV,
    host: result.HOST,
    port: result.PORT,
    logLevel: result.LOG_LEVEL,
    mongodbUrl: result.MONGODB_URL,
    mongodbDatabase: result.MONGODB_DATABASE,
    redisUrl: result.REDIS_URL,
    outboxPollIntervalMs: result.OUTBOX_POLL_INTERVAL_MS,
    outboxBatchSize: result.OUTBOX_BATCH_SIZE,
    outboxMaxAttempts: result.OUTBOX_MAX_ATTEMPTS,
    queuePrefix: result.QUEUE_PREFIX,
    assetSigningSecret: result.ASSET_SIGNING_SECRET,
    mediaProvider: result.MEDIA_PROVIDER,
    mediaDir: result.MEDIA_DIR,
    analyticsVisitorSalt: result.ANALYTICS_VISITOR_SALT,
    requestTimeoutMs: result.REQUEST_TIMEOUT_MS,
    careerSocketAllowedOrigin: result.CAREER_SOCKET_ALLOWED_ORIGIN,
    googleClientId: result.GOOGLE_CLIENT_ID,
    aiProvider: result.AI_PROVIDER,
    ...(result.AI_PROVIDER_PAGE_GENERATION
      ? { aiPageGenerationProvider: result.AI_PROVIDER_PAGE_GENERATION }
      : {}),
    work24ApiKey: result.WORK24_API_KEY,
    aiTimeoutMs: result.AI_TIMEOUT_MS,
    aiFixtureDir: result.AI_FIXTURE_DIR,
    aiRecord: result.AI_RECORD,
    claudeCliPath: result.CLAUDE_CLI_PATH,
    codexCliPath: result.CODEX_CLI_PATH,
    codexHome: result.CODEX_HOME,
    aiModelOverrides: Object.fromEntries(
      Object.entries({
        job_analysis: result.AI_MODEL_JOB_ANALYSIS,
        job_facts: result.AI_MODEL_JOB_FACTS,
        search_interpret: result.AI_MODEL_SEARCH_INTERPRET,
        question_draft: result.AI_MODEL_QUESTION_DRAFT,
        record_cleanup: result.AI_MODEL_RECORD_CLEANUP,
        recipe_draft: result.AI_MODEL_RECIPE_DRAFT,
        generation: result.AI_MODEL_GENERATION,
        partial_edit: result.AI_MODEL_PARTIAL_EDIT,
        style_remix: result.AI_MODEL_STYLE_REMIX,
        insight_note: result.AI_MODEL_INSIGHT_NOTE,
      }).filter(([, value]) => value !== undefined),
    ),
  };
}
