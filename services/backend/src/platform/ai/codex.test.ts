import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";

import type { AiCallSpec } from "./client.js";
import { CodexAiClient, DEFAULT_CODEX_MODEL } from "./codex.js";

const spec: AiCallSpec = {
  contract: "job_analysis",
  system: "공고에 없는 정보는 만들지 않는다.",
  prompt: "Airflow와 Spark 경험을 추출해라.",
  promptVersion: 1,
  modelTier: "haiku",
};

const OutputSchema = z.strictObject({
  technologies: z.array(z.string()),
  summary: z.string(),
  debugArgs: z.array(z.string()),
  debugPrompt: z.string(),
});

const directories: string[] = [];
function fakeCodex(source: string): string {
  const directory = mkdtempSync(join(tmpdir(), "expresso-fake-codex-"));
  directories.push(directory);
  const path = join(directory, "codex");
  writeFileSync(path, `#!/usr/bin/env node\n${source}\n`, "utf8");
  chmodSync(path, 0o755);
  return path;
}

afterAll(() => {
  for (const path of directories) rmSync(path, { recursive: true, force: true });
});

describe("Codex CLI 어댑터", () => {
  it("도구를 끈 격리 실행에서 스키마 응답과 사용량을 읽는다", async () => {
    const executable = fakeCodex(String.raw`
let prompt = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { prompt += chunk; });
process.stdin.on("end", () => {
  const text = JSON.stringify({
    technologies: ["Airflow", "Spark"],
    summary: "데이터 엔지니어",
    debugArgs: process.argv.slice(2),
    debugPrompt: prompt,
  });
  console.log(JSON.stringify({ type: "thread.started", thread_id: "test" }));
  console.log(JSON.stringify({
    type: "item.completed",
    item: { id: "answer", type: "agent_message", text },
  }));
  console.log(JSON.stringify({
    type: "turn.completed",
    usage: { input_tokens: 120, cached_input_tokens: 40, output_tokens: 30 },
  }));
});`);
    const client = new CodexAiClient({
      cliPath: executable,
      models: { job_analysis: "gpt-test" },
    });

    const result = await client.complete(spec, OutputSchema);

    expect(result.data.technologies).toEqual(["Airflow", "Spark"]);
    expect(result.data.debugArgs).toEqual(expect.arrayContaining([
      "exec",
      "--ignore-user-config",
      "--ignore-rules",
      "shell_tool",
      "multi_agent",
      "gpt-test",
      "--output-schema",
      "--json",
      "-",
    ]));
    expect(result.data.debugPrompt).toContain(spec.system);
    expect(result.data.debugPrompt).toContain(spec.prompt);
    expect(result.usage).toMatchObject({
      model: "gpt-test",
      inputTokens: 120,
      outputTokens: 30,
      cacheReadTokens: 40,
      cacheCreationTokens: 0,
      costUsd: null,
    });
  });

  it("기존 모델 티어를 Codex 모델군에 대응한다", () => {
    expect(DEFAULT_CODEX_MODEL).toEqual({
      haiku: "gpt-5.6-luna",
      sonnet: "gpt-5.6-terra",
      opus: "gpt-5.6-sol",
    });
  });

  it("스키마에 맞지 않는 최종 메시지는 재시도 가능한 실패다", async () => {
    const executable = fakeCodex(`
process.stdin.resume();
process.stdin.on("end", () => {
  console.log(JSON.stringify({
    type: "item.completed",
    item: { type: "agent_message", text: JSON.stringify({ summary: "누락" }) },
  }));
});`);
    const client = new CodexAiClient({ cliPath: executable });

    await expect(client.complete(spec, OutputSchema)).rejects.toMatchObject({
      code: "AI_INVALID_OUTPUT",
      retryable: true,
    });
  });

  it("레이트 리밋과 실행 파일 부재를 구분한다", async () => {
    const limited = fakeCodex(`
process.stderr.write("usage limit reached\\n");
process.exit(1);`);
    await expect(new CodexAiClient({ cliPath: limited }).complete(spec, OutputSchema))
      .rejects.toMatchObject({ code: "AI_RATE_LIMITED", retryable: false });

    await expect(new CodexAiClient({ cliPath: "codex-does-not-exist" }).complete(spec, OutputSchema))
      .rejects.toMatchObject({ code: "AI_UNAVAILABLE", retryable: false });
  });

  it("응답이 멎으면 프로세스를 종료하고 재시도 가능한 타임아웃을 낸다", async () => {
    const hanging = fakeCodex("process.stdin.resume(); setInterval(() => undefined, 1_000);");
    await expect(new CodexAiClient({ cliPath: hanging, timeoutMs: 30 }).complete(spec, OutputSchema))
      .rejects.toMatchObject({ code: "AI_TIMEOUT", retryable: true });
  });
});
