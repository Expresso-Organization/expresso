import { z } from "zod";
const Id = z.uuid();
export const WorkflowIntentSchema = z.enum(["portfolio", "match", "interview", "gap", "preparation", "record", "unknown"]);
export const WorkflowClaimSchema = z.strictObject({ id: Id, text: z.string().trim().min(1).max(1000), sources: z.array(z.strictObject({ recordId: Id, quote: z.string().trim().min(1).max(1500) })).min(1).max(4) });
export const WorkflowInputSchema = z.strictObject({ requestId: Id, text: z.string().trim().min(1).max(4000), intent: WorkflowIntentSchema.optional(), recordIds: z.array(Id).max(8).refine(ids => new Set(ids).size === ids.length) });
export const WorkflowDecisionSchema = z.strictObject({ expectedVersion: z.number().int().positive() });
export const WorkflowReviewInputSchema = WorkflowDecisionSchema.extend({ claims: z.array(WorkflowClaimSchema).min(1).max(16) }).refine(x => new Set(x.claims.map(c => c.id)).size === x.claims.length);
export const WorkflowVerdictSchema = z.strictObject({ claimId: Id, status: z.enum(["supported", "contradicted", "uncertain"]), reason: z.string().min(1).max(800) });
export const WorkflowReviewSchema = z.strictObject({ mode: z.enum(["exact", "ai", "unavailable"]), items: z.array(WorkflowVerdictSchema).max(16), reviewedAt: z.iso.datetime() });
export const CareerWorkflowSchema = z.strictObject({
 id: Id, conversationId: Id, requestId: Id, version: z.number().int().positive(), intent: WorkflowIntentSchema,
 status: z.enum(["waiting_for_input", "waiting_for_approval", "review_required", "handed_off", "cancelled"]),
 requestText: z.string().max(4000), reasonCodes: z.array(z.string().max(80)).max(12), question: z.string().max(1000).nullable(),
 sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
 job: z.strictObject({ id: Id, title: z.string().max(500) }).nullable(),
 records: z.array(z.strictObject({ id: Id, title: z.string().max(300), version: z.number().int().positive(), status: z.string(), text: z.string().max(12000), textHash: z.string(), truncated: z.boolean() })).max(8),
 gap: z.strictObject({ id: Id, stale: z.boolean(), summary: z.string().max(4000) }).nullable(),
 steps: z.array(z.strictObject({ key: z.string().max(50), label: z.string().max(200), status: z.enum(["pending", "complete", "waiting"]) })).max(5),
 claims: z.array(WorkflowClaimSchema).max(16), review: WorkflowReviewSchema.nullable(), brewId: Id.nullable(),
 nextPath: z.string().regex(/^\/(?!\/)[^\s]*$/).max(600).nullable(), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
});
export const WorkflowResponseSchema = z.strictObject({ data: CareerWorkflowSchema });
export const WorkflowListResponseSchema = z.strictObject({ data: z.array(CareerWorkflowSchema).max(20) });
export type WorkflowIntent = z.infer<typeof WorkflowIntentSchema>;
export type WorkflowInput = z.infer<typeof WorkflowInputSchema>;
export type WorkflowClaim = z.infer<typeof WorkflowClaimSchema>;
export type WorkflowReviewInput = z.infer<typeof WorkflowReviewInputSchema>;
export type WorkflowReview = z.infer<typeof WorkflowReviewSchema>;
export type CareerWorkflow = z.infer<typeof CareerWorkflowSchema>;
export const WorkflowOptionsResponseSchema = z.strictObject({ data: z.array(z.strictObject({ id: Id, title: z.string().max(300), status: z.string() })).max(100) });
