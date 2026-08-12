import { z } from "zod";

import { TimestampSchema } from "./common.js";
import { PlanCodeSchema } from "./identity.js";

export const EntitlementCapabilitySchema = z.enum([
  "portfolio.generate",
  "recipe.auto",
  "brew.cowork",
  "template.pro",
  "analytics.full",
  "analytics.organization_domains",
  "analytics.returning_visitors",
  "export.document",
  "publishing.custom_domain",
  "publishing.remove_badge",
  "analysis.advanced",
  "collaboration.team",
]);

export const EntitlementReasonSchema = z.enum([
  "ENTITLED",
  "PLAN_REQUIRED",
  "QUOTA_EXHAUSTED",
]);

export const EntitlementUsageSchema = z.strictObject({
  periodStart: z.iso.date(),
  resetsAt: TimestampSchema,
  used: z.number().int().nonnegative(),
  limit: z.number().int().nonnegative().nullable(),
  remaining: z.number().int().nonnegative().nullable(),
});

export const EntitlementDecisionSchema = z.strictObject({
  capability: EntitlementCapabilitySchema,
  planCode: PlanCodeSchema,
  allowed: z.boolean(),
  reason: EntitlementReasonSchema,
  usage: EntitlementUsageSchema.optional(),
});

export const EntitlementCapabilityParamsSchema = z.strictObject({
  capability: EntitlementCapabilitySchema,
});

export const EntitlementDecisionResponseSchema = z.strictObject({
  data: EntitlementDecisionSchema,
});

export type EntitlementCapability = z.infer<
  typeof EntitlementCapabilitySchema
>;
export type EntitlementReason = z.infer<typeof EntitlementReasonSchema>;
export type EntitlementUsage = z.infer<typeof EntitlementUsageSchema>;
export type EntitlementDecision = z.infer<typeof EntitlementDecisionSchema>;
