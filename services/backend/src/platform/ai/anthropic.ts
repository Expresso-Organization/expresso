import Anthropic, { APIError, APIConnectionTimeoutError } from "@anthropic-ai/sdk";
import type { z } from "zod";

import {
  AiError,
  DEFAULT_MODEL_TIER,
  logAiFailure,
  parseToolOutput,
  toToolSchema,
  type AiCallOptions,
  type AiCallSpec,
  type AiClient,
  type AiContract,
  type AiModelTier,
  type AiResult,
} from "./client.js";

/**
 * 운영 어댑터 — Anthropic API를 API 키로 직접 부른다.
 *
 * `claude-code`·`codex`(개발 전용, 개인 로그인 CLI)와 달리 이건 서비스 키로
 * 돈다. 여러 사용자 요청을 동시에 처리하는 서버가 개인 계정 뒤에 숨을 이유가
 * 없다 — 그 계정의 사용량·요금이 그 사람 개인 것이 되고, 세션이 끊기면 검색
 * 기능 전체가 조용히 죽는다.
 *
 * 구조화 출력은 도구 호출(tool use) 하나를 강제해서 받는다 — 자유 문장을
 * 절대 신뢰하지 않는다는 원칙(§8.3)은 여기서도 같다.
 *
 * **스트리밍은 내지 않는다(`streams = false`).** 부분 출력은 지면 생성
 * 화면에서만 쓰는 장식이고, 없다고 기능이 죽지 않는다(`client.ts`의 문서:
 * "없으면 없는 것으로 본다"). 흉내 내지 않고 정직하게 비워 둔다 — 필요해지면
 * `messages.stream()`으로 갈아 끼우면 된다.
 */

export interface AnthropicOptions {
  apiKey: string;
  /** 티어(haiku·sonnet·opus)가 실제로 어느 모델 ID로 가는지. */
  models: Record<AiModelTier, string>;
  /**
   * 계약별 덮어쓰기 — `AI_MODEL_JOB_ANALYSIS=sonnet` 같은 값. claude-code·codex와
   * 같은 관례를 쓴다: 여기 든 값은 실제 모델 ID가 아니라 위 `models`의 키(티어
   * 별칭)다.
   */
  modelOverrides?: Partial<Record<string, string>>;
  timeoutMs?: number;
  maxOutputTokens?: number;
}

const TOOL_NAME = "structured_output";
const DEFAULT_MAX_OUTPUT_TOKENS = 8_192;

function resolveModel(
  spec: AiCallSpec,
  models: Record<AiModelTier, string>,
  overrides: Partial<Record<string, string>>,
): string {
  const overriddenTier = overrides[spec.contract] as AiModelTier | undefined;
  const tier = overriddenTier ?? spec.modelTier ?? DEFAULT_MODEL_TIER[spec.contract as AiContract];
  return models[tier] ?? models.sonnet;
}

function mapSdkError(error: unknown, contract: AiContract): AiError {
  if (error instanceof APIConnectionTimeoutError) {
    return new AiError("AI_TIMEOUT", contract, error.message, { retryable: true, cause: error });
  }
  if (error instanceof APIError) {
    if (error.status === 429) {
      return new AiError("AI_RATE_LIMITED", contract, error.message, { retryable: false, cause: error });
    }
    if (error.status === 408) {
      return new AiError("AI_TIMEOUT", contract, error.message, { retryable: true, cause: error });
    }
    return new AiError("AI_UNAVAILABLE", contract, error.message, { retryable: false, cause: error });
  }
  const message = error instanceof Error ? error.message : String(error);
  return new AiError("AI_UNAVAILABLE", contract, message, { retryable: false, cause: error });
}

export class AnthropicAiClient implements AiClient {
  readonly #client: Anthropic;
  readonly #models: Record<AiModelTier, string>;
  readonly #overrides: Partial<Record<string, string>>;
  readonly #maxOutputTokens: number;

  constructor(options: AnthropicOptions) {
    this.#client = new Anthropic({
      apiKey: options.apiKey,
      timeout: options.timeoutMs ?? 180_000,
    });
    this.#models = options.models;
    this.#overrides = options.modelOverrides ?? {};
    this.#maxOutputTokens = options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
  }

  /** 지면 생성의 부분 출력 장식은 못 낸다 — 없다고 정직하게 비워 둔다(위 문서). */
  readonly streams = false;

  async complete<T>(
    spec: AiCallSpec,
    schema: z.ZodType<T>,
    _options: AiCallOptions = {},
  ): Promise<AiResult<T>> {
    const contract = spec.contract as AiContract;
    const model = resolveModel(spec, this.#models, this.#overrides);
    const started = Date.now();

    let message: Anthropic.Message;
    try {
      message = await this.#client.messages.create({
        model,
        max_tokens: this.#maxOutputTokens,
        system: spec.system,
        messages: [{ role: "user", content: spec.prompt }],
        tools: [
          {
            name: TOOL_NAME,
            description: "이 계약이 요구하는 구조화 출력 하나.",
            input_schema: toToolSchema(schema) as Anthropic.Tool.InputSchema,
          },
        ],
        tool_choice: { type: "tool", name: TOOL_NAME },
      });
    } catch (error) {
      const mapped = mapSdkError(error, contract);
      logAiFailure({ contract, model, code: mapped.code, detail: mapped.message });
      throw mapped;
    }
    const durationMs = Date.now() - started;

    if (message.stop_reason === "max_tokens") {
      const failure = new AiError(
        "AI_INVALID_OUTPUT",
        contract,
        `output was cut off at max_tokens (${this.#maxOutputTokens})`,
        { retryable: true },
      );
      logAiFailure({ contract, model, code: failure.code, detail: failure.message });
      throw failure;
    }

    const toolUse = message.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );
    if (!toolUse) {
      const failure = new AiError(
        "AI_INVALID_OUTPUT",
        contract,
        "model did not call the structured_output tool",
        { retryable: true },
      );
      logAiFailure({ contract, model, code: failure.code, detail: failure.message });
      throw failure;
    }

    const validated = parseToolOutput(schema, toolUse.input);
    if (!validated.success) {
      const failure = new AiError(
        "AI_INVALID_OUTPUT",
        contract,
        `structured output did not match the schema: ${validated.error.message}`,
        { retryable: true },
      );
      logAiFailure({ contract, model, code: failure.code, detail: failure.message });
      throw failure;
    }

    return {
      data: validated.data,
      usage: {
        model: message.model,
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
        cacheCreationTokens: message.usage.cache_creation_input_tokens ?? 0,
        // Anthropic API는 호출당 비용을 알려주지 않는다 — 모르면 null(AiUsage 문서).
        costUsd: null,
        durationMs,
      },
    };
  }
}
