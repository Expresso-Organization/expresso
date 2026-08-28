import { type EntitlementCapability, type PlanCode } from "@expresso/contracts";

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
