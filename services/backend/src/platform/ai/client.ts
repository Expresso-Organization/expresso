import { createHash } from "node:crypto";

import { z } from "zod";

/**
 * AI 호출 포트.
 *
 * 도메인은 이 인터페이스만 본다 — 어느 모델을 쓰는지, API로 부르는지 로컬
 * CLI로 부르는지 모른다. 프로바이더를 바꾸면 `platform/ai/` 안에서 끝난다.
 *
 * **응답은 항상 스키마로 강제한다** (§8.3: 자유 문장만 반환하는 응답은 무효).
 * 다만 스키마를 통과한 것이 곧 좋은 값은 아니다. 이 포트는 **구조**만 책임진다 —
 * 틀린 것을 막는 일은 도메인 검증기와 DB 트리거가, **좋게 만드는 일은 계약별
 * 프롬프트가** 한다(§8.3 품질 기준 3원칙). 둘 다 통과해야 사용자에게 보여준다.
 */

/** §8.3의 AI 계약. 모델 티어와 픽스처 경로가 이걸로 갈린다. */
export const AI_CONTRACTS = [
  "job_analysis",
  "job_facts",
  "search_interpret",
  "question_draft",
  "record_cleanup",
  "recipe_draft",
  "generation",
  "layout_draft",
  "page_generation",
  "partial_edit",
  "style_remix",
  "insight_note",
] as const;

export type AiContract = (typeof AI_CONTRACTS)[number];

export const AI_MODEL_TIERS = ["haiku", "sonnet", "opus"] as const;
export type AiModelTier = (typeof AI_MODEL_TIERS)[number];

/**
 * 계약별 기본 모델.
 *
 * 가르는 기준 하나 — **한 번 뽑아서 오래 쓰는 것은 비싼 모델, 사람이 기다리는
 * 것은 빠른 모델.** 공고 분석은 근거 구간이 원문과 글자까지 맞아야 하고 공고당
 * 한 번만 돌므로(요건이 공고에 붙는다) 비싼 쪽이 정당하다. 지면 생성도 같다 —
 * 추출 한 번에 한 번 돌고, 그 결과가 사람들이 실제로 보는 페이지가 된다.
 */
export const DEFAULT_MODEL_TIER: Record<AiContract, AiModelTier> = {
  job_analysis: "opus",
  recipe_draft: "opus",
  layout_draft: "opus",
  // 한 번 뽑아서 오래 쓰는 것 중에서도 가장 그렇다 — 이 호출의 결과가 곧
  // 사람들이 보는 페이지 전체이고, 여기서 아낀 값은 바로 지면 품질로 나온다.
  page_generation: "opus",
  question_draft: "sonnet",
  record_cleanup: "sonnet",
  generation: "sonnet",
  // 공고 하나를 들일 때 한 번 읽고 그 값을 계속 쓴다 — "오래 쓰는 것"이라
  // 싼 쪽으로 내리지 않는다. 다만 요건 추출처럼 근거 구간을 원문과 맞추는
  // 일이 아니라 세 칸을 읽고 인용을 붙이는 정해진 일이라, opus까지는 아니다.
  job_facts: "sonnet",
  partial_edit: "sonnet",
  style_remix: "sonnet",
  search_interpret: "haiku",
  insight_note: "haiku",
};

export interface AiCallSpec {
  contract: AiContract;
  /** 역할과 제약. 계약마다 고정이고, 입력 데이터를 담지 않는다. */
  system: string;
  /** 이번 호출의 입력. */
  prompt: string;
  /** 프롬프트를 고치면 올린다. 산출물에 함께 저장해 낡은 결과를 가려낸다. */
  promptVersion: number;
  /** 티어 기본값을 덮어쓸 때만. */
  modelTier?: AiModelTier;
}

export interface AiUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  /** 프로바이더가 알려주지 않으면 null. */
  costUsd: number | null;
  durationMs: number;
}

export interface AiResult<T> {
  data: T;
  usage: AiUsage;
}

export interface AiClient {
  complete<T>(spec: AiCallSpec, schema: z.ZodType<T>): Promise<AiResult<T>>;
}

export type AiErrorCode =
  | "AI_TIMEOUT"
  | "AI_RATE_LIMITED"
  | "AI_INVALID_OUTPUT"
  | "AI_UNAVAILABLE";

export class AiError extends Error {
  readonly code: AiErrorCode;
  /**
   * 큐가 **지금** 다시 시도해도 되는가.
   *
   * 레이트 리밋은 false다 — 지수 백오프로 몇 초 뒤에 다시 때리면 남은 쿼터만
   * 태운다. 창이 열릴 때까지 기다려야 하고, 그건 큐의 재시도로 표현할 수 없다.
   */
  readonly retryable: boolean;
  readonly contract: AiContract;

  constructor(
    code: AiErrorCode,
    contract: AiContract,
    message: string,
    options: { retryable?: boolean; cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? {} : { cause: options.cause });
    this.name = "AiError";
    this.code = code;
    this.contract = contract;
    this.retryable = options.retryable ?? code === "AI_TIMEOUT";
  }
}

/**
 * 계약 스키마를 모델에 넘길 JSON Schema로 바꾼다.
 *
 * `$schema` 메타 참조는 떼어낸다 — 도구 쪽 검증기가 그 URL을 풀지 못해
 * "no schema with key or ref"로 거절한다.
 */
export function toToolSchema(schema: z.ZodType): Record<string, unknown> {
  const generated = z.toJSONSchema(schema, { target: "draft-2020-12" }) as
    Record<string, unknown>;
  const { $schema: _ignored, ...rest } = generated;
  return rest;
}

/** 같은 입력이면 같은 키. 픽스처 경로이자 중복 호출 판정 기준이다. */
export function callKey(spec: AiCallSpec, schema: z.ZodType): string {
  const shape = JSON.stringify(toToolSchema(schema));
  const source = [
    spec.contract,
    String(spec.promptVersion),
    spec.modelTier ?? DEFAULT_MODEL_TIER[spec.contract],
    spec.system,
    spec.prompt,
    shape,
  ].join("\0");
  // 해시는 파일 이름으로 쓴다. 충돌하면 다른 계약의 픽스처를 재생하게 되므로
  // 짧게 자르되 sha256을 쓴다.
  return createHash("sha256").update(source).digest("hex").slice(0, 32);
}
