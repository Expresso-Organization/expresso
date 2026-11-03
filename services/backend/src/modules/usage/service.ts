import {
  creditsFromTokens,
  EntitlementCapabilitySchema,
  MonthlyUsageSchema,
  PlanSummarySchema,
  TOKENS_PER_CREDIT,
  type MonthlyUsage,
  type PlanSummary,
  type UsageGroup,
  type UsageTokens,
} from "@expresso/contracts";
import { mongoCollections } from "@expresso/database";

import type { MongoContext } from "../../platform/mongodb.js";
import { BILLABLE_TOKENS, capabilityEnabled, kstMonthlyPeriod, kstPeriodStartsAt, KST_OFFSET_MS } from "../entitlements/index.js";

export class UsageSubjectNotFoundError extends Error {
  constructor() {
    super("usage subject not found");
    this.name = "UsageSubjectNotFoundError";
  }
}

const TOKEN_SUMS = {
  inputTokens: { $sum: "$inputTokens" },
  outputTokens: { $sum: "$outputTokens" },
  cacheReadTokens: { $sum: "$cacheReadTokens" },
  calls: { $sum: 1 },
};
const GROUP_LIMIT = 50;

type TokenRow = UsageTokens & { calls: number };

interface Facets {
  totals: TokenRow[];
  daily: (TokenRow & { _id: string })[];
  byContract: { _id: string; totalTokens: number; calls: number }[];
  byModel: { _id: string; totalTokens: number; calls: number }[];
}

const ZERO: UsageTokens = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };

/** 한국 시각 날짜(`YYYY-MM-DD`). 기간과 같은 기준으로 하루를 나눈다. */
function kstDate(at: Date): string {
  return new Date(at.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

function tokensOf(row: TokenRow | undefined): UsageTokens {
  if (!row) return { ...ZERO };
  return {
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    cacheReadTokens: row.cacheReadTokens,
  };
}

function groups(rows: { _id: string; totalTokens: number; calls: number }[]): UsageGroup[] {
  return rows.map(({ _id, totalTokens, calls }) => ({ key: _id, totalTokens, calls }));
}

export class UsageService {
  constructor(readonly context: MongoContext) {}

  /**
   * 이번 달 AI 사용량.
   *
   * 크레딧은 `entitlements`가 한도를 판단할 때와 같은 셈이다 — 기간 전체의 토큰을
   * 더한 뒤 한 번 올린다. 집계는 데이터베이스가 한 번에 한다.
   */
  async monthly(userId: string, at = new Date()): Promise<MonthlyUsage> {
    const collections = mongoCollections(this.context.db);
    const account = await collections.users.findOne({ _id: userId, deletionRequestedAt: null });
    const plan = account ? await collections.plans.findOne({ _id: account.planId }) : null;
    if (!plan) throw new UsageSubjectNotFoundError();

    const period = kstMonthlyPeriod(at);
    const [facets] = await collections.aiUsageEvents.aggregate<Facets>([
      { $match: { userId, createdAt: { $gte: kstPeriodStartsAt(period), $lt: new Date(period.resetsAt) } } },
      { $facet: {
        totals: [{ $group: { _id: null, ...TOKEN_SUMS } }],
        daily: [{ $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "+09:00" } }, ...TOKEN_SUMS } }],
        byContract: [
          { $group: { _id: "$contract", totalTokens: { $sum: BILLABLE_TOKENS }, calls: { $sum: 1 } } },
          { $sort: { totalTokens: -1, _id: 1 } },
          { $limit: GROUP_LIMIT },
        ],
        byModel: [
          { $group: { _id: "$model", totalTokens: { $sum: BILLABLE_TOKENS }, calls: { $sum: 1 } } },
          { $sort: { totalTokens: -1, _id: 1 } },
          { $limit: GROUP_LIMIT },
        ],
      } },
    ]).toArray();

    const totals = facets?.totals[0];
    const tokens = tokensOf(totals);
    const creditsUsed = creditsFromTokens(tokens.inputTokens + tokens.outputTokens + tokens.cacheReadTokens);
    const creditLimit = plan.monthlyCredits ?? null;

    // 호출이 없던 날도 0으로 채운다. 막대 사이가 비면 그날을 건너뛴 것처럼 읽힌다.
    const byDay = new Map((facets?.daily ?? []).map((row) => [row._id, row]));
    const today = kstDate(at);
    const daily = [];
    for (let day = new Date(`${period.periodStart}T00:00:00.000Z`); ; day = new Date(day.getTime() + 86_400_000)) {
      const date = day.toISOString().slice(0, 10);
      const row = byDay.get(date);
      daily.push({ date, calls: row?.calls ?? 0, ...tokensOf(row) });
      if (date >= today) break;
    }

    return MonthlyUsageSchema.parse({
      ...period,
      planCode: plan.code,
      tokensPerCredit: TOKENS_PER_CREDIT,
      creditsUsed,
      creditLimit,
      creditsRemaining: creditLimit === null ? null : Math.max(creditLimit - creditsUsed, 0),
      calls: totals?.calls ?? 0,
      tokens,
      daily,
      byContract: groups(facets?.byContract ?? []),
      byModel: groups(facets?.byModel ?? []),
    });
  }

  /** 공개 요금제. 카드의 기능 줄은 플랜이 실제로 여는 기능에서 나온다. */
  async plans(): Promise<PlanSummary[]> {
    const rows = await mongoCollections(this.context.db).plans.find({ isPublicListed: true }, { sort: { sortOrder: 1 } }).toArray();
    return rows.map((plan) => PlanSummarySchema.parse({
      code: plan.code,
      displayName: plan.displayName,
      monthlyPriceKrw: plan.monthlyPriceKrw,
      monthlyCredits: plan.monthlyCredits,
      capabilities: EntitlementCapabilitySchema.options.filter((capability) => capabilityEnabled(plan.code, plan.features, capability)),
    }));
  }
}
