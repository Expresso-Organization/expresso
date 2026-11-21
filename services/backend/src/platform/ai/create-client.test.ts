import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { loadRuntimeConfig, type RuntimeConfig } from "../../config/runtime-config.js";
import { createAiClient, createPostingFactsAiClient } from "./create-client.js";
import { FixtureAiClient } from "./fixture.js";

afterEach(() => vi.restoreAllMocks());

describe("공고 요건 추출 전용 설정", () => {
  const config = (extra: Partial<RuntimeConfig> = {}) => ({ aiProvider: "fixture", ...extra }) as RuntimeConfig;

  it("전체 AI가 켜져도 명시하지 않은 요건 추출은 꺼진다", () => {
    expect(createAiClient(config())).not.toBeNull();
    expect(createPostingFactsAiClient(config())).toBeNull();
    expect(loadRuntimeConfig({ AI_PROVIDER: "fixture" }).aiPostingFactsProvider).toBe("off");
  });

  it("전체 AI와 독립적으로 켜고 끈다", () => {
    expect(createPostingFactsAiClient(config({ aiPostingFactsProvider: "off" }))).toBeNull();
    expect(createPostingFactsAiClient(config({ aiProvider: "off", aiPostingFactsProvider: "fixture" }))).not.toBeNull();
    expect(loadRuntimeConfig({ AI_PROVIDER_POSTING_FACTS: "fixture" }).aiPostingFactsProvider).toBe("fixture");
  });

  it("별도 클라이언트도 사용자·계약·사용량을 기존 싱크에 남긴다", async () => {
    const usage = { model: "fixture", inputTokens: 3, outputTokens: 2, cacheReadTokens: 1, cacheCreationTokens: 0, costUsd: null, durationMs: 1 };
    vi.spyOn(FixtureAiClient.prototype, "complete").mockResolvedValue({ data: { ok: true }, usage });
    const sink = { record: vi.fn().mockResolvedValue(undefined) };
    const client = createPostingFactsAiClient(config({ aiProvider: "off", aiPostingFactsProvider: "fixture" }), sink)!;
    await client.complete({ contract: "job_facts", system: "검증", prompt: "검증", promptVersion: 1 }, z.object({ ok: z.boolean() }), { userId: "owner" });
    expect(sink.record).toHaveBeenCalledWith({ ...usage, userId: "owner", contract: "job_facts" });
  });
});
