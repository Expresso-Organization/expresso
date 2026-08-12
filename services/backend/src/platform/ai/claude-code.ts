import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { z } from "zod";

import {
  AiError,
  DEFAULT_MODEL_TIER,
  parseToolOutput,
  toToolSchema,
  type AiCallSpec,
  type AiClient,
  type AiResult,
} from "./client.js";

/**
 * 개발용 어댑터 — 이 머신에 로그인된 Claude Code로 호출한다.
 *
 * **운영에서 쓰지 않는다.** 로그인된 머신에서만 돌고, CI·컨테이너에서는 동작하지
 * 않는다. 포트의 모양은 API 어댑터가 정하고 이쪽이 거기에 맞춘다.
 *
 * 플래그는 실측해서 골랐다(haiku, 같은 프롬프트):
 *
 * | 조합 | 지연 | 비용 | 캐시 생성 |
 * |---|---|---|---|
 * | 기본 spawn | 9.8s | $0.064 | 28,796 |
 * | `--strict-mcp-config` + 빈 cwd | 3.6s | $0.020 | 7,936 |
 * | 위 + `--system-prompt`로 교체 | 4.7s | $0.046 | 21,609 |
 *
 * `--system-prompt`는 Claude Code의 기본 프롬프트를 갈아 끼워 **캐시를 깬다**.
 * 계약이 아홉이면 캐시 항목도 아홉이 된다. `--append-system-prompt`로 공용
 * 접두사를 공유하는 쪽이 싸다.
 *
 * `--bare`는 오버헤드를 더 줄이지만 OAuth를 읽지 않는다(API 키 전용)이라
 * 구독 경로에서는 쓸 수 없다.
 *
 * 프롬프트는 **argv가 아니라 stdin으로** 넘긴다. 공고 원문은 계약상 100만 자까지
 * 허용되는데(`SubmitJobPostingSchema`), argv 한 항목은 Linux에서 ~128KB,
 * Windows 명령줄 전체는 ~32KB에서 잘린다. `claude -p`에 위치 인자를 주지 않으면
 * 기본 `--input-format text`로 stdin을 읽는다.
 * (이 방식은 nexu-io/open-design의 런타임 어댑터에서 배웠다. Apache-2.0.)
 */

export interface ClaudeCodeOptions {
  /** `claude` 실행 파일. 기본은 PATH에서 찾는다. */
  cliPath?: string;
  timeoutMs?: number;
  /** 계약별 모델 별칭 덮어쓰기. */
  models?: Partial<Record<string, string>>;
}

const RESULT_SCHEMA = z.looseObject({
  type: z.literal("result"),
  subtype: z.string(),
  is_error: z.boolean(),
  duration_ms: z.number(),
  total_cost_usd: z.number().optional(),
  structured_output: z.unknown().optional(),
  result: z.string().optional(),
  usage: z
    .looseObject({
      input_tokens: z.number().optional(),
      output_tokens: z.number().optional(),
      cache_read_input_tokens: z.number().optional(),
      cache_creation_input_tokens: z.number().optional(),
    })
    .optional(),
  modelUsage: z.record(z.string(), z.unknown()).optional(),
});

const RATE_LIMIT_PATTERN = /rate.?limit|usage limit|quota|too many requests/i;

export class ClaudeCodeAiClient implements AiClient {
  readonly #cliPath: string;
  readonly #timeoutMs: number;
  readonly #models: Partial<Record<string, string>>;
  /**
   * CLAUDE.md 자동 탐색과 프로젝트 컨텍스트를 피하려고 빈 디렉터리에서 돈다.
   * 저장소 안에서 실행하면 프로젝트 문서가 통째로 프롬프트에 실린다.
   */
  readonly #cwd: string;

  constructor(options: ClaudeCodeOptions = {}) {
    this.#cliPath = options.cliPath ?? "claude";
    this.#timeoutMs = options.timeoutMs ?? 180_000;
    this.#models = options.models ?? {};
    this.#cwd = mkdtempSync(join(tmpdir(), "expresso-ai-"));
  }

