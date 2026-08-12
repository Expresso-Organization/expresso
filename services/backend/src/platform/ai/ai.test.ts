import { mkdtempSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { loadRuntimeConfig } from "../../config/runtime-config.js";
import {
  AiError,
  callKey,
  toToolSchema,
  DEFAULT_MODEL_TIER,
  type AiCallSpec,
  type AiClient,
  type AiResult,
} from "./client.js";
import { createAiClient } from "./create-client.js";
import { CodexAiClient } from "./codex.js";
import { FixtureAiClient, RecordingAiClient, type FixtureRecord } from "./fixture.js";

const OutputSchema = z.strictObject({
  technologies: z.array(z.string()),
  summary: z.string().min(1),
});

const spec: AiCallSpec = {
  contract: "job_analysis",
  system: "너는 공고에서 구조화된 정보를 뽑는 추출기다.",
  prompt: "Airflow와 Spark로 적재하는 데이터 엔지니어를 찾습니다.",
  promptVersion: 1,
};

const usage = {
  model: "claude-haiku-4-5-20251001",
  inputTokens: 10,
  outputTokens: 286,
  cacheReadTokens: 20_327,
  cacheCreationTokens: 7_936,
  costUsd: 0.02007,
  durationMs: 3_583,
};

class StubAiClient implements AiClient {
  calls = 0;
  async complete<T>(_spec: AiCallSpec, schema: z.ZodType<T>): Promise<AiResult<T>> {
    this.calls += 1;
    return {
      data: schema.parse({ technologies: ["Airflow", "Spark"], summary: "데이터 엔지니어" }),
      usage,
    };
  }
}

const directories: string[] = [];
function scratch(): string {
  const path = mkdtempSync(join(tmpdir(), "expresso-ai-test-"));
  directories.push(path);
  return path;
}

afterAll(() => {
  for (const path of directories) rmSync(path, { recursive: true, force: true });
});

describe("AI 호출 포트", () => {
  it("녹화한 호출을 그대로 재생한다", async () => {
    const directory = scratch();
    const stub = new StubAiClient();
    const recorded = await new RecordingAiClient(stub, directory).complete(spec, OutputSchema);
    expect(recorded.data.technologies).toEqual(["Airflow", "Spark"]);

    const replayed = await new FixtureAiClient(directory).complete(spec, OutputSchema);
    expect(replayed).toEqual(recorded);
    // 재생은 안쪽 클라이언트를 부르지 않는다 — 네트워크도 쿼터도 쓰지 않는다.
    expect(stub.calls).toBe(1);
  });

  it("녹화 파일에 프롬프트와 사용량을 함께 남긴다", async () => {
    const directory = scratch();
    await new RecordingAiClient(new StubAiClient(), directory).complete(spec, OutputSchema);
    const path = join(directory, "job_analysis", `${callKey(spec, OutputSchema)}.json`);
    const record = JSON.parse(await readFile(path, "utf8")) as FixtureRecord;

    expect(record.contract).toBe("job_analysis");
    expect(record.promptVersion).toBe(1);
    expect(record.prompt).toBe(spec.prompt);
    expect(record.usage.costUsd).toBe(0.02007);
  });

  it("프롬프트나 버전이 바뀌면 다른 녹화를 본다", async () => {
    const directory = scratch();
    await new RecordingAiClient(new StubAiClient(), directory).complete(spec, OutputSchema);
    const fixtures = new FixtureAiClient(directory);

    await expect(fixtures.complete({ ...spec, promptVersion: 2 }, OutputSchema))
      .rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
    await expect(fixtures.complete({ ...spec, prompt: "다른 공고" }, OutputSchema))
      .rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
  });

  it("녹화가 계약과 어긋나면 재생하지 않는다", async () => {
    const directory = scratch();
    await new RecordingAiClient(new StubAiClient(), directory).complete(spec, OutputSchema);
    // 계약이 넓어졌다 — 낡은 녹화가 조용히 통과하면 안 된다.
    const Widened = OutputSchema.extend({ seniority: z.string() });

    await expect(new FixtureAiClient(directory).complete(spec, Widened))
      .rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
  });

  it("레이트 리밋은 큐가 지금 다시 시도할 수 없는 실패다", () => {
    // 몇 초 뒤에 다시 때리면 남은 쿼터만 태운다.
    expect(new AiError("AI_RATE_LIMITED", "job_analysis", "usage limit", { retryable: false }).retryable)
      .toBe(false);
    expect(new AiError("AI_TIMEOUT", "job_analysis", "timed out").retryable).toBe(true);
  });

  it("계약마다 모델 티어가 다르다 — 오래 쓰는 것은 비싸게, 기다리는 것은 빠르게", () => {
    expect(DEFAULT_MODEL_TIER.job_analysis).toBe("opus");
    expect(DEFAULT_MODEL_TIER.recipe_draft).toBe("opus");
    expect(DEFAULT_MODEL_TIER.search_interpret).toBe("haiku");
    expect(DEFAULT_MODEL_TIER.insight_note).toBe("haiku");
  });
});

describe("AI 클라이언트 만들기", () => {
  it("설정이 없으면 AI는 꺼져 있다", () => {
    // 키도 로그인도 없이 앱 전체가 돌아야 한다. 그때는 규칙 기반 구현이 쓰인다.
    expect(createAiClient(loadRuntimeConfig({}))).toBeNull();
  });

  it("픽스처 프로바이더는 녹화 디렉터리를 읽는다", () => {
    const client = createAiClient(
      loadRuntimeConfig({ AI_PROVIDER: "fixture", AI_FIXTURE_DIR: scratch() }),
    );
    expect(client).toBeInstanceOf(FixtureAiClient);
  });

  it("녹화를 켜면 claude-code 호출이 픽스처로 쌓인다", () => {
    const client = createAiClient(
      loadRuntimeConfig({
        AI_PROVIDER: "claude-code",
        AI_RECORD: "true",
        AI_FIXTURE_DIR: scratch(),
      }),
    );
    expect(client).toBeInstanceOf(RecordingAiClient);
  });

  it("codex 프로바이더는 로그인된 Codex CLI 어댑터를 만든다", () => {
    const client = createAiClient(loadRuntimeConfig({ AI_PROVIDER: "codex" }));
    expect(client).toBeInstanceOf(CodexAiClient);
  });

  it("아직 없는 프로바이더는 조용히 넘어가지 않는다", () => {
    expect(() => createAiClient(loadRuntimeConfig({ AI_PROVIDER: "anthropic" })))
      .toThrow(/not implemented/);
  });
});

describe("toToolSchema", () => {
  it("떼어낸다 — 모르는 format 하나가 계약 전체를 400으로 막는다", () => {
    const schema = z.object({
      blocks: z.array(z.object({ href: z.url(), at: z.iso.datetime() })),
    });

    const json = JSON.stringify(toToolSchema(schema));

    expect(json).not.toContain('"format"');
    expect(json).toContain('"href"');
  });
});
