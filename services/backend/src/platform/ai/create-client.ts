import type { z } from "zod";

import type { RuntimeConfig } from "../../config/runtime-config.js";
import type { AiCallOptions, AiCallSpec, AiClient, AiResult } from "./client.js";
import { AnthropicAiClient } from "./anthropic.js";
import { ClaudeCodeAiClient } from "./claude-code.js";
import { CodexAiClient } from "./codex.js";
import { FixtureAiClient, RecordingAiClient } from "./fixture.js";
import { MeteredAiClient } from "./metered.js";
import type { AiUsageSink } from "./usage-sink.js";

/**
 * 설정에서 AI 클라이언트를 만든다.
 *
 * `off`면 **null을 돌려준다** — 도메인은 그때 지금 쓰는 규칙 기반 구현을 그대로
 * 쓴다. 규칙 구현은 죽은 코드가 아니라 폴백이고, 그래서 키가 없어도 앱 전체가
 * 돈다. 테스트 122개가 오프라인으로 도는 이유이기도 하다.
 *
 * 싱크를 넘기면 돌려줄 클라이언트를 통째로 감싸 호출마다 사용량을 남긴다. 계약별
 * 경로를 하나씩 감싸지 않는다 — 어느 경로로 가든 이 바깥 한 겹을 지난다.
 */
export function createAiClient(config: RuntimeConfig, sink?: AiUsageSink): AiClient | null {
  const base = build(config, config.aiProvider ?? "off");
  if (!base) return null;

  // 계약 하나 때문에 전부를 옮기지 않는다 — 따로 정했고 기본과 다를 때만 길을 낸다.
  const routes: Partial<Record<string, AiClient>> = {};
  const overrides = {
    page_generation: config.aiPageGenerationProvider,
    search_interpret: config.aiSearchInterpretProvider,
  };
  for (const [contract, provider] of Object.entries(overrides)) {
    if (!provider || provider === config.aiProvider) continue;
    const routed = build(config, provider);
    if (routed) routes[contract] = routed;
  }
  const client = Object.keys(routes).length > 0 ? new ContractRoutedAiClient(base, routes) : base;
  return sink ? new MeteredAiClient(client, sink) : client;
}

/**
 * 계약에 따라 다른 프로바이더로 보낸다.
 *
 * 하나 때문에 전부를 바꾸지 않으려고 있다. 지면 생성만 **부분 출력이 필요하고**
 * 그걸 낼 수 있는 프로바이더는 값이 더 든다 — 163건을 도는 본문 읽기까지 같이
 * 옮기면 그 값을 쓸 이유가 없는 자리에까지 낸다.
 *
 * 검색 해석은 반대 이유로 갈린다 — **사람이 결과를 기다리는 자리다.** CLI
 * 프로바이더는 새 질의마다 프로세스를 띄워 3.6초 넘게 쓰고, API 호출은 그
 * 값이 없다. 그래서 이 계약만 API로 보낸다.
 */
class ContractRoutedAiClient implements AiClient {
  readonly #base: AiClient;
  readonly #routes: Partial<Record<string, AiClient>>;

  constructor(base: AiClient, routes: Partial<Record<string, AiClient>>) {
    this.#base = base;
    this.#routes = routes;
  }

  /**
   * 조각을 낼 수 있는가 — **지면 생성 기준으로** 답한다.
   *
   * 이 값을 묻는 자리가 거기 하나뿐이다. 계약마다 다른 답을 내야 할 날이 오면
   * 그때 이 자리를 계약별로 가른다.
   */
  get streams(): boolean {
    return (this.#routes["page_generation"] ?? this.#base).streams ?? false;
  }

  async complete<T>(
    spec: AiCallSpec,
    schema: z.ZodType<T>,
    options: AiCallOptions = {},
  ): Promise<AiResult<T>> {
    return (this.#routes[spec.contract] ?? this.#base).complete(spec, schema, options);
  }
}

function build(
  config: RuntimeConfig,
  provider: NonNullable<RuntimeConfig["aiProvider"]>,
): AiClient | null {
  if (provider === "off") return null;
  const fixtureDir = config.aiFixtureDir ?? "fixtures/ai";

  if (provider === "fixture") {
    return new FixtureAiClient(fixtureDir);
  }

  if (provider === "claude-code") {
    const client = new ClaudeCodeAiClient({
      ...(config.claudeCliPath ? { cliPath: config.claudeCliPath } : {}),
      ...(config.aiTimeoutMs ? { timeoutMs: config.aiTimeoutMs } : {}),
      ...(config.aiModelOverrides ? { models: config.aiModelOverrides } : {}),
    });
    // 개발 중 호출을 전부 남겨 두면 그게 곧 CI의 픽스처가 된다.
    return config.aiRecord ? new RecordingAiClient(client, fixtureDir) : client;
  }

  if (provider === "codex") {
    const client = new CodexAiClient({
      ...(config.codexCliPath ? { cliPath: config.codexCliPath } : {}),
      ...(config.codexHome ? { codexHome: config.codexHome } : {}),
      ...(config.aiTimeoutMs ? { timeoutMs: config.aiTimeoutMs } : {}),
      ...(config.aiModelOverrides ? { models: config.aiModelOverrides } : {}),
    });
    return config.aiRecord ? new RecordingAiClient(client, fixtureDir) : client;
  }

  // `anthropic` — 운영 경로. 서비스 키로 직접 API를 부른다(개인 CLI 로그인이
  // 아니다). 키가 없으면 여기서 바로 죽는다 — 키 없이 도는 척하면 이 provider를
  // 고른 이유(운영에 올리는 것) 자체가 조용히 무너진다.
  if (provider === "anthropic") {
    if (!config.anthropicApiKey) {
      throw new Error(
        "AI provider \"anthropic\" requires ANTHROPIC_API_KEY (console.anthropic.com에서 발급)",
      );
    }
    const client = new AnthropicAiClient({
      apiKey: config.anthropicApiKey,
      models: {
        // anthropic.ts는 tool_choice {type:"tool"}로 도구 호출을 강제한다.
        // Claude Haiku 5.5는 이걸 받고(그때 thinking을 건너뛰어 빠르다),
        // Claude Sonnet 5.5 · Opus 5.5는 400으로 거절한다. 그래서 sonnet·opus는
        // 이전 세대에 둔다 — 올리려면 먼저 tool_choice auto나
        // output_config.format으로 바꾼다.
        haiku: config.anthropicModelHaiku ?? "claude-haiku-5-5",
        sonnet: config.anthropicModelSonnet ?? "claude-sonnet-5",
        opus: config.anthropicModelOpus ?? "claude-opus-4-5",
      },
      ...(config.aiModelOverrides ? { modelOverrides: config.aiModelOverrides } : {}),
      ...(config.aiTimeoutMs ? { timeoutMs: config.aiTimeoutMs } : {}),
    });
    return config.aiRecord ? new RecordingAiClient(client, fixtureDir) : client;
  }

  provider satisfies never;
  throw new Error(`AI provider "${provider}" is not implemented yet`);
}
