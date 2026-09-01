import { describe, expect, it } from "vitest";

import { loadRuntimeConfig } from "./runtime-config.js";

describe("loadRuntimeConfig", () => {
  it("provides bounded platform defaults", () => {
    const config = loadRuntimeConfig({});

    expect(config).toMatchObject({
      mongodbDatabase: "expresso",
      outboxPollIntervalMs: 1_000,
      outboxBatchSize: 25,
      outboxMaxAttempts: 5,
      queuePrefix: "expresso-mongo-v1",
      careerSocketAllowedOrigin: "http://127.0.0.1:3000",
      careerEditorV2Enabled: false,
      scheduledJobsEnabled: true,
    });
  });

  it("keeps the editor v2 gate closed unless an explicit boolean enables it", () => {
    expect(loadRuntimeConfig({ CAREER_EDITOR_V2_ENABLED: "true" }).careerEditorV2Enabled).toBe(true);
    expect(() => loadRuntimeConfig({ CAREER_EDITOR_V2_ENABLED: "enable-it" })).toThrow();
  });

  it("allows deterministic AI only outside production", () => {
    expect(loadRuntimeConfig({ CAREER_AI_DETERMINISTIC_TEST: "true" }).careerAiDeterministicTest).toBe(true);
    expect(() => loadRuntimeConfig({ NODE_ENV: "production", CAREER_AI_DETERMINISTIC_TEST: "true" })).toThrow(/forbidden/);
  });

  it("allows isolated workers to skip creating scheduled external jobs", () => {
    expect(loadRuntimeConfig({ SCHEDULED_JOBS_ENABLED: "false" }).scheduledJobsEnabled).toBe(false);
  });

  it("reads the allowed career socket origin", () => {
    expect(loadRuntimeConfig({ CAREER_SOCKET_ALLOWED_ORIGIN: "https://app.example.com" }).careerSocketAllowedOrigin)
      .toBe("https://app.example.com");
  });

  it("rejects non-MongoDB database schemes", () => {
    expect(() => loadRuntimeConfig({ MONGODB_URL: "mysql://localhost/expresso" })).toThrow(/mongodb/i);
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
