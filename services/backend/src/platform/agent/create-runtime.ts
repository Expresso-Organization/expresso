import type { RuntimeConfig } from "../../config/runtime-config.js";
import type { AiClient } from "../ai/client.js";
import type { AiUsageSink } from "../ai/usage-sink.js";
import { ClaudeAgentRuntime, type AgentRuntime } from "./runtime.js";
import { CodexAgentRuntime } from "./codex-runtime.js";

export function createAgentRuntime(
  config: RuntimeConfig,
  ai: AiClient | null,
  usage?: AiUsageSink,
): AgentRuntime | null {
  if ((config.agentChatProvider ?? "anthropic") === "codex") {
    if (config.nodeEnv === "production") {
      throw new Error("Codex agent runtime is development/test only");
    }
    if (!config.agentChatEnabled) return null;
    if (config.aiProvider !== "codex" || !ai) {
      throw new Error("Codex agent runtime requires AI_PROVIDER=codex and an AI client");
    }
    return new CodexAgentRuntime(ai);
  }
  return config.agentChatEnabled
    ? new ClaudeAgentRuntime(config.agentChatModel, usage)
    : null;
}
