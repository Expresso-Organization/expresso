import { z } from "zod";
import { UuidSchema, TimestampSchema } from "./common.js";
import { CareerBusinessPropertyValueSchema, CareerBusinessRecordSchema } from "./career-business.js";
import { CareerWriterCreateSchema, CareerWriterPatchSchema } from "./career-writer.js";
import { AiProposalApplyRequestSchema, AiProposalUndoRequestSchema } from "./career-ai.js";
import { CareerEditCommandSchema } from "./career-editor.js";

const version=CareerBusinessRecordSchema.shape.version;
const nonnegative=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const CareerProducerBusinessCommandSchema=z.discriminatedUnion("kind",[
  z.strictObject({kind:z.literal("create"),expectedCategoryVersion:version,input:CareerWriterCreateSchema}),
  z.strictObject({kind:z.literal("patch"),recordId:UuidSchema,expectedVersion:version,expectedCategoryVersion:version,patches:z.array(CareerWriterPatchSchema).min(1).max(2)}),
]);
export const CareerProducerDocumentCommandSchema=z.discriminatedUnion("kind",[
  z.strictObject({kind:z.literal("commands"),recordId:UuidSchema,expectedVersion:nonnegative,commands:z.array(CareerEditCommandSchema).min(1).max(200),allowedBlockIds:z.array(UuidSchema).max(200),summary:z.string().max(1000)}),
  z.strictObject({kind:z.literal("markdown"),recordId:UuidSchema.nullable(),expectedVersion:nonnegative,markdown:z.string().max(200000),summary:z.string().max(1000)}),
  z.strictObject({kind:z.literal("restore"),recordId:UuidSchema,expectedVersion:nonnegative,snapshotId:UuidSchema,revisionId:UuidSchema,summary:z.string().max(1000)}),
]);
export const CareerProducerScopeSchema=z.object({
  producer:z.enum(["ai-proposal","interview","career-product"]),userId:UuidSchema,sourceId:UuidSchema,operationId:UuidSchema,fingerprint:z.string().regex(/^[a-f0-9]{64}$/),
});
export const CareerProducerCommitRequestSchema=CareerProducerScopeSchema.extend({leaseToken:UuidSchema}).strict();
export const CareerProducerServiceClaimsSchema=CareerProducerScopeSchema.extend({audience:z.literal("career-producer"),expiresAt:TimestampSchema}).strict();
export const CareerProducerBusinessResultSchema=z.strictObject({data:CareerBusinessRecordSchema,replayed:z.boolean()});
export const CareerProducerDocumentResultSchema=z.strictObject({
  recordId:UuidSchema,documentVersion:nonnegative,beforeSnapshotId:UuidSchema,afterSnapshotId:UuidSchema,revisionId:UuidSchema,
});
export const CareerProducerSelectedPropertyChangeSchema=z.strictObject({
  propertyId:UuidSchema,previousValue:CareerBusinessPropertyValueSchema.nullable(),nextValue:CareerBusinessPropertyValueSchema.nullable(),
}).refine(value=>[value.previousValue,value.nextValue].every(item=>item===null || item.propertyDefinitionId===value.propertyId),{message:"selected value ID must match propertyId"});
export const CareerProducerIntentSchema=CareerProducerScopeSchema.extend({
  business:CareerProducerBusinessCommandSchema.nullable(),document:CareerProducerDocumentCommandSchema.nullable(),
  state:z.enum(["pending","running","retry","completed","cancelled","blocked"]),
  leaseToken:UuidSchema.nullable(),leaseUntil:TimestampSchema.nullable(),attempts:nonnegative,fence:nonnegative,
  businessResult:CareerProducerBusinessResultSchema.nullable(),documentResult:CareerProducerDocumentResultSchema.nullable(),
  lastError:z.enum(["OWNER_CALL_FAILED","LEASE_LOST","FINALIZE_FAILED","OWNER_CONFLICT","RECOVERY_ATTEMPTS_EXHAUSTED"]).nullable(),createdAt:TimestampSchema,updatedAt:TimestampSchema,
}).strict().superRefine((intent,ctx)=>{
  if(!intent.business && !intent.document)ctx.addIssue({code:"custom",message:"at least one owner required"});
  if(intent.producer==="ai-proposal" && intent.business?.kind==="create")ctx.addIssue({code:"custom",message:"AI cannot create"});
  if(intent.state==="running" && (!intent.leaseToken || !intent.leaseUntil))ctx.addIssue({code:"custom",message:"running lease required"});
  if(intent.state==="completed" && ((intent.business && !intent.businessResult)||(intent.document && !intent.documentResult)))ctx.addIssue({code:"custom",message:"owner receipts required"});
});
export type CareerProducerBusinessCommand=z.infer<typeof CareerProducerBusinessCommandSchema>;
export type CareerProducerDocumentCommand=z.infer<typeof CareerProducerDocumentCommandSchema>;
export type CareerProducerScope=z.infer<typeof CareerProducerScopeSchema>;
export type CareerProducerCommitRequest=z.infer<typeof CareerProducerCommitRequestSchema>;
export type CareerProducerServiceClaims=z.infer<typeof CareerProducerServiceClaimsSchema>;
export type CareerProducerBusinessResult=z.infer<typeof CareerProducerBusinessResultSchema>;
export type CareerProducerDocumentResult=z.infer<typeof CareerProducerDocumentResultSchema>;
export type CareerProducerIntent=z.infer<typeof CareerProducerIntentSchema>;
export type CareerProducerSelectedPropertyChange=z.infer<typeof CareerProducerSelectedPropertyChangeSchema>;
export const PrepareCareerAiProposalSchema=AiProposalApplyRequestSchema.extend({
 operationId:UuidSchema,canonicalSelectedChanges:z.array(CareerProducerSelectedPropertyChangeSchema).max(50).optional(),
});
export const PrepareCareerAiProposalUndoSchema=AiProposalUndoRequestSchema.extend({operationId:UuidSchema});
export type PrepareCareerAiProposal=z.infer<typeof PrepareCareerAiProposalSchema>;
export type PrepareCareerAiProposalUndo=z.infer<typeof PrepareCareerAiProposalUndoSchema>;