import {
  EntitlementDecisionSchema,
  type EntitlementCapability,
  type EntitlementDecision,
  type PlanCode,
} from "@expresso/contracts";
import type postgres from "postgres";

type DatabaseClient = postgres.Sql | postgres.TransactionSql;

interface EntitlementSubjectRow {
  plan_code: PlanCode;
  generation_quota: number;
  features: Record<string, unknown>;
}

interface UsageRow {
  used: number;
}

export interface KstMonthlyPeriod {
  periodStart: string;
  resetsAt: string;
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1_000;

const DEFAULT_CAPABILITY_MATRIX: Record<
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

function twoDigits(value: number): string {
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

function configuredBoolean(
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

function generationUnlimited(
  planCode: PlanCode,
  features: Record<string, unknown>,
): boolean {
  return configuredBoolean(features, "generation.unlimited")
    ?? planCode !== "free";
}

export class EntitlementSubjectNotFoundError extends Error {
  constructor() {
    super("entitlement subject not found");
    this.name = "EntitlementSubjectNotFoundError";
  }
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
      from "user" as account
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
