import { creditsFromTokens, EntitlementDecisionSchema, type EntitlementCapability, type EntitlementDecision } from "@expresso/contracts";
import { mongoCollections } from "@expresso/database";
import type { MongoContext } from "../../platform/mongodb.js";
import type { MongoTransaction } from "../../platform/mongo-transaction.js";
import type { EntitlementApi } from "./index.js";
import { capabilityEnabled, EntitlementSubjectNotFoundError, kstMonthlyPeriod, tokensUsedInPeriod } from "./public.js";

export { capabilityEnabled, kstMonthlyPeriod } from "./public.js";

export class EntitlementService implements EntitlementApi {
  constructor(readonly context: MongoContext) {}

  async check(userId: string, capability: EntitlementCapability, at = new Date()): Promise<EntitlementDecision> {
    const collections = mongoCollections(this.context.db);
    const options = "session" in this.context ? { session: (this.context as MongoTransaction).session } : {};
    const account = await collections.users.findOne({ _id: userId, deletionRequestedAt: null }, options);
    const plan = account ? await collections.plans.findOne({ _id: account.planId }, options) : null;
    if (!plan) throw new EntitlementSubjectNotFoundError();
    if (!capabilityEnabled(plan.code, plan.features, capability)) {
      return EntitlementDecisionSchema.parse({ capability, planCode: plan.code, allowed: false, reason: "PLAN_REQUIRED" });
    }
    if (capability !== "portfolio.generate") return EntitlementDecisionSchema.parse({ capability, planCode: plan.code, allowed: true, reason: "ENTITLED" });
    // 한도는 생성 횟수가 아니라 이번 달 AI 사용량(크레딧)이다. 토큰을 기간 전체에서
    // 더한 뒤 한 번만 올린다 — 호출마다 올리면 작은 호출 50건이 50 크레딧이 된다.
    const period = kstMonthlyPeriod(at);
    const used = creditsFromTokens(await tokensUsedInPeriod(this.context.db, userId, period, options));
    const limit = plan.monthlyCredits ?? null;
    const allowed = limit === null || used < limit;
    return EntitlementDecisionSchema.parse({ capability, planCode: plan.code, allowed, reason: allowed ? "ENTITLED" : "QUOTA_EXHAUSTED", usage: { ...period, used, limit, remaining: limit === null ? null : Math.max(limit - used, 0) } });
  }
}

export { EntitlementService as MongoEntitlementService };
