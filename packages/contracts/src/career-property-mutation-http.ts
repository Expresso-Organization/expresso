import { z } from "zod";
import { TimestampSchema, UuidSchema } from "./common.js";
import { CareerPropertyMutationCommitSchema } from "./career-property-mutation.js";

export const CareerPropertyMutationScopeSchema = z.strictObject({
  userId: UuidSchema, mutationId: UuidSchema, recordId: UuidSchema,
  operationFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
});
export const CareerPropertyMutationServiceClaimsSchema = CareerPropertyMutationScopeSchema.extend({
  audience: z.literal("career-property-mutation"), expiresAt: TimestampSchema,
});
export const CareerPropertyMutationReceiptRequestSchema = CareerPropertyMutationScopeSchema.omit({userId:true});
export const CareerPropertyMutationReadRequestSchema = CareerPropertyMutationReceiptRequestSchema.extend({leaseToken:UuidSchema});
export const CareerPropertyMutationHttpCommitRequestSchema = CareerPropertyMutationCommitSchema;
export type CareerPropertyMutationScope = z.infer<typeof CareerPropertyMutationScopeSchema>;
export type CareerPropertyMutationServiceClaims = z.infer<typeof CareerPropertyMutationServiceClaimsSchema>;
export type CareerPropertyMutationReceiptRequest = z.infer<typeof CareerPropertyMutationReceiptRequestSchema>;
export type CareerPropertyMutationReadRequest = z.infer<typeof CareerPropertyMutationReadRequestSchema>;
export type CareerPropertyMutationHttpCommitRequest = z.infer<typeof CareerPropertyMutationHttpCommitRequestSchema>;
