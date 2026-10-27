import { APIError } from "@anthropic-ai/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { AnthropicAiClient } from "./anthropic.js";
import { AiError, type AiCallSpec } from "./client.js";

// SDK의 HTTP 호출만 바꾼다 — 오류 클래스는 진짜를 써야 instanceof가 맞는다.
const create = vi.fn();
vi.mock("@anthropic-ai/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@anthropic-ai/sdk")>();
  class FakeAnthropic {
    messages = { create };
  }
  return { ...actual, default: FakeAnthropic };
});

const Schema = z.strictObject({ role: z.string(), region: z.string() });

const spec: AiCallSpec = {
  contract: "search_interpret",
  system: "너는 검색어를 조건으로 바꾸는 해석기다.",
  prompt: "서울 백엔드 신입",
  promptVersion: 1,
};

function client(overrides: Partial<Record<string, string>> = {}) {
  return new AnthropicAiClient({
    apiKey: "sk-ant-test",
    models: { haiku: "claude-haiku-5-5", sonnet: "claude-sonnet-5", opus: "claude-opus-4-5" },
    modelOverrides: overrides,
  });
}

function toolMessage(input: unknown, stop_reason = "tool_use") {
  return {
    model: "claude-haiku-5-5",
    stop_reason,
    content: [{ type: "tool_use", id: "toolu_1", name: "structured_output", input }],
    usage: { input_tokens: 812, output_tokens: 64, cache_read_input_tokens: null, cache_creation_input_tokens: null },
  };
}

describe("Anthropic API 어댑터", () => {
  beforeEach(() => {
    create.mockReset();
  });

  it("도구 호출 하나를 강제하고 그 입력을 계약 스키마로 검증해 돌려준다", async () => {
    create.mockResolvedValue(toolMessage({ role: "백엔드", region: "서울" }));

    const result = await client().complete(spec, Schema);

    expect(result.data).toEqual({ role: "백엔드", region: "서울" });
    expect(result.usage).toMatchObject({
      model: "claude-haiku-5-5", inputTokens: 812, outputTokens: 64,
      cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: null,
    });
    const request = create.mock.calls[0]?.[0];
    // search_interpret의 기본 티어는 haiku다.
    expect(request).toMatchObject({
      model: "claude-haiku-5-5",
      system: spec.system,
      messages: [{ role: "user", content: spec.prompt }],
      tool_choice: { type: "tool", name: "structured_output" },
    });
    // 샘플링 파라미터는 보내지 않는다 — 최신 모델은 400으로 거절한다.
    expect(request).not.toHaveProperty("temperature");
    expect(request).not.toHaveProperty("top_p");
    expect(request).not.toHaveProperty("top_k");
  });

  it("계약별 덮어쓰기는 티어 별칭으로 모델을 고른다", async () => {
    create.mockResolvedValue(toolMessage({ role: "백엔드", region: "서울" }));

    await client({ search_interpret: "sonnet" }).complete(spec, Schema);

    expect(create.mock.calls[0]?.[0]).toMatchObject({ model: "claude-sonnet-5" });
  });

  it("스키마와 어긋난 출력은 다시 시도할 수 있는 실패다", async () => {
    create.mockResolvedValue(toolMessage({ role: 3 }));

    const error = await client().complete(spec, Schema).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AiError);
    expect(error).toMatchObject({ code: "AI_INVALID_OUTPUT", retryable: true });
  });

  it("max_tokens에서 잘린 출력은 쓰지 않는다", async () => {
    create.mockResolvedValue(toolMessage({ role: "백엔드", region: "서울" }, "max_tokens"));

    await expect(client().complete(spec, Schema)).rejects.toMatchObject({ code: "AI_INVALID_OUTPUT" });
  });

  it("도구를 부르지 않은 응답은 실패다", async () => {
    create.mockResolvedValue({ ...toolMessage(null), content: [{ type: "text", text: "서울 백엔드" }] });

    await expect(client().complete(spec, Schema)).rejects.toMatchObject({ code: "AI_INVALID_OUTPUT" });
  });

  it("429는 레이트 리밋으로 옮긴다", async () => {
    create.mockRejectedValue(APIError.generate(429, { error: { type: "rate_limit_error" } }, "rate limited", new Headers()));

    await expect(client().complete(spec, Schema)).rejects.toMatchObject({ code: "AI_RATE_LIMITED", retryable: false });
  });
});
