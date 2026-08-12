import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { ClaudeCodeAiClient } from "./claude-code.js";
import { FixtureAiClient, RecordingAiClient } from "./fixture.js";
import type { AiCallSpec } from "./client.js";

/**
 * 이 머신의 Claude Code로 실제 호출한다.
 *
 * 로그인된 머신에서만 돌고 쿼터를 쓴다. 그래서 기본으로는 건너뛰고
 * `AI_LIVE_TEST=1`일 때만 돈다 — CI는 이 파일을 통과시키지 않고, 픽스처를
 * 재생하는 `ai.test.ts`가 회귀를 잡는다.
 */
const live = process.env.AI_LIVE_TEST === "1";
const describeLive = live ? describe : describe.skip;

const ExtractionSchema = z.strictObject({
  technologies: z.array(z.string().min(1)),
  summary: z.string().min(1).max(200),
});

const spec: AiCallSpec = {
  contract: "job_analysis",
  system:
    "너는 채용 공고에서 구조화된 정보를 뽑는 추출기다. "
    + "공고에 적히지 않은 것은 만들지 않는다.",
  prompt:
    "다음 공고에서 기술 스택을 뽑고 한 줄로 요약해라.\n\n"
    + "공고: Airflow와 Spark로 하루 3,000만 건을 적재하는 데이터 엔지니어를 찾습니다. "
    + "Kafka 경험 우대.",
  promptVersion: 1,
  // 이음매만 확인하는 테스트라 가장 싼 티어로 부른다.
  modelTier: "haiku",
};

const directories: string[] = [];
afterAll(() => {
  for (const path of directories) rmSync(path, { recursive: true, force: true });
});

describeLive("Claude Code 어댑터", () => {
  it("스키마를 강제하고 사용량까지 돌려준다", async () => {
    const client = new ClaudeCodeAiClient({ timeoutMs: 120_000 });
    const result = await client.complete(spec, ExtractionSchema);

    // 스키마를 통과했다는 것 자체가 계약의 절반이다 (§8.3: 자유 문장은 무효).
    expect(result.data.technologies).toEqual(
      expect.arrayContaining(["Airflow", "Spark"]),
    );
    expect(result.data.summary.length).toBeGreaterThan(0);

    // 원장을 채울 수 있어야 개발 중에 무엇이 쿼터를 먹는지 볼 수 있다.
    expect(result.usage.model).toContain("haiku");
    expect(result.usage.outputTokens).toBeGreaterThan(0);
    expect(result.usage.durationMs).toBeGreaterThan(0);
  }, 180_000);

  it("한 번 부른 호출은 픽스처로 남아 네트워크 없이 재생된다", async () => {
    const directory = mkdtempSync(join(tmpdir(), "expresso-ai-live-"));
    directories.push(directory);
    const recorded = await new RecordingAiClient(
      new ClaudeCodeAiClient({ timeoutMs: 120_000 }),
      directory,
    ).complete(spec, ExtractionSchema);

    const replayed = await new FixtureAiClient(directory).complete(spec, ExtractionSchema);
    expect(replayed.data).toEqual(recorded.data);
  }, 180_000);

  it("긴 공고 원문도 넘어간다 — 프롬프트는 argv가 아니라 stdin으로 간다", async () => {
    // 공고 원문은 계약상 100만 자까지다. argv 한 항목은 그 전에 잘린다.
    const long = `${spec.prompt}\n\n${"부가 설명 문장입니다. ".repeat(6_000)}`;
    const client = new ClaudeCodeAiClient({ timeoutMs: 120_000 });
    const result = await client.complete(
      { ...spec, prompt: long, promptVersion: 2 },
      ExtractionSchema,
    );
    // argv 한계는 글자가 아니라 바이트다. 한글은 UTF-8로 3바이트다.
    expect(Buffer.byteLength(long, "utf8")).toBeGreaterThan(128 * 1024);
    expect(result.data.technologies.length).toBeGreaterThan(0);
  }, 180_000);

  it("실행 파일이 없으면 재시도하지 않고 바로 실패한다", async () => {
    const client = new ClaudeCodeAiClient({ cliPath: "claude-does-not-exist" });
    await expect(client.complete(spec, ExtractionSchema)).rejects.toMatchObject({
      code: "AI_UNAVAILABLE",
      retryable: false,
    });
  });
});
