import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { z } from "zod";

import {
  AiError,
  DEFAULT_EFFORT,
  DEFAULT_MODEL_TIER,
  parseToolOutput,
  logAiFailure,
  toToolSchema,
  type AiCallOptions,
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
 * **`--effort low`는 쓰지 않는다.** 첫 조각까지의 침묵을 45.5초 → 3.4초로 접고
 * 값도 싸지지만, 실제 지면으로 재니 모델이 **지면을 쓰는 대신 없는 파일을
 * 가리켰다**(2026-08-14, sonnet):
 *
 *     html = "(see file portfolio.html content above — passed inline below)"
 *
 * 61자짜리 지면이 QA 일곱 개를 전부 통과했다. 침묵은 모델이 생각하는 시간이고,
 * 그 시간을 깎으면 깎은 만큼 지면이 사라진다. 조용한 구간은 줄이는 것이 아니라
 * **보여 주는 것**이 답이다(`onThinking`).
 *
 * 시스템 프롬프트를 `--system-prompt`로 갈아 끼우는 것도 느리다 — 같은 실측에서
 * 첫 조각 45.5초 → 78.5초였다. 붙이는 쪽(`--append-system-prompt`)이 맞다.
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

  /** 이 CLI는 구조화 출력을 조각으로 흘려준다. `#partialSink`가 그걸 읽는다. */
  readonly streams = true;

  async complete<T>(
    spec: AiCallSpec,
    schema: z.ZodType<T>,
    options: AiCallOptions = {},
  ): Promise<AiResult<T>> {
    const model = this.#models[spec.contract]
      ?? spec.modelTier
      ?? DEFAULT_MODEL_TIER[spec.contract];
    const effort = spec.effort ?? DEFAULT_EFFORT[spec.contract];
    const args = [
      // 프롬프트는 stdin으로 간다 — 위치 인자를 주지 않는다.
      "-p",
      "--model", model,
      /*
       * `stream-json`은 부분 출력을 받을 때만 필요하지만 **항상 쓴다.**
       *
       * 최종 `result` 봉투는 두 형식이 같고(`#parseEnvelope`가 뒤에서부터
       * 찾는다), 형식을 갈라 두면 스트리밍 경로만 다른 버그를 갖게 된다.
       * 대신 값이 드는 `--include-partial-messages`는 받을 사람이 있을 때만 켠다.
       */
      "--output-format", "stream-json",
      "--verbose",
      ...(options.onPartial || options.onThinking ? ["--include-partial-messages"] : []),
      "--json-schema", JSON.stringify(toToolSchema(schema)),
      "--append-system-prompt", spec.system,
      // MCP 서버와 도구 정의가 프롬프트에 실리지 않게 한다.
      "--strict-mcp-config",
      "--mcp-config", '{"mcpServers":{}}',
      "--allowedTools", "",
      // 재 본 계약만 사고량을 정한다. 나머지는 CLI 기본값이다(`DEFAULT_EFFORT`).
      ...(effort ? ["--effort", effort] : []),
    ];

    const started = Date.now();
    const { stdout, stderr, code } = await this.#run(
      args, spec, spec.prompt,
      options.onPartial || options.onThinking ? partialSink(options) : null,
    );
    const durationMs = Date.now() - started;

    if (code !== 0) {
      const message = stderr.trim() || `claude exited with ${code}`;
      const failureCode = RATE_LIMIT_PATTERN.test(message) ? "AI_RATE_LIMITED" : "AI_UNAVAILABLE";
      logAiFailure({ contract: spec.contract, model, code: failureCode, detail: message });
      throw new AiError(
        failureCode,
        spec.contract,
        message,
        { retryable: false },
      );
    }

    const parsed = this.#parseEnvelope(stdout, spec);
    if (parsed.is_error) {
      const message = parsed.result ?? "claude reported an error";
      logAiFailure({
        contract: spec.contract, model,
        code: RATE_LIMIT_PATTERN.test(message) ? "AI_RATE_LIMITED" : "AI_UNAVAILABLE",
        detail: message,
      });
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

  #run(
    args: string[],
    spec: AiCallSpec,
    prompt: string,
    /** 한 줄씩 보고 싶은 사람. 없으면 예전처럼 다 모아서 끝에 판다. */
    onLine: ((line: string) => void) | null,
  ) {
    return new Promise<{ stdout: string; stderr: string; code: number }>((resolve, reject) => {
      const child = spawn(this.#cliPath, args, {
        cwd: this.#cwd,
        stdio: ["pipe", "pipe", "pipe"],
        /*
         * CLI가 있는 디렉터리를 PATH 앞에 붙인다. 지금 서버의 claude는 단독
         * 바이너리라 없어도 돌지만, npm으로 깔면 `#!/usr/bin/env node` 셔임이
         * 되고 systemd의 PATH에는 nvm node가 없다 — codex가 그렇게 깨졌다.
         */
        env: (() => {
          const binDir = dirname(this.#cliPath);
          const path = process.env["PATH"] ?? "";
          return {
            ...process.env,
            PATH: path.split(":").includes(binDir) ? path : `${binDir}:${path}`,
          };
        })(),
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

      /*
       * 줄 경계는 우리가 잡는다. `data` 하나가 JSONL 한 줄이라는 보장이 없다 —
       * 지면 하나의 델타는 수십 KB라 청크 한가운데서 끊긴다.
       */
      let pending = "";
      child.stdout.on("data", (chunk: Buffer) => {
        const text = chunk.toString("utf8");
        stdout += text;
        if (!onLine) return;
        pending += text;
        const lines = pending.split("\n");
        pending = lines.pop() ?? "";
        for (const line of lines) if (line.trim()) onLine(line);
      });
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

/**
 * 구조화 출력이 오는 도구 블록의 이름.
 *
 * `--json-schema`를 주면 CLI가 이 이름의 도구를 하나 물려 주고, 모델이 그
 * 도구를 부르는 것이 곧 최종 응답이다. **이름은 CLI 쪽 사정이라 바뀔 수 있다** —
 * 그래서 못 찾으면 조각을 안 보낼 뿐, 호출 자체는 그대로 성공한다.
 */
const STRUCTURED_OUTPUT_TOOL = "StructuredOutput";

/**
 * 생각이 얼마나 쌓였는가.
 *
 * **내용은 안 온다.** 2026-08-14 실측(sonnet): `thinking_delta` 35개가 전부
 * `thinking: ""`였고, 분량만 이 이벤트로 따로 왔다. haiku에서는 글이 실려
 * 왔으니 모델에 따라 갈린다 — 어느 쪽이든 **일어나고 있다는 사실**은 여기서
 * 알 수 있고, 화면이 필요한 것도 그것뿐이다.
 */
const THINKING_TOKENS_SCHEMA = z.looseObject({
  type: z.literal("system"),
  subtype: z.literal("thinking_tokens"),
  estimated_tokens: z.number(),
});

const STREAM_EVENT_SCHEMA = z.looseObject({
  type: z.literal("stream_event"),
  event: z.looseObject({
    type: z.string(),
    index: z.number().optional(),
    content_block: z.looseObject({
      type: z.string(),
      name: z.string().optional(),
    }).optional(),
    delta: z.looseObject({
      type: z.string(),
      partial_json: z.string().optional(),
    }).optional(),
  }),
});

/**
 * JSONL 한 줄에서 **구조화 출력 조각만** 골라낸다.
 *
 * 한 번의 호출에도 블록은 여럿 열린다 — 생각(`thinking`), 하려다 거절당한 도구
 * (`Write` · `Artifact`), 그리고 마지막의 `StructuredOutput`. `index`는 메시지마다
 * 0부터 다시 매겨지므로 **번호만 보면 남의 조각을 섞어 담는다.** 블록이 열릴 때
 * 이름을 보고 자리를 잡고, 닫히면 놓는다.
 *
 * 같은 이름의 블록이 두 번 열리면 **그 자리에서 멈춘다.** 이미 보낸 조각을
 * 되돌릴 수 없으니 이어 붙이면 앞뒤가 다른 JSON이 되고, 받는 쪽은 그걸
 * 알아볼 방법이 없다. 멈추면 화면은 마지막 성한 데까지만 그린 채 결과를
 * 기다린다 — 최종 응답은 봉투에서 따로 읽으므로 영향이 없다.
 */
export function partialSink(options: AiCallOptions): (line: string) => void {
  let activeIndex: number | null = null;
  let seen = false;
  let frozen = false;

  return (line) => {
    if (!line.startsWith("{")) return;
    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch {
      return;
    }

    const thinking = THINKING_TOKENS_SCHEMA.safeParse(json);
    if (thinking.success) {
      options.onThinking?.(thinking.data.estimated_tokens);
      return;
    }

    const parsed = STREAM_EVENT_SCHEMA.safeParse(json);
    if (!parsed.success) return;
    const event = parsed.data.event;

    if (event.type === "content_block_start") {
      const block = event.content_block;
      if (block?.type !== "tool_use" || block.name !== STRUCTURED_OUTPUT_TOOL) return;
      if (seen) {
        frozen = true;
        console.error(JSON.stringify({
          level: "warn",
          event: "ai.partial_restarted",
          detail: `${STRUCTURED_OUTPUT_TOOL} block opened twice — partial output stopped`,
        }));
        return;
      }
      activeIndex = event.index ?? null;
      seen = true;
      return;
    }

    if (event.type === "content_block_delta") {
      if (frozen || event.index !== activeIndex || activeIndex === null) return;
      if (event.delta?.type !== "input_json_delta") return;
      const text = event.delta.partial_json;
      if (text) options.onPartial?.(text);
      return;
    }

    if (event.type === "content_block_stop" && event.index === activeIndex) activeIndex = null;
  };
}