  async complete<T>(spec: AiCallSpec, schema: z.ZodType<T>): Promise<AiResult<T>> {
    const model = this.#models[spec.contract]
      ?? spec.modelTier
      ?? DEFAULT_MODEL_TIER[spec.contract];
    const args = [
      // 프롬프트는 stdin으로 간다 — 위치 인자를 주지 않는다.
      "-p",
      "--model", model,
      "--output-format", "json",
      "--json-schema", JSON.stringify(toToolSchema(schema)),
      "--append-system-prompt", spec.system,
      // MCP 서버와 도구 정의가 프롬프트에 실리지 않게 한다.
      "--strict-mcp-config",
      "--mcp-config", '{"mcpServers":{}}',
      "--allowedTools", "",
    ];

    const started = Date.now();
    const { stdout, stderr, code } = await this.#run(args, spec, spec.prompt);
    const durationMs = Date.now() - started;

    if (code !== 0) {
      const message = stderr.trim() || `claude exited with ${code}`;
      throw new AiError(
        RATE_LIMIT_PATTERN.test(message) ? "AI_RATE_LIMITED" : "AI_UNAVAILABLE",
        spec.contract,
        message,
        { retryable: false },
      );
    }

    const parsed = this.#parseEnvelope(stdout, spec);
    if (parsed.is_error) {
      const message = parsed.result ?? "claude reported an error";
      throw new AiError(
        RATE_LIMIT_PATTERN.test(message) ? "AI_RATE_LIMITED" : "AI_UNAVAILABLE",
        spec.contract,
        message,
        { retryable: false },
      );
    }

    // `--json-schema`를 주면 구조화 결과가 여기 온다. 없으면 계약 위반이다.
    const validated = parseToolOutput(schema, parsed.structured_output);
    if (!validated.success) {
      throw new AiError(
        "AI_INVALID_OUTPUT",
        spec.contract,
        `structured output did not match the schema: ${validated.error.message}`,
        { retryable: true },
      );
    }

    const usage = parsed.usage ?? {};
    // 한 번의 호출에도 여러 모델이 찍힌다(보조 단계). 출력 토큰이 가장 많은
    // 것이 실제로 답을 쓴 모델이다 — 첫 키를 집으면 엉뚱한 이름이 남는다.
    const modelName = Object.entries(parsed.modelUsage ?? {})
      .map(([name, value]) => ({
        name,
        outputTokens: Number((value as { outputTokens?: number })?.outputTokens ?? 0),
      }))
      .sort((left, right) => right.outputTokens - left.outputTokens)[0]?.name
      ?? model;
    return {
      data: validated.data,
      usage: {
        model: modelName,
        inputTokens: usage.input_tokens ?? 0,
        outputTokens: usage.output_tokens ?? 0,
        cacheReadTokens: usage.cache_read_input_tokens ?? 0,
        cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
        costUsd: parsed.total_cost_usd ?? null,
        durationMs: parsed.duration_ms || durationMs,
      },
    };
  }

  #parseEnvelope(stdout: string, spec: AiCallSpec) {
    // 경고 줄이 앞에 붙을 수 있어 JSON으로 읽히는 마지막 줄을 쓴다.
    const lines = stdout.split("\n").map((line) => line.trim()).filter(Boolean);
    for (const line of lines.reverse()) {
      if (!line.startsWith("{")) continue;
      try {
        return RESULT_SCHEMA.parse(JSON.parse(line));
      } catch {
        continue;
      }
    }
    throw new AiError(
      "AI_INVALID_OUTPUT",
      spec.contract,
      "claude did not return a result envelope",
      { retryable: true },
    );
  }

  #run(args: string[], spec: AiCallSpec, prompt: string) {
    return new Promise<{ stdout: string; stderr: string; code: number }>((resolve, reject) => {
      const child = spawn(this.#cliPath, args, {
        cwd: this.#cwd,
        stdio: ["pipe", "pipe", "pipe"],
      });
      // 프롬프트를 흘려 넣고 바로 닫는다. 열어두면 CLI가 입력을 더 기다린다.
      child.stdin.on("error", () => undefined);
      child.stdin.end(prompt, "utf8");
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new AiError("AI_TIMEOUT", spec.contract, `${spec.contract} timed out`));
      }, this.#timeoutMs);

      child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
      child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(new AiError(
          "AI_UNAVAILABLE",
          spec.contract,
          `could not run ${this.#cliPath}`,
          { retryable: false, cause: error },
        ));
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ stdout, stderr, code: code ?? 1 });
      });
    });
  }
}
