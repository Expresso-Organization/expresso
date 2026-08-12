import { describe, expect, it } from "vitest";

import { loadRuntimeConfig } from "./runtime-config.js";

describe("loadRuntimeConfig", () => {
  it("provides bounded platform defaults", () => {
    const config = loadRuntimeConfig({});

    expect(config).toMatchObject({
      outboxPollIntervalMs: 1_000,
      outboxBatchSize: 25,
      outboxMaxAttempts: 5,
      queuePrefix: "expresso",
    });
  });

  it("rejects unsafe queue prefixes and outbox limits", () => {
    expect(() => loadRuntimeConfig({ QUEUE_PREFIX: "Bad Prefix" })).toThrow();
    expect(() => loadRuntimeConfig({ OUTBOX_BATCH_SIZE: "101" })).toThrow();
    expect(() => loadRuntimeConfig({ OUTBOX_MAX_ATTEMPTS: "0" })).toThrow();
  });

  it("Codex CLI 프로바이더와 실행 파일 경로를 읽는다", () => {
    expect(loadRuntimeConfig({
      AI_PROVIDER: "codex",
      CODEX_CLI_PATH: "/opt/bin/codex",
    })).toMatchObject({
      aiProvider: "codex",
      codexCliPath: "/opt/bin/codex",
    });
  });
});
