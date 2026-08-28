import { EntitlementDecisionSchema, type EntitlementCapability, type EntitlementDecision } from "@expresso/contracts";
import { mongoCollections } from "@expresso/database";
import type { MongoContext } from "../../platform/mongodb.js";
import type { MongoTransaction } from "../../platform/mongo-transaction.js";
import type { EntitlementApi } from "./index.js";
import { capabilityEnabled, configuredBoolean, EntitlementSubjectNotFoundError, kstMonthlyPeriod } from "./public.js";

export class MongoEntitlementService implements EntitlementApi {
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
    const period = kstMonthlyPeriod(at);
    const counter = await collections.usageCounters.findOne({ userId, periodStart: period.periodStart }, options);
    const used = counter?.used ?? 0;
    const unlimited = configuredBoolean(plan.features, "generation.unlimited") ?? plan.code !== "free";
    const limit = unlimited ? null : plan.generationQuota;
    const allowed = limit === null || used < limit;
    return EntitlementDecisionSchema.parse({ capability, planCode: plan.code, allowed, reason: allowed ? "ENTITLED" : "QUOTA_EXHAUSTED", usage: { ...period, used, limit, remaining: limit === null ? null : Math.max(limit - used, 0) } });
  }
}
