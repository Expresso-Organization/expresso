import { z } from "zod";

import { TimestampSchema } from "./common.js";
import { EntitlementCapabilitySchema } from "./entitlements.js";
import { PlanCodeSchema } from "./identity.js";

/**
 * 크레딧 하나의 크기(토큰).
 *
 * 화면 정의서는 월 100 · 1,000 · 2,500 크레딧을 적지만 크레딧의 크기는 어느 문서에도
 * 없다. 저장된 생성 40건의 평균이 약 235,000 토큰(입력 8 · 출력 16,647 · 캐시 생성
 * 136,562 · 캐시 읽기 81,423)이었고, 이 크기로 잡으면 생성 한 번이 23.5 크레딧이어서
 * 무료 플랜 100 크레딧으로 네 번 생성한다. 기획 초기의 월 3회와 가깝다.
 */
export const TOKENS_PER_CREDIT = 10_000;

const TokenCountSchema = z.number().int().nonnegative();

/** 호출 한 건이 쓴 토큰. 네 종류를 모두 크레딧에 넣는다. */
export const UsageTokensSchema = z.strictObject({
  inputTokens: TokenCountSchema,
  outputTokens: TokenCountSchema,
  cacheCreationTokens: TokenCountSchema,
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

/** 토큰 합계를 크레딧으로 바꾼다. 기간 전체를 더한 뒤 한 번만 올린다. */
export function creditsFromTokens(totalTokens: number): number {
  return Math.ceil(totalTokens / TOKENS_PER_CREDIT);
}

export type UsageTokens = z.infer<typeof UsageTokensSchema>;
export type UsageDay = z.infer<typeof UsageDaySchema>;
export type UsageGroup = z.infer<typeof UsageGroupSchema>;
export type MonthlyUsage = z.infer<typeof MonthlyUsageSchema>;
export type PlanSummary = z.infer<typeof PlanSummarySchema>;
