import { UNMETERED_CONTRACTS, type EntitlementCapability, type PlanCode, type UsageTokens } from "@expresso/contracts";
import { mongoCollections } from "@expresso/database";
import type { ClientSession, Db } from "mongodb";

export interface KstMonthlyPeriod {
  periodStart: string;
  resetsAt: string;
}



export const KST_OFFSET_MS = 9 * 60 * 60 * 1_000;



export const DEFAULT_CAPABILITY_MATRIX: Record<
  PlanCode,
  Record<EntitlementCapability, boolean>
> = {
  free: {
    "portfolio.generate": true,
    "recipe.auto": true,
    "brew.cowork": false,
    "template.pro": false,
    "analytics.full": false,
    "analytics.organization_domains": false,
    "analytics.returning_visitors": false,
    "export.document": false,
    "publishing.custom_domain": false,
    "publishing.remove_badge": false,
    "analysis.advanced": false,
    "collaboration.team": false,
    "consultant.outreach": false,
  },
  pro: {
    "portfolio.generate": true,
    "recipe.auto": true,
    "brew.cowork": true,
    "template.pro": true,
    "analytics.full": true,
    "analytics.organization_domains": true,
    "analytics.returning_visitors": false,
    "export.document": true,
    "publishing.custom_domain": false,
    "publishing.remove_badge": false,
    "analysis.advanced": false,
    "collaboration.team": false,
    "consultant.outreach": true,
  },
  team: {
    "portfolio.generate": true,
    "recipe.auto": true,
    "brew.cowork": true,
    "template.pro": true,
    "analytics.full": true,
    "analytics.organization_domains": true,
    "analytics.returning_visitors": true,
    "export.document": true,
    "publishing.custom_domain": true,
    "publishing.remove_badge": true,
    "analysis.advanced": true,
    "collaboration.team": true,
    "consultant.outreach": true,
  },
};



export function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

export function kstMonthlyPeriod(at: Date): KstMonthlyPeriod {
  if (Number.isNaN(at.getTime())) throw new RangeError("invalid quota clock");
  const kstClock = new Date(at.getTime() + KST_OFFSET_MS);
  const year = kstClock.getUTCFullYear();
  const monthIndex = kstClock.getUTCMonth();
  const periodStart = `${year}-${twoDigits(monthIndex + 1)}-01`;
  const nextMonthKst = Date.UTC(year, monthIndex + 1, 1);
  const resetsAt = new Date(nextMonthKst - KST_OFFSET_MS).toISOString();
  return { periodStart, resetsAt };
}



/** 기간이 시작하는 순간. `periodStart`는 한국 시각 1일 0시다. */
export function kstPeriodStartsAt(period: KstMonthlyPeriod): Date {
  return new Date(Date.parse(`${period.periodStart}T00:00:00.000Z`) - KST_OFFSET_MS);
}

/** 크레딧에 넣는 호출만 고른다. 서비스가 먼저 실행하는 계약(`UNMETERED_CONTRACTS`)은 뺀다. */
export const METERED_CALLS = { contract: { $nin: [...UNMETERED_CONTRACTS] } };

/** 종류별 합계. 무게는 여기서 곱하지 않는다 — `creditsFromUsage`가 정수로 한 번 곱한다. */
export const TOKEN_SUMS = {
  inputTokens: { $sum: "$inputTokens" },
  outputTokens: { $sum: "$outputTokens" },
  cacheReadTokens: { $sum: "$cacheReadTokens" },
};

/**
 * 기간 안에서 한 사용자가 쓴 토큰의 종류별 합계. 크레딧에 넣는 호출만 센다.
 *
 * 캐시 읽기가 입력보다 네 자리 크다 — 측정한 생성 한 번이 입력 8 · 캐시 읽기 81,423
 * 토큰이었다. 종류를 나눠 돌려주는 까닭이다: 캐시 읽기는 10분의 1로 센다.
 */
export async function usageInPeriod(
  db: Db,
  userId: string,
  period: KstMonthlyPeriod,
  options: { session?: ClientSession } = {},
): Promise<UsageTokens> {
  const [row] = await mongoCollections(db).aiUsageEvents.aggregate<UsageTokens>([
    { $match: { userId, ...METERED_CALLS, createdAt: { $gte: kstPeriodStartsAt(period), $lt: new Date(period.resetsAt) } } },
    { $group: { _id: null, ...TOKEN_SUMS } },
  ], options).toArray();
  return { inputTokens: row?.inputTokens ?? 0, outputTokens: row?.outputTokens ?? 0, cacheReadTokens: row?.cacheReadTokens ?? 0 };
}

export function configuredBoolean(
  features: Record<string, unknown>,
  key: string,
): boolean | undefined {
  const value = Object.hasOwn(features, key) ? features[key] : undefined;
  return typeof value === "boolean" ? value : undefined;
}

export function capabilityEnabled(
  planCode: PlanCode,
  features: Record<string, unknown>,
  capability: EntitlementCapability,
): boolean {
  return configuredBoolean(features, capability)
    ?? DEFAULT_CAPABILITY_MATRIX[planCode][capability];
}

/**
 * 요금제가 먼저 연락하기(약속 확인 · 안부 · 능동 제안)를 여는가.
 *
 * 켜기 · 읽기 · 실행 · 확인 작업 · 에이전트의 기억이 모두 이 함수 하나로 묻는다. 한 곳이라도
 * 따로 판단하면 무료 계정에 크레딧 없이 AI가 돌 수 있다. 계정이 없으면(탈퇴) 열지 않는다.
 */
export function outreachGate(entitlements: { check(userId: string, capability: EntitlementCapability, at?: Date): Promise<{ allowed: boolean }> }) {
  return async (userId: string): Promise<boolean> => {
    try { return (await entitlements.check(userId, "consultant.outreach")).allowed; }
    catch (error) { if (error instanceof EntitlementSubjectNotFoundError) return false; throw error; }
  };
}

export class EntitlementSubjectNotFoundError extends Error {
  constructor() {
    super("entitlement subject not found");
    this.name = "EntitlementSubjectNotFoundError";
  }
}
