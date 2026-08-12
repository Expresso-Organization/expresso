import { z } from "zod";
import { TimestampSchema, UuidSchema } from "./common.js";

export const AccountExportSchema = z.strictObject({
  schemaVersion: z.literal(1),
  generatedAt: TimestampSchema,
  account: z.record(z.string(), z.unknown()),
  career: z.strictObject({ categories: z.array(z.record(z.string(), z.unknown())), records: z.array(z.record(z.string(), z.unknown())), skills: z.array(z.record(z.string(), z.unknown())) }),
  jobs: z.strictObject({ analyses: z.array(z.record(z.string(), z.unknown())), savedSearches: z.array(z.record(z.string(), z.unknown())), interests: z.array(z.record(z.string(), z.unknown())) }),
  brewing: z.strictObject({ brews: z.array(z.record(z.string(), z.unknown())), recipes: z.array(z.record(z.string(), z.unknown())) }),
  publishing: z.strictObject({ portfolios: z.array(z.record(z.string(), z.unknown())), deployments: z.array(z.record(z.string(), z.unknown())), assets: z.array(z.record(z.string(), z.unknown())) }),
  analytics: z.strictObject({ metrics: z.array(z.record(z.string(), z.unknown())), insights: z.array(z.record(z.string(), z.unknown())) }),
});

export const DeletionRequestSchema = z.strictObject({
  requestId: UuidSchema,
  status: z.enum(["pending", "cancelled", "purged"]),
  requestedAt: TimestampSchema,
  purgeAfter: TimestampSchema,
  cancellationToken: z.string().min(32).optional(),
});

export const CancelDeletionSchema = z.strictObject({ cancellationToken: z.string().min(32).max(256) });

