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
  // 완성된 지면의 스크린샷을 보고 구성을 고치고, 고치기 전후를 비교합니다.
  "page_review",
  // 설계가 먼저 오는 생성: 지면 설계와 설계도의 칸 채우기.
  "page_design",
  "page_fill",
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
  // 지면을 고치는 판단이라 생성과 같은 모델을 씁니다. 다듬기는 초안을 보여 준 뒤에 돌아 사람이 기다리지 않습니다.
  page_review: "opus",
  // 지면 설계는 생성의 판단 전부라 비싼 모델을 씁니다. 칸 채우기는 정해진 칸에 원문을 옮겨 적는 일이라 빠른 모델로 시작합니다.
  page_design: "opus",
  page_fill: "sonnet",
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
  /** 프롬프트와 함께 보낼 이미지(base64). 이미지를 받지 못하는 공급자는 `AI_UNAVAILABLE`을 냅니다. */
  images?: readonly AiImage[];
  /**
   * 생각하는 양입니다. 출력 토큰의 대부분이 생각이라 시간이 이 값에 따라 달라집니다. 주지 않으면 공급자 기본값입니다.
   * Claude Code는 `--effort`로 넘기고, 지원하지 않는 공급자는 무시합니다.
   */
  effort?: "low" | "medium" | "high";
}

