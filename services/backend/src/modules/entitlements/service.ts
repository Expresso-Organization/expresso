import { type KstMonthlyPeriod, kstMonthlyPeriod, capabilityEnabled, EntitlementSubjectNotFoundError, configuredBoolean } from "./public.js";
export { type KstMonthlyPeriod, kstMonthlyPeriod, capabilityEnabled, EntitlementSubjectNotFoundError } from "./public.js";
import {
  EntitlementDecisionSchema,
  type EntitlementCapability,
  type EntitlementDecision,
  type PlanCode,
} from "@expresso/contracts";
import type { SqlTag } from "../../platform/mysql.js";

type DatabaseClient = SqlTag | SqlTag;

interface EntitlementSubjectRow {
  plan_code: PlanCode;
  generation_quota: number;
  features: Record<string, unknown>;
}

interface UsageRow {
  used: number;
}

function generationUnlimited(
  planCode: PlanCode,
  features: Record<string, unknown>,
): boolean {
  return configuredBoolean(features, "generation.unlimited")
    ?? planCode !== "free";
}

export class EntitlementService {
  readonly #sql: DatabaseClient;

  constructor(sql: DatabaseClient) {
    this.#sql = sql;
  }

  async check(
    userId: string,
    capability: EntitlementCapability,
    at = new Date(),
  ): Promise<EntitlementDecision> {
    const subjects = await this.#sql<EntitlementSubjectRow[]>`
      select
        plan.code as plan_code,
        plan.generation_quota,
        plan.features
      from \`user\` as account
      join plan on plan.id = account.plan_id
      where account.id = ${userId}
        and account.deletion_requested_at is null
    `;
    const subject = subjects[0];
    if (!subject) throw new EntitlementSubjectNotFoundError();

    if (!capabilityEnabled(subject.plan_code, subject.features, capability)) {
      return EntitlementDecisionSchema.parse({
        capability,
        planCode: subject.plan_code,
        allowed: false,
        reason: "PLAN_REQUIRED",
      });
    }

    if (capability !== "portfolio.generate") {
      return EntitlementDecisionSchema.parse({
        capability,
        planCode: subject.plan_code,
        allowed: true,
        reason: "ENTITLED",
      });
    }

    const period = kstMonthlyPeriod(at);
    const usages = await this.#sql<UsageRow[]>`
      select used
      from usage_counter
      where user_id = ${userId}
        and period_start = ${period.periodStart}
    `;
    const used = usages[0]?.used ?? 0;
    const unlimited = generationUnlimited(subject.plan_code, subject.features);
    const limit = unlimited ? null : subject.generation_quota;
    const remaining = limit === null ? null : Math.max(limit - used, 0);
    const allowed = limit === null || used < limit;

    return EntitlementDecisionSchema.parse({
      capability,
      planCode: subject.plan_code,
      allowed,
      reason: allowed ? "ENTITLED" : "QUOTA_EXHAUSTED",
      usage: {
        periodStart: period.periodStart,
        resetsAt: period.resetsAt,
        used,
        limit,
        remaining,
      },
    });
  }
}
