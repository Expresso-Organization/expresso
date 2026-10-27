import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { AiError, type AiCallSpec, type AiClient, type AiUsage } from "./client.js";
import { MeteredAiClient } from "./metered.js";
import type { AiUsageEvent, AiUsageSink } from "./usage-sink.js";

const spec: AiCallSpec = { contract: "generation", system: "s", prompt: "p", promptVersion: 1 };
const usage: AiUsage = {
  model: "claude-sonnet-5",
  inputTokens: 8,
  outputTokens: 16_647,
  cacheReadTokens: 81_423,
  cacheCreationTokens: 136_562,
  costUsd: 1.2,
  durationMs: 900,
};

function inner(result: () => Promise<{ data: { ok: boolean }; usage: AiUsage }>): AiClient {
  return { streams: true, complete: vi.fn(result) as AiClient["complete"] };
}

function sink(record: (event: AiUsageEvent) => Promise<void> = async () => undefined) {
  const events: AiUsageEvent[] = [];
  const value: AiUsageSink = {
    record: async (event) => {
      events.push(event);
      await record(event);
    },
  };
  return { value, events };
}

describe("MeteredAiClient", () => {
  it("성공한 호출의 사용량을 호출한 사용자 몫으로 남긴다", async () => {
    const target = sink();
    const client = new MeteredAiClient(inner(async () => ({ data: { ok: true }, usage })), target.value);

    const result = await client.complete(spec, z.object({ ok: z.boolean() }), { userId: "u-1" });

    expect(result.data).toEqual({ ok: true });
    expect(target.events).toEqual([{ ...usage, userId: "u-1", contract: "generation" }]);
  });

  it("사용자가 없는 호출은 userId를 null로 남긴다", async () => {
    const target = sink();
    const client = new MeteredAiClient(inner(async () => ({ data: { ok: true }, usage })), target.value);

    await client.complete(spec, z.object({ ok: z.boolean() }));

    expect(target.events[0]?.userId).toBeNull();
  });

  it("실패한 호출은 남기지 않는다", async () => {
    const target = sink();
    const failure = new AiError("AI_INVALID_OUTPUT", "generation", "bad");
    const client = new MeteredAiClient(inner(async () => { throw failure; }), target.value);

    await expect(client.complete(spec, z.object({ ok: z.boolean() }), { userId: "u-1" })).rejects.toBe(failure);
    expect(target.events).toEqual([]);
  });

  it("기록이 실패해도 호출 결과는 그대로 돌아간다", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const target = sink(async () => { throw new Error("mongo down"); });
    const client = new MeteredAiClient(inner(async () => ({ data: { ok: true }, usage })), target.value);

    const result = await client.complete(spec, z.object({ ok: z.boolean() }), { userId: "u-1" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(result.data).toEqual({ ok: true });
    expect(error).toHaveBeenCalledWith(expect.stringContaining("ai.usage_record_failed"));
    error.mockRestore();
  });

  it("감싼 클라이언트의 streams와 호출 옵션을 그대로 넘긴다", async () => {
    const wrapped = inner(async () => ({ data: { ok: true }, usage }));
    const client = new MeteredAiClient(wrapped, sink().value);
    const onPartial = () => undefined;

    await client.complete(spec, z.object({ ok: z.boolean() }), { userId: "u-1", onPartial });

    expect(client.streams).toBe(true);
    expect(wrapped.complete).toHaveBeenCalledWith(spec, expect.anything(), { userId: "u-1", onPartial });
  });
});
