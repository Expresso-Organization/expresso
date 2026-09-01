import { CareerEditCommandSchema } from "@expresso/editor";
import { z } from "zod";
import { TimestampSchema, UuidSchema } from "./common.js";
import { CareerPropertyValueV2Schema } from "./career-properties.js";

export const AiEditProposalSchema = z.strictObject({
  proposalId: UuidSchema, recordId: UuidSchema, baseDocumentVersion: z.number().int().nonnegative(),
  selection: z.strictObject({ blockIds: z.array(UuidSchema).max(100), from: z.number().int().nonnegative().optional(), to: z.number().int().nonnegative().optional() }),
  summary: z.string().min(1).max(2_000), commands: z.array(CareerEditCommandSchema).max(100),
  propertyChanges: z.array(z.strictObject({ propertyId: UuidSchema, previousValue: CareerPropertyValueV2Schema.nullable(), nextValue: CareerPropertyValueV2Schema.nullable() })).max(50),
  createdAt: TimestampSchema, expiresAt: TimestampSchema,
});
export const AiProposalStatusSchema = z.enum(["draft", "streaming", "ready", "applied", "rejected", "cancelled", "expired", "conflicted"]);
export const AiProposalProgressSchema = z.strictObject({ phase: z.enum(["preparing", "generating", "validating"]), completed: z.number().int().nonnegative(), total: z.number().int().positive().optional() });
export const CreateAiEditProposalSchema = z.strictObject({
  selection: z.strictObject({ blockIds: z.array(UuidSchema).min(1).max(100), from: z.number().int().nonnegative().optional(), to: z.number().int().nonnegative().optional() }),
  prompt: z.string().trim().min(1).max(4_000),
});
export const AiEditProposalDetailSchema = AiEditProposalSchema.extend({ status: AiProposalStatusSchema, progress: AiProposalProgressSchema.nullable(), appliedDocumentVersion: z.number().int().nonnegative().nullable(), revisionId: UuidSchema.nullable() });
export const AiProposalPreviewRequestSchema = z.strictObject({ recordId: UuidSchema, proposalId: UuidSchema });
export const AiProposalApplyRequestSchema = z.strictObject({
  recordId: UuidSchema, proposalId: UuidSchema, expectedDocumentVersion: z.number().int().nonnegative(),
  commandIndexes: z.array(z.number().int().nonnegative()).max(100), propertyChangeIndexes: z.array(z.number().int().nonnegative()).max(50),
});
export const AiProposalRejectRequestSchema = AiProposalPreviewRequestSchema;
export const AiProposalCancelRequestSchema = AiProposalPreviewRequestSchema;
export const AiProposalUndoRequestSchema = z.strictObject({
  recordId: UuidSchema, proposalId: UuidSchema, expectedDocumentVersion: z.number().int().nonnegative(),
});
export type AiEditProposal = z.infer<typeof AiEditProposalSchema>;
export type AiEditProposalDetail = z.infer<typeof AiEditProposalDetailSchema>;
export type CreateAiEditProposal = z.infer<typeof CreateAiEditProposalSchema>;
