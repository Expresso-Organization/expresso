import { z } from "zod";
import { TimestampSchema,UuidSchema } from "./common.js";
export const CareerPropertyMutationStatusSchema=z.strictObject({
 id:UuidSchema,categoryId:UuidSchema,propertyId:UuidSchema,status:z.enum(["pending","running","failed","completed"]),active:z.boolean(),
 processedCount:z.number().int().min(0).max(10000),totalCount:z.number().int().min(0).max(10000),retryable:z.boolean(),updatedAt:TimestampSchema,completedAt:TimestampSchema.nullable(),
}).refine(value=>value.processedCount<=value.totalCount&&value.retryable===(value.status==="failed"&&value.active),{message:"mutation progress is inconsistent"});
export const CareerResumePropertyMutationSchema=z.strictObject({});
export const CareerPropertyMutationStatusResponseSchema=z.strictObject({data:CareerPropertyMutationStatusSchema});
export type CareerPropertyMutationStatus=z.infer<typeof CareerPropertyMutationStatusSchema>;
export type CareerPropertyMutationStatusResponse=z.infer<typeof CareerPropertyMutationStatusResponseSchema>;
