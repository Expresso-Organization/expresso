import { z } from "zod";
import { TimestampSchema,UuidSchema } from "./common.js";
/** 202는 owner가 실제로 미완료인 경우에만 사용하며 기존 완료 응답과 구분합니다. */
export const CareerWriteOperationSchema=z.strictObject({
 operationId:UuidSchema,
 producer:z.enum(["career-product","ai-proposal","interview"]),
 state:z.enum(["pending","running","retry","completed","cancelled","recovery-required"]),
 recordId:UuidSchema.nullable(),
 owners:z.strictObject({business:z.enum(["not-required","pending","completed"]),document:z.enum(["not-required","pending","completed"])}),
 statusUrl:z.string().regex(/^\/v1\/career\/write-operations\/[0-9a-f-]{36}$/),
 retryable:z.boolean(),updatedAt:TimestampSchema,
}).superRefine((value,context)=>{
 if(value.statusUrl!==`/v1/career/write-operations/${value.operationId}`)context.addIssue({code:"custom",path:["statusUrl"],message:"status URL must match operation ID"});
 if(value.owners.business==="not-required"&&value.owners.document==="not-required")context.addIssue({code:"custom",message:"at least one owner required"});
 if(value.state==="completed"&&value.recordId===null)context.addIssue({code:"custom",path:["recordId"],message:"completed record ID required"});
 if(value.state==="completed"&&Object.values(value.owners).some(state=>state==="pending"))context.addIssue({code:"custom",message:"completed owner receipts required"});
 if(value.retryable!==["pending","running","retry"].includes(value.state))context.addIssue({code:"custom",path:["retryable"],message:"retry policy must match operation state"});
});
export const CareerWriteOperationResponseSchema=z.strictObject({data:CareerWriteOperationSchema});
export type CareerWriteOperation=z.infer<typeof CareerWriteOperationSchema>;
export type CareerWriteOperationResponse=z.infer<typeof CareerWriteOperationResponseSchema>;
