import { describe, expect, it } from "vitest";

import type { RuntimeConfig } from "../../config/runtime-config.js";
import { createAiClient, createPostingFactsAiClient } from "./create-client.js";

const base = {
  nodeEnv: "test", host: "127.0.0.1", port: 0, logLevel: "silent",
  redisUrl: "redis://127.0.0.1:1", outboxPollIntervalMs: 1_000,
  outboxBatchSize: 25, outboxMaxAttempts: 5, queuePrefix: "test",
} as unknown as RuntimeConfig;

describe("요건 읽기 담당 잠그기", () => {
  it("비어 있으면 꺼진 것이다 — AI_PROVIDER 를 따라가지 않는다", () => {
    // 조용히 켜지는 편보다 조용히 꺼져 있는 편이 낫다. 이 읽기는 사람이
    // 누르는 자리가 아니라 10분마다 알아서 도는 자리다.
    const config = { ...base, aiProvider: "fixture" } as RuntimeConfig;
    expect(createAiClient(config)).not.toBeNull();
    expect(createPostingFactsAiClient(config)).toBeNull();
  });

  it("`off` 를 적어도 꺼진다", () => {
    const config = { ...base, aiProvider: "fixture", aiPostingFactsProvider: "off" } as RuntimeConfig;
    expect(createPostingFactsAiClient(config)).toBeNull();
  });

  it("프로바이더를 적으면 켜진다", () => {
    const config = { ...base, aiProvider: "off", aiPostingFactsProvider: "fixture" } as RuntimeConfig;
    // 전체가 꺼져 있어도 이 자리만 켤 수 있다 — 둘은 따로 잠긴다.
    expect(createAiClient(config)).toBeNull();
    expect(createPostingFactsAiClient(config)).not.toBeNull();
  });
});
