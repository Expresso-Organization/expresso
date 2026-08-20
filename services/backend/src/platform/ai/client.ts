import { createHash } from "node:crypto";

import { z } from "zod";

import { redactedDetail } from "../observability.js";

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

/**
 * 한 번의 호출에 붙는 것. 계약이 아니라 **부르는 쪽의 사정**이다.
 */
export interface AiCallOptions {
  /**
   * 모델이 쓰는 동안 지금까지 쌓인 것을 준다.
   *
   * 넘어오는 것은 완성된 값이 아니라 **끝나지 않은 JSON 조각**이다 —
   * `{"css":"body{ma`처럼 문자열 한가운데서 끊긴다. 그래서 여기서
   * `JSON.parse`를 부르면 안 되고, `partialDraft()`로 읽는다.
   *
   * 인자는 **이번에 새로 온 조각**이다. 누적은 받는 쪽이 한다 — 매번 전체를
   * 넘기면 지면 하나에 같은 글자를 수십 번 다시 보낸다.
   */
  onPartial?: (delta: string) => void;
  /**
   * 모델이 생각하는 동안 쌓인 분량(토큰).
   *
   * 실측에서 지면 하나의 첫 조각까지 126초가 걸렸고, 그 사이 결과 쪽으로는 한
   * 글자도 안 나온다. 생각을 줄여 침묵을 없애 봤더니 지면이 통째로 사라졌다
   * (`claude-code.ts` 주석). 그러면 남은 길은 그 시간에 **무슨 일이 일어나는지
   * 말해 주는 것**뿐이다.
   *
   * **글이 아니라 분량이다.** sonnet은 추론 내용을 내주지 않는다(실측: 조각
   * 35개가 전부 빈 문자열). 화면에 숫자를 쓰라는 뜻이 아니라, 이 신호가 오는
   * 동안은 「구상하는 중」이고 조각이 오기 시작하면 「쓰는 중」이라는 뜻이다.
   */
  onThinking?: (estimatedTokens: number) => void;
}

