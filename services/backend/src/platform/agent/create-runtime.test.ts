import { describe, expect, it } from "vitest";
import { loadRuntimeConfig } from "../../config/runtime-config.js";
import { createAgentRuntime } from "./create-runtime.js";
import { ClaudeAgentRuntime } from "./runtime.js";
import { CodexAgentRuntime } from "./codex-runtime.js";
import type { AiClient } from "../ai/client.js";
const unusedAi = { complete: async () => { throw new Error("not invoked"); } } satisfies AiClient;
describe("Agent provider selection", () => {
  it("keeps Anthropic as the default", () => {
    const config = loadRuntimeConfig({ AGENT_CHAT_ENABLED: "1" });
    expect(config.agentChatProvider).toBe("anthropic");
    expect(createAgentRuntime(config, null)).toBeInstanceOf(ClaudeAgentRuntime);
  });
  it("keeps disabled chat disabled", () => {
    expect(createAgentRuntime(loadRuntimeConfig({}), null)).toBeNull();
  });
  it("selects Codex explicitly in development", () => {
    const config = loadRuntimeConfig({ NODE_ENV: "development", AGENT_CHAT_ENABLED: "1", AGENT_CHAT_PROVIDER: "codex", AI_PROVIDER: "codex" });
    expect(createAgentRuntime(config, unusedAi)).toBeInstanceOf(CodexAgentRuntime);
  });
  it("rejects Codex chat in production", () => {
    expect(() => loadRuntimeConfig({ NODE_ENV: "production", AGENT_CHAT_PROVIDER: "codex" })).toThrow("development/test only");
  });
  it("does not silently select another provider", () => {
    expect(() => loadRuntimeConfig({ AGENT_CHAT_ENABLED: "1", AGENT_CHAT_PROVIDER: "codex", AI_PROVIDER: "anthropic" })).toThrow("AI_PROVIDER=codex");
  });
  it("fails on a missing Codex AI client", () => {
    const config = loadRuntimeConfig({ AGENT_CHAT_ENABLED: "1", AGENT_CHAT_PROVIDER: "codex", AI_PROVIDER: "codex" });
    expect(() => createAgentRuntime(config, null)).toThrow("requires");
  });
});
