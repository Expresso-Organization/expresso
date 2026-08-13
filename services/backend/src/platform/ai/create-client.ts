import type { RuntimeConfig } from "../../config/runtime-config.js";
import type { AiClient } from "./client.js";
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
  const provider = config.aiProvider ?? "off";
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
