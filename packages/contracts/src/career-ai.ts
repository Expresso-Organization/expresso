import { CareerEditCommandSchema } from "@expresso/editor/commands";
import { z } from "zod";
import { TimestampSchema, UuidSchema } from "./common.js";
import { CareerPropertyValueV2Schema } from "./career-properties.js";
import { CareerDocumentBootstrapSchema } from "./career-editor.js";
import { CareerBusinessPropertyValueSchema } from "./career-business.js";

export const AiEditProposalSchema = z.strictObject({
  proposalId: UuidSchema, recordId: UuidSchema, baseDocumentVersion: z.number().int().nonnegative(),
  selection: z.strictObject({ blockIds: z.array(UuidSchema).max(100), from: z.number().int().nonnegative().optional(), to: z.number().int().nonnegative().optional() }),
  summary: z.string().min(1).max(2_000), commands: z.array(CareerEditCommandSchema).max(100),
  propertyChanges: z.array(z.strictObject({ propertyId: UuidSchema,
    previousValue: CareerPropertyValueV2Schema.nullable().optional(), nextValue: CareerPropertyValueV2Schema.nullable().optional(),
    canonicalPreviousValue: CareerBusinessPropertyValueSchema.nullable().optional(), canonicalNextValue: CareerBusinessPropertyValueSchema.nullable().optional(),
  }).superRefine((change,context)=>{
    const legacy=change.previousValue!==undefined || change.nextValue!==undefined;
    const canonical=change.canonicalPreviousValue!==undefined || change.canonicalNextValue!==undefined;
    if(!legacy&&!canonical || legacy&&(change.previousValue===undefined || change.nextValue===undefined) || canonical&&(change.canonicalPreviousValue===undefined || change.canonicalNextValue===undefined))context.addIssue({code:"custom",message:"previous and next values must be paired"});
    if([change.canonicalPreviousValue,change.canonicalNextValue].some(value=>value!=null && value.propertyDefinitionId!==change.propertyId))context.addIssue({code:"custom",message:"canonical value ID must match propertyId"});
  })).max(50),
  createdAt: TimestampSchema, expiresAt: TimestampSchema,
});
export const AiProposalStatusSchema = z.enum(["draft", "streaming", "ready", "applied", "rejected", "cancelled", "expired", "conflicted"]);
export const AiProposalProgressSchema = z.strictObject({ phase: z.enum(["preparing", "generating", "validating"]), completed: z.number().int().nonnegative(), total: z.number().int().positive().optional() });
export const CreateAiEditProposalSchema = z.strictObject({
  selection: z.strictObject({ blockIds: z.array(UuidSchema).min(1).max(100), from: z.number().int().nonnegative().optional(), to: z.number().int().nonnegative().optional() }),
  prompt: z.string().trim().min(1).max(4_000),
});
export const AiEditProposalDetailSchema = AiEditProposalSchema.extend({ status: AiProposalStatusSchema, progress: AiProposalProgressSchema.nullable(), appliedDocumentVersion: z.number().int().nonnegative().nullable(), revisionId: UuidSchema.nullable(), undoScope: z.enum(["none", "document"]).optional(), businessChangesRetained: z.boolean().optional() });
export const AiProposalPreviewRequestSchema = z.strictObject({ recordId: UuidSchema, proposalId: UuidSchema });
export const AiProposalApplyRequestSchema = z.strictObject({
  recordId: UuidSchema, proposalId: UuidSchema, expectedDocumentVersion: z.number().int().nonnegative(),
  commandIndexes: z.array(z.number().int().nonnegative()).max(100), propertyChangeIndexes: z.array(z.number().int().nonnegative()).max(50),
});
/** owner intent가 없는 transaction의 선택 검증에서만 발행하는 확정 거부 신호입니다. */
export const AiProposalApplyRejectionSchema = z.strictObject({
  recordId: UuidSchema, proposalId: UuidSchema, state: z.literal("not-prepared"),
});
export const AiProposalRejectRequestSchema = AiProposalPreviewRequestSchema;
export const AiProposalCancelRequestSchema = AiProposalPreviewRequestSchema;
export const AiProposalUndoRequestSchema = z.strictObject({
  recordId: UuidSchema, proposalId: UuidSchema, expectedDocumentVersion: z.number().int().nonnegative(),
});
export type AiEditProposal = z.infer<typeof AiEditProposalSchema>;
export type AiEditProposalDetail = z.infer<typeof AiEditProposalDetailSchema>;
export type CreateAiEditProposal = z.infer<typeof CreateAiEditProposalSchema>;

/** 업무 값의 되돌리기를 꾸미지 않고 실제 문서 복원 대상만 알립니다. */
export const AiProposalUndoNoDocumentTargetSchema = z.strictObject({ outcome: z.literal("no-document-target"), scope: z.literal("none"), businessChangesRetained: z.literal(true) });
export const AiProposalUndoResultSchema = z.union([CareerDocumentBootstrapSchema, AiProposalUndoNoDocumentTargetSchema]);
export const AiProposalUndoResponseSchema = z.union([z.strictObject({ data: AiProposalUndoResultSchema }), CareerDocumentBootstrapSchema]);
export type AiProposalUndoResult = z.infer<typeof AiProposalUndoResultSchema>;
export type AiProposalUndoResponse = z.infer<typeof AiProposalUndoResponseSchema>;
export const AiProposalApplyResponseSchema = z.strictObject({ data: AiEditProposalDetailSchema });
export type AiProposalApplyResponse = z.infer<typeof AiProposalApplyResponseSchema>;
/** 제안 생성 순서는 서버 replay의 createdAt, ID 정렬과 같습니다. */
export function compareCareerProposalOrder(candidate: {proposalId:string;createdAt?:string|undefined}, current: {proposalId:string;createdAt?:string|undefined}):number {
 if(candidate.proposalId===current.proposalId)return 0;
 if(candidate.createdAt===undefined || current.createdAt===undefined)return candidate.createdAt===current.createdAt?0:candidate.createdAt===undefined?-1:1;
 const time=Date.parse(candidate.createdAt)-Date.parse(current.createdAt);
 return time || (candidate.proposalId>current.proposalId?1:-1);
}
