import { z } from "zod";
import { UuidSchema } from "./common.js";

const CriterionSchema = z.strictObject({
  id: z.string().min(1),
  kind: z.enum(["must", "responsibility", "preferred"]),
  criterion: z.string().min(1),
});
export const ModelJobSchema = z.strictObject({
  jobId: UuidSchema,
  fields: z.strictObject({
    title: z.string().min(1),
    description: z.string(),
    job_category: z.string(),
  }),
  requirementsFixed: z.array(CriterionSchema),
  structuredCriteria: z.array(CriterionSchema).optional(),
});
export const ModelProfileSchema = z.strictObject({
  profileId: UuidSchema,
  experienceYears: z.number().nonnegative().nullable(),
  records: z.array(
    z.strictObject({
      recordId: UuidSchema,
      title: z.string(),
      bodyMd: z.string(),
      properties: z.record(z.string(), z.unknown()).optional(),
    }),
  ),
});
export const ModelWireRequestSchema = z.strictObject({
  profile: ModelProfileSchema,
  jobs: z.array(ModelJobSchema),
  limit: z.number().int().positive(),
  mode: z.enum(["local", "rerank", "evidence", "verify"]),
});
const ScoreSchema = z.number().min(0).max(100);
export const EvidenceQuoteSchema = z.strictObject({
  source: z.enum(["bodyMd", "title", "property"]),
  propertyKey: z.string().optional(),
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  text: z.string().min(1).max(16_000),
}).refine(q => q.end > q.start && (q.source !== "property" || !!q.propertyKey));
export type EvidenceQuote = z.infer<typeof EvidenceQuoteSchema>;
const WireRowSchema = z.strictObject({
  jobId: UuidSchema,
  localScore: ScoreSchema,
  decisionScore: ScoreSchema.nullable(),
  evidence: z.array(
    z.strictObject({
      requirementId: z.string(),
      label: z.string(),
      recordIds: z.array(UuidSchema),
      passages: z.array(z.strictObject({ recordId: UuidSchema, quote: EvidenceQuoteSchema })).default([]),
    }),
  ),
});
export const ModelWireResultSchema = z.strictObject({
  jobs: z.array(WireRowSchema),
  eligible: z.number().int().nonnegative(),
  source: z.enum(["local", "decisions", "fallback"]),
});
export const ModelAccessSchema = z.strictObject({
  available: z.boolean(),
  decisions: z.boolean(),
});
export const ModelViewSchema = z.strictObject({
  status: z.enum([
    "ok",
    "unavailable",
    "insufficient_records",
    "no_requirements",
  ]),
  source: z.enum(["local", "decisions", "fallback"]),
  examined: z.number().int().nonnegative(),
  eligible: z.number().int().nonnegative(),
  jobs: z.array(
    z.strictObject({
      jobId: UuidSchema,
      title: z.string(),
      localScore: ScoreSchema,
      decisionScore: ScoreSchema.nullable(),
      evidence: z.array(
        z.strictObject({
          label: z.string(),
          records: z.array(
            z.strictObject({ recordId: UuidSchema, title: z.string(), quote: EvidenceQuoteSchema.optional() }),
          ),
        }),
      ),
    }),
  ),
});
export type ModelView = z.infer<typeof ModelViewSchema>;
export type ModelJob = z.infer<typeof ModelJobSchema>;
export type ModelProfile = z.infer<typeof ModelProfileSchema>;
export type ModelWireRequest = z.infer<typeof ModelWireRequestSchema>;
export type ModelWireResult = z.infer<typeof ModelWireResultSchema>;
