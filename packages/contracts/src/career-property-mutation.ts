import { z } from "zod";
import { UuidSchema } from "./common.js";
import { CareerPropertyDefinitionV2Schema } from "./career-properties.js";
import { CareerBusinessPropertyValueSchema, CareerBusinessRecordSchema } from "./career-business.js";
import { CareerWriterPropertyDeltaSchema } from "./career-writer.js";

export const CareerPropertyMutationPlanSchema = z.strictObject({
  kind: z.enum(["default", "conversion", "deletion", "restoration"]),
  source: CareerPropertyDefinitionV2Schema.nullable(), target: CareerPropertyDefinitionV2Schema,
  defaultValue: CareerBusinessPropertyValueSchema.nullable(), confirmLossy: z.boolean(),
}).superRefine((plan, context) => {
  if ((plan.kind === "default") !== (plan.source === null) || (plan.kind === "default") !== (plan.defaultValue !== null)
    || (plan.source && plan.source.id !== plan.target.id) || (plan.defaultValue && (plan.defaultValue.propertyDefinitionId !== plan.target.id || plan.defaultValue.type !== plan.target.type))
    || (plan.kind === "deletion" ? plan.target.deletedAt === null : plan.target.deletedAt !== null)) {
    context.addIssue({ code: "custom", message: "mutation plan bindings are inconsistent" });
  }
  if(!["text","number","select","multi_select","date","checkbox","url","email","phone","file","media"].includes(plan.target.type))context.addIssue({code:"custom",message:"only writable business values can be mutated"});
});
export const CareerPropertyMutationJobPlanSchema = z.strictObject({
  userId: UuidSchema, categoryId: UuidSchema,
  categoryVersion: CareerBusinessRecordSchema.shape.version, schemaVersion: CareerBusinessRecordSchema.shape.version,
  definitions: z.array(CareerPropertyDefinitionV2Schema).max(200),
  recordIds: z.array(UuidSchema).max(10_000).refine(ids => new Set(ids).size === ids.length),
  operation: CareerPropertyMutationPlanSchema,
}).superRefine((plan,context)=>{
  const target=plan.definitions.find(definition=>definition.id===plan.operation.target.id);
  if(new Set(plan.definitions.map(definition=>definition.id)).size!==plan.definitions.length || !target || JSON.stringify(target)!==JSON.stringify(plan.operation.target))context.addIssue({code:"custom",message:"immutable target must match unique schema snapshot"});
});
export const CareerPropertyMutationCommitSchema = z.strictObject({
  mutationId: UuidSchema, recordId: UuidSchema, expectedVersion: CareerBusinessRecordSchema.shape.version,
  leaseToken: UuidSchema, operationFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  propertyValues: CareerWriterPropertyDeltaSchema,
});
export const CareerPropertyMutationResultSchema = z.strictObject({
  data: CareerBusinessRecordSchema, changed: z.boolean(), replayed: z.boolean(),
});
export const CareerPropertyMutationReadSchema = z.strictObject({
  data: CareerBusinessRecordSchema, tombstone: CareerBusinessPropertyValueSchema.nullable(),
});
export type CareerPropertyMutationPlan = z.infer<typeof CareerPropertyMutationPlanSchema>;
export type CareerPropertyMutationJobPlan = z.infer<typeof CareerPropertyMutationJobPlanSchema>;
export type CareerPropertyMutationCommit = z.infer<typeof CareerPropertyMutationCommitSchema>;
export type CareerPropertyMutationResult = z.infer<typeof CareerPropertyMutationResultSchema>;
export type CareerPropertyMutationRead = z.infer<typeof CareerPropertyMutationReadSchema>;