export interface AiImage {
  mediaType: "image/png" | "image/jpeg";
  /** base64 본문입니다. data URL 접두어를 붙이지 않습니다. */
  data: string;
  /** 모델이 이미지를 가리킬 때 쓰는 이름입니다(예: "A · 1440px 첫 화면"). 이미지 바로 앞에 글로 붙습니다. */
  label: string;
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
/**
 * 받은 출력에서 검사를 통과하지 못한 칸 하나입니다. `path`는 출력 JSON의 JSON 포인터(`/sections/a/body`)이고,
 * `problem`은 모델에게 그대로 보이는 문장입니다(무엇을 어겼는지, 기준이 무엇인지).
 */
export interface AiViolation {
  path: string;
  problem: string;
}

/** 모델이 고쳐 보낸 칸 하나입니다. 그 경로의 값을 통째로 바꿉니다. */
export interface AiFix {
  path: string;
  value: unknown;
}

export interface AiCallOptions<T = unknown> {
  /**
   * 계약(Zod)을 통과한 출력에 업무 규칙을 검사합니다(근거 없는 수치, 지면 칸 예산 등).
   *
   * 걸린 칸은 출력을 거절하지 않고, 같은 대화에서 그 칸만 고쳐 받습니다(`AI_FIX_ROUNDS`번까지). 고친 뒤에도 남은
   * 위반은 출력을 그대로 돌려주고 기록합니다. 계약 자체(저장할 수 있는 모양)를 어긴 칸도 같은 방식으로 고쳐 받습니다.
   */
  check?: (data: T) => AiViolation[];
  /** 계약을 처음 통과한 출력입니다. 고치기 전에 화면에 바로 보여 주는 자리입니다. */
  onDraft?: (data: T) => void;
  /** 고친 칸이 왔을 때입니다. `data`는 고친 칸을 넣고 계약을 통과한 출력입니다. */
  onRevision?: (fixes: readonly AiFix[], data: T) => void;
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
   * 구조화 출력이 처음부터 다시 시작됐다(공급자가 출력 블록을 한 번 더 열었다).
   *
   * 이것을 주면 다시 시작한 블록의 조각도 `onPartial`로 계속 받는다. 받는 쪽은 쌓은 것을 버리고 처음부터 읽어야
   * 한다. 주지 않으면 지금처럼 그 자리에서 조각을 멈춘다 — 이어 붙이기만 하는 쪽은 되돌릴 방법이 없다.
   */
  onPartialRestart?: () => void;
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
    options?: AiCallOptions<T>,
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
 *
 * **모양(키 · 값의 종류 · 열거형)만 넘긴다.** 글자 수 · 개수 · 형식 · 범위 기준(`SOFT_KEYWORDS`)을 넘기면 공급자가
 * 그 기준을 어긴 출력을 통째로 돌려보내고 모델이 처음부터 다시 쓴다 — 2026-10-26 지면 채우기에서 본문 86자 > 80자
 * 하나로 약 150초가 더 들었다. 기준은 설명(`description`)에 "80자 이하"처럼 적어 요청하고, 받은 뒤 검사에 걸린
 * 칸만 같은 대화에서 고쳐 받는다(`claude-code.ts`).
 */
export function toToolSchema(schema: z.ZodType): Record<string, unknown> {
  const generated = z.toJSONSchema(schema, { target: "draft-2020-12" }) as
    Record<string, unknown>;
  const { $schema: _ignored, ...rest } = generated;
  return shapeOnly(rest) as Record<string, unknown>;
}

/** 공급자 형식에서 떼는 기준 키워드입니다. `format`은 위 주석의 400 때문에 함께 뗍니다. */
export const SOFT_KEYWORDS = [
  "minLength", "maxLength", "minItems", "maxItems", "pattern",
  "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "format",
] as const;

/** 기준 키워드를 떼고, 그 값을 설명 문장으로 옮깁니다. 키 · 타입 · 열거형 · 필수 여부는 그대로 둡니다. */
function shapeOnly(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(shapeOnly);
  if (!node || typeof node !== "object") return node;
  const source = node as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if ((SOFT_KEYWORDS as readonly string[]).includes(key)) continue;
    // 속성 이름이 기준 키워드와 같을 수 있어(`pattern` 같은 칸 이름) 이름으로 묶인 자리는 값만 줄인다.
    result[key] = (key === "properties" || key === "$defs") && value && typeof value === "object"
      ? Object.fromEntries(Object.entries(value).map(([name, property]) => [name, shapeOnly(property)]))
      : shapeOnly(value);
  }
  const rules = describeRules(source);
  if (rules) result["description"] = typeof source["description"] === "string" ? `${source["description"]} (${rules})` : rules;
  return result;
}

function describeRules(node: Record<string, unknown>): string {
  const rules: string[] = [];
  const number = (key: string) => (typeof node[key] === "number" ? (node[key] as number) : undefined);
  const [minLength, maxLength, minItems, maxItems] = [number("minLength"), number("maxLength"), number("minItems"), number("maxItems")];
  if (minLength !== undefined && minLength > 1) rules.push(`${minLength}자 이상`);
  if (maxLength !== undefined) rules.push(`${maxLength}자 이하`);
  if (minItems !== undefined && minItems > 0) rules.push(`${minItems}개 이상`);
  if (maxItems !== undefined) rules.push(`${maxItems}개 이하`);
  const [minimum, maximum] = [number("minimum") ?? number("exclusiveMinimum"), number("maximum") ?? number("exclusiveMaximum")];
  if (minimum !== undefined) rules.push(`${minimum} ${number("exclusiveMinimum") !== undefined ? "초과" : "이상"}`);
  if (maximum !== undefined) rules.push(`${maximum} ${number("exclusiveMaximum") !== undefined ? "미만" : "이하"}`);
  if (typeof node["pattern"] === "string") rules.push(`정규식 ${node["pattern"]}`);
  return rules.join(" · ");
}

/**
 * `null`을 걷어낸다.
 *
 * 모델이 선택 필드를 `null`로 적어 보낼 때가 있다. 계약에서 그 자리는 "없음"이지 "null"이 아니라, 그대로
 * 파싱하면 계약이 거절한다.
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
    spec.effort ?? "",
    // 같은 글이라도 다른 화면을 보여 주면 다른 호출입니다.
    ...(spec.images ?? []).map((image) => `${image.label}:${createHash("sha256").update(image.data).digest("hex")}`),
  ].join("\0");
  // 해시는 파일 이름으로 쓴다. 충돌하면 다른 계약의 픽스처를 재생하게 되므로
  // 짧게 자르되 sha256을 쓴다.
  return createHash("sha256").update(source).digest("hex").slice(0, 32);
}
