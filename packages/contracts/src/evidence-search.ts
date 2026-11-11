import { z } from "zod";
import { CareerRecordStatusSchema } from "./career.js";
import { ListJobPostingsQuerySchema } from "./job-board.js";

export const EvidenceSearchInputSchema = z.strictObject({
  query: z.string().trim().min(1).max(300),
  mode: z.enum(["keyword", "hybrid"]).default("keyword"),
  limit: z.number().int().min(1).max(20).default(8),
});
export const EvidenceHitSchema = z.strictObject({
  recordId: z.uuid(), title: z.string(), status: CareerRecordStatusSchema, blockId: z.string().nullable(),
  quote: z.string().min(1).max(1800), source: z.enum(["title", "body", "property"]),
  fingerprint: z.string(), recordVersion: z.number(), documentVersion: z.number().nullable(),
  score: z.number().finite(),
});
export const SearchMetaSchema = z.strictObject({
  mode: z.enum(["keyword", "hybrid"]), complete: z.boolean(), scanned: z.number().int(),
  notices: z.array(z.string()),
});
export const EvidenceSearchResultSchema = z.strictObject({ hits: z.array(EvidenceHitSchema), meta: SearchMetaSchema });
export const EvidenceSearchResponseSchema = z.strictObject({ data: EvidenceSearchResultSchema });
export const SemanticJobInputSchema = z.strictObject({
  query: z.string().trim().min(1).max(300),
  mode: z.enum(["keyword", "hybrid"]).default("keyword"),
  recordIds: z.array(z.uuid()).max(8).default([]),
  filters: ListJobPostingsQuerySchema.omit({ q: true, page: true, limit: true, sort: true }).extend({ remote: z.boolean().optional(), interested: z.boolean().optional() }).default({}),
  limit: z.number().int().min(1).max(20).default(8),
});
export const SemanticJobResultSchema = z.strictObject({
  hits: z.array(z.strictObject({
    jobId: z.uuid(), title: z.string(), quote: z.string(), score: z.number().finite(),
    fingerprint: z.string(), reasons: z.array(z.string()),
  })),
  meta: SearchMetaSchema,
});
export const SemanticJobResponseSchema = z.strictObject({ data: SemanticJobResultSchema });
export const SearchSyncResponseSchema = z.strictObject({ data: z.strictObject({ indexed: z.number().int(), complete: z.boolean() }) });
export type EvidenceSearchInput = z.infer<typeof EvidenceSearchInputSchema>;
export type EvidenceSearchResult = z.infer<typeof EvidenceSearchResultSchema>;
export type SemanticJobInput = z.infer<typeof SemanticJobInputSchema>;
export type SemanticJobResult = z.infer<typeof SemanticJobResultSchema>;
