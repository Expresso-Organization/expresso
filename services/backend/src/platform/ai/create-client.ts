import type { z } from "zod";

import type { RuntimeConfig } from "../../config/runtime-config.js";
import type { AiCallOptions, AiCallSpec, AiClient, AiResult } from "./client.js";
import { ClaudeCodeAiClient } from "./claude-code.js";
import { CodexAiClient } from "./codex.js";
import { FixtureAiClient, RecordingAiClient } from "./fixture.js";

/**
 * 설정에서 AI 클라이언트를 만든다.
 *
 * `off`면 **null을 돌려준다** — 도메인은 그때 지금 쓰는 규칙 기반 구현을 그대로
 * 쓴다. 규칙 구현은 죽은 코드가 아니라 폴백이고, 그래서 키가 없어도 앱 전체가
 * 돈다. 테스트 122개가 오프라인으로 도는 이유이기도 하다.
 */
export function createAiClient(config: RuntimeConfig): AiClient | null {
  const base = build(config, config.aiProvider ?? "off");
  if (!base) return null;

  const forPage = config.aiPageGenerationProvider;
  if (!forPage || forPage === config.aiProvider) return base;
  const page = build(config, forPage);
  return page ? new ContractRoutedAiClient(base, { page_generation: page }) : base;
}

/**
 * 계약에 따라 다른 프로바이더로 보낸다.
 *
 * 하나 때문에 전부를 바꾸지 않으려고 있다. 지면 생성만 **부분 출력이 필요하고**
 * 그걸 낼 수 있는 프로바이더는 값이 더 든다 — 163건을 도는 본문 읽기까지 같이
 * 옮기면 그 값을 쓸 이유가 없는 자리에까지 낸다.
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

  // `anthropic`은 API 어댑터 자리다. 아직 없다 — 운영에 올리기 전에 채운다.
  throw new Error(`AI provider "${provider}" is not implemented yet`);
}
