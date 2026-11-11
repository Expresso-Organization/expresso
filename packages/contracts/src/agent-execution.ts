import { z } from "zod";

export const AgentExecutionLimitsSchema = z.strictObject({
  maxToolCalls: z.number().int().min(1).max(30).default(16),
  maxModelCalls: z.number().int().min(1).max(16).default(11),
  maxInputChars: z.number().int().min(1000).max(4_000_000).default(1_000_000),
  maxCostUsd: z.number().positive().max(10).default(1),
  maxSdkTurns: z.number().int().min(1).max(16).default(8),
});
export type AgentExecutionLimits = z.infer<typeof AgentExecutionLimitsSchema>;
export const SearchMaintenanceRequestSchema = z.strictObject({ requestId: z.uuid() });
export const SearchMaintenanceResponseSchema = z.strictObject({ data: z.strictObject({ queued: z.literal(true), requestId: z.uuid() }) });
export const SearchIndexHealthResponseSchema = z.strictObject({ data: z.strictObject({
  scanned: z.number().int().nonnegative(), indexed: z.number().int().nonnegative(),
  missing: z.number().int().nonnegative(), stale: z.number().int().nonnegative(),
  orphaned: z.number().int().nonnegative(), complete: z.boolean(),
}) });
