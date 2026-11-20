import { z } from "zod";

import { TimestampSchema } from "./common.js";
import { EntitlementCapabilitySchema } from "./entitlements.js";
import { PlanCodeSchema } from "./identity.js";

/**
 * 크레딧 하나의 크기(토큰).
 *
 * 화면 정의서는 월 100 · 1,000 · 2,500 크레딧을 적지만 크레딧의 크기는 어느 문서에도
 * 없다. 저장된 생성 40건의 평균은 입력 8 · 출력 16,647 · 캐시 읽기 81,423 토큰이다
 * (캐시 생성 136,562는 세지 않는다 — 아래). 캐시 읽기를 10분의 1로 세면 생성 한 번이
 * 약 2.5 크레딧이어서 무료 플랜 100 크레딧으로 한 달에 마흔 번쯤 생성한다.
 */
export const TOKENS_PER_CREDIT = 10_000;

/**
 * 크레딧에 넣는 토큰 종류.
 *
 * 캐시 생성 토큰은 넣지 않는다. 실제 검색어 해석 한 번이 37,669 토큰이었는데 그중
 * 36,632가 공급자(Claude Code CLI)의 시스템 프롬프트를 캐시에 쓰는 몫이었다. 사용자가
 * 시킨 일의 크기가 아니라 공급자 쪽 사정이라, 넣으면 검색 25번에 무료 한도가 끝난다.
 * 호출 기록(`ai_usage_events`)에는 네 종류를 모두 남긴다.
 */
export const BILLABLE_TOKEN_FIELDS = ["inputTokens", "outputTokens", "cacheReadTokens"] as const;

/**
 * 종류마다의 무게. 10분의 1 단위의 정수다 — 10이 토큰 하나를 그대로 센다는 뜻이다.
 *
 * 캐시 읽기는 10개를 1개로 센다. 공급자가 캐시 읽기를 입력 가격의 0.1배로 받는다:
 * "Cache read (hit): 0.1x base input price on most models"
 * (https://platform.claude.com/docs/en/about-claude/pricing, 2026-11-20 확인. 에이전트가 쓰는
 * `claude-sonnet-5`는 입력 $2 · 캐시 읽기 $0.20이다). 더 싼 모델(0.05배 · 0.025배)도 0.1로 센다 —
 * 모델이 바뀌어도 사용자가 보는 크레딧이 달라지지 않고, 어느 모델에서도 덜 받지 않는다.
 *
 * 똑같이 세면 대화가 길어질수록 같은 일의 크레딧이 커진다. 컨설턴트와의 완주 한 번
 * (진단 → 확인 → 기록 → 권유 → 약속)이 45 크레딧이었고 그 96%가 캐시 읽기였다.
 *
 * 소수 0.1을 쓰지 않는 까닭: 합계에 0.1을 곱하면 소수가 생겨 올림의 경계가 흔들린다.
 */
export const BILLABLE_TOKEN_TENTHS = { inputTokens: 10, outputTokens: 10, cacheReadTokens: 1 } as const satisfies Record<(typeof BILLABLE_TOKEN_FIELDS)[number], number>;

/**
 * 크레딧에 넣지 않는 계약.
 *
 * 능동 제안은 사용자가 누르지 않아도 서비스가 먼저 실행한다. 사용자가 시킨 일이 아니라
 * 이번 달 크레딧과 사용량 화면에 넣지 않는다. 그 대신 유료 요금제의 기능이다
 * (`consultant.outreach`). 호출 기록(`ai_usage_events`)에는 남긴다.
 */
export const UNMETERED_CONTRACTS: readonly string[] = ["proposal_briefing"];

const TokenCountSchema = z.number().int().nonnegative();

/** 크레딧에 들어가는 토큰. 종류마다 따로 담는다. */
export const UsageTokensSchema = z.strictObject({
  inputTokens: TokenCountSchema,
  outputTokens: TokenCountSchema,
  cacheReadTokens: TokenCountSchema,
});

/** 하루치. 날짜는 한국 시각 기준이다. */
export const UsageDaySchema = UsageTokensSchema.extend({
  date: z.iso.date(),
  calls: z.number().int().nonnegative(),
});

/** 기능(AI 계약) 하나 또는 모델 하나의 합계. */
export const UsageGroupSchema = z.strictObject({
  key: z.string().min(1).max(200),
  totalTokens: TokenCountSchema,
  calls: z.number().int().nonnegative(),
});

export const MonthlyUsageSchema = z.strictObject({
  periodStart: z.iso.date(),
  resetsAt: TimestampSchema,
  planCode: PlanCodeSchema,
  tokensPerCredit: z.number().int().positive(),
  creditsUsed: z.number().int().nonnegative(),
  creditLimit: z.number().int().nonnegative().nullable(),
  creditsRemaining: z.number().int().nonnegative().nullable(),
  calls: z.number().int().nonnegative(),
  tokens: UsageTokensSchema,
  /** 이번 달 첫날부터 오늘까지 하루도 빠짐없이. 호출이 없던 날은 0이다. */
  daily: z.array(UsageDaySchema).max(31),
  /** 많이 쓴 순서. */
  byContract: z.array(UsageGroupSchema).max(50),
  byModel: z.array(UsageGroupSchema).max(50),
});

export const MonthlyUsageResponseSchema = z.strictObject({
  data: MonthlyUsageSchema,
});

export const PlanSummarySchema = z.strictObject({
  code: PlanCodeSchema,
  displayName: z.string().min(1).max(80),
  monthlyPriceKrw: z.number().int().nonnegative(),
  monthlyCredits: z.number().int().nonnegative(),
  /** 플랜이 여는 기능. 켜진 것만 들어 있다. */
  capabilities: z.array(EntitlementCapabilitySchema),
});

export const PlanListResponseSchema = z.strictObject({
  data: z.array(PlanSummarySchema),
});

/** 무게를 곱한 합. 10분의 1 토큰 단위의 정수다. */
function billableTenths(tokens: UsageTokens): number {
  return BILLABLE_TOKEN_FIELDS.reduce((sum, field) => sum + tokens[field] * BILLABLE_TOKEN_TENTHS[field], 0);
}

/** 크레딧에 들어가는 토큰 수. 캐시 읽기는 10분의 1로 센다. 소수 한 자리까지 나온다. */
export function billableTokens(tokens: UsageTokens): number {
  return billableTenths(tokens) / 10;
}

/** 종류 하나의 토큰 수를 크레딧에 들어가는 토큰 수로. 차트가 계열마다 쓴다. */
export function billableTokensOf(field: (typeof BILLABLE_TOKEN_FIELDS)[number], count: number): number {
  return (count * BILLABLE_TOKEN_TENTHS[field]) / 10;
}

/**
 * 사용량을 크레딧으로 바꾼다. 기간 전체를 더한 뒤 한 번만 올린다 — 호출마다 올리면
 * 작은 호출 50건이 50 크레딧이 된다. 한도 판단과 사용량 화면이 이 함수 하나를 쓴다.
 */
export function creditsFromUsage(tokens: UsageTokens): number {
  return Math.ceil(billableTenths(tokens) / (10 * TOKENS_PER_CREDIT));
}

export type UsageTokens = z.infer<typeof UsageTokensSchema>;
export type UsageDay = z.infer<typeof UsageDaySchema>;
export type UsageGroup = z.infer<typeof UsageGroupSchema>;
export type MonthlyUsage = z.infer<typeof MonthlyUsageSchema>;
export type PlanSummary = z.infer<typeof PlanSummarySchema>;