export interface AiClient {
  complete<T>(
    spec: AiCallSpec,
    schema: z.ZodType<T>,
    options?: AiCallOptions,
  ): Promise<AiResult<T>>;
  /**
   * 이 프로바이더가 부분 출력을 낼 수 있는가.
   *
   * **없으면 없는 것으로 본다.** 흉내 내지 않는다 — 진행률을 지어내면 화면은
   * 3분 동안 거짓말을 하게 되고, 실제로 어디까지 갔는지는 아무도 모른다.
   *
   * 2026-08-14 실측: codex `exec --json`은 최종 메시지를 `item.completed` 한
   * 덩어리로만 낸다(짧은 응답 · 긴 응답 모두). claude-code는
   * `--include-partial-messages`로 구조화 출력을 `input_json_delta`로 쪼개 준다.
   */
  readonly streams?: boolean;
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
 * 계약 호출이 실패한 자리를 남긴다.
 *
 * 프로바이더가 우리 **요청**을 거절한 사유는 우리 쪽 버그를 설명하는 문장이라
 * 남길 값이 있다. 오늘 `PROVIDER_FAILED` 세 건의 정체가 여기 한 줄이면 바로
 * 보였을 것이다 — 대신 아는 비밀 모양을 지우고 길이를 자른다.
 */
export function logAiFailure(input: {
  contract: AiContract;
  model: string;
  code: AiErrorCode;
  detail: string;
}): void {
  console.error(JSON.stringify({
    level: "error",
    event: "ai.call_failed",
    contract: input.contract,
    model: input.model,
    code: input.code,
    detail: redactedDetail(input.detail),
  }));
}

/**
 * 계약 스키마를 모델에 넘길 JSON Schema로 바꾼다.
 *
 * `$schema` 메타 참조는 떼어낸다 — 도구 쪽 검증기가 그 URL을 풀지 못해
 * "no schema with key or ref"로 거절한다.
 *
 * `format`도 전부 떼어낸다. `z.string().url()`은 `"format":"uri"`로 나가는데
 * 구조화 출력 검증기가 **모르는 포맷을 400으로 거절한다**(`'uri' is not a valid
 * format`). 계약 하나에 그런 필드가 하나만 있어도 그 계약은 절대 성공하지
 * 못하고, 재시도가 전부 같은 400을 맞는다 — 지면 생성이 `PROVIDER_FAILED`로
 * 죽던 원인이 이것이었다.
 *
 * 떼어내도 안전한 것은 **모델 응답을 우리가 다시 Zod로 파싱하기 때문이다.**
 * 여기 넘기는 스키마는 모양을 알려주는 힌트이고, 진짜 문은 어댑터가 쥐고 있다.
 */
export function toToolSchema(schema: z.ZodType): Record<string, unknown> {
  const generated = z.toJSONSchema(schema, { target: "draft-2020-12" }) as
    Record<string, unknown>;
  const { $schema: _ignored, ...rest } = generated;
  return normalize(rest) as Record<string, unknown>;
}

/**
 * 프로바이더 방언에 맞춘다. 계약은 건드리지 않는다.
 *
 * 구조화 출력의 strict 모드는 두 가지를 더 요구한다 —
 *
 * - **모든 속성이 `required`**여야 한다. 선택 필드는 빼는 게 아니라 `null`을
 *   허용해서 표현한다(`'required' … Missing 'mark'`로 400).
 * - 모르는 `format`은 거절한다(위 주석).
 *
 * 그래서 선택 필드를 nullable로 바꿔 내보내고, 돌아온 `null`은 파싱 전에
 * 걷어낸다(`dropNulls`). 계약이 진짜로 nullable인 자리는 Zod가 그 null을
 * 받으므로 먼저 그대로 파싱해 보고, 실패할 때만 걷어낸 것으로 다시 본다.
 */
function normalize(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(normalize);
  if (!node || typeof node !== "object") return node;

  const source = node as Record<string, unknown>;
  const properties = source["properties"] as Record<string, unknown> | undefined;
  const required = new Set(
    Array.isArray(source["required"]) ? (source["required"] as string[]) : [],
  );

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (key === "format") continue;
    if (key === "properties" && properties) {
      result[key] = Object.fromEntries(
        Object.entries(properties).map(([name, property]) => [
          name,
          required.has(name) ? normalize(property) : nullable(normalize(property)),
        ]),
      );
      continue;
    }
    result[key] = normalize(value);
  }

  if (properties) result["required"] = Object.keys(properties);
  return result;
}

/** 선택 필드를 "값 아니면 null"로 넓힌다. */
function nullable(node: unknown): unknown {
  if (!node || typeof node !== "object") return node;
  const source = node as Record<string, unknown>;
  const type = source["type"];
  if (typeof type === "string") return { ...source, type: [type, "null"] };
  if (Array.isArray(type)) {
    return type.includes("null") ? source : { ...source, type: [...type, "null"] };
  }
  // enum · anyOf · $ref처럼 type이 없는 모양은 감싸서 넓힌다.
  return { anyOf: [source, { type: "null" }] };
}

/**
 * `null`을 걷어낸다.
 *
 * strict 모드 때문에 넓혀 둔 선택 필드가 `null`로 돌아온다. 계약에서 그 자리는
 * "없음"이지 "null"이 아니라, 그대로 파싱하면 계약이 거절한다.
 */
export function dropNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(dropNulls);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== null)
      .map(([key, item]) => [key, dropNulls(item)]),
  );
}

/**
 * 모델이 낸 JSON을 계약으로 받는다.
 *
 * 먼저 **온 그대로** 본다 — 계약이 진짜 nullable인 자리의 null을 잃지 않기
 * 위해서다. 거절당하면 그때 null을 걷어내고 다시 본다.
 */
export function parseToolOutput<T>(schema: z.ZodType<T>, json: unknown): z.ZodSafeParseResult<T> {
  const asIs = schema.safeParse(json);
  return asIs.success ? asIs : schema.safeParse(dropNulls(json));
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
