import { type EntitlementCapability, type PlanCode } from "@expresso/contracts";
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

/**
 * 기간 안에서 한 사용자가 쓴 토큰 합계.
 *
 * 네 종류를 모두 더한다. 캐시 읽기가 입력보다 네 자리 크다 — 측정한 생성 한 번이
 * 입력 8 · 캐시 읽기 81,423 토큰이었다. 입력만 세면 실제 사용량과 전혀 다른 값이 된다.
 */
export async function tokensUsedInPeriod(
  db: Db,
  userId: string,
  period: KstMonthlyPeriod,
  options: { session?: ClientSession } = {},
): Promise<number> {
  const [row] = await mongoCollections(db).aiUsageEvents.aggregate<{ total: number }>([
    { $match: { userId, createdAt: { $gte: kstPeriodStartsAt(period), $lt: new Date(period.resetsAt) } } },
    { $group: { _id: null, total: { $sum: { $add: ["$inputTokens", "$outputTokens", "$cacheReadTokens", "$cacheCreationTokens"] } } } },
  ], options).toArray();
  return row?.total ?? 0;
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

export class EntitlementSubjectNotFoundError extends Error {
  constructor() {
    super("entitlement subject not found");
    this.name = "EntitlementSubjectNotFoundError";
  }
}
