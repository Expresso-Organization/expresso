import { z } from "zod";
import { TimestampSchema, UuidSchema } from "./common.js";
import { CareerPropertyDefinitionV2Schema } from "./career-properties.js";
import { CareerBusinessPropertyValueSchema, CareerBusinessRecordSchema } from "./career-business.js";
import { CareerWriterPropertyDeltaSchema } from "./career-writer.js";

export const CareerPropertyMutationPlanSchema = z.strictObject({
  kind: z.enum(["default", "conversion", "deletion", "restoration"]),
  source: CareerPropertyDefinitionV2Schema.nullable(), target: CareerPropertyDefinitionV2Schema,
  defaultValue: CareerBusinessPropertyValueSchema.nullable(), confirmLossy: z.boolean(),
}).superRefine((plan, context) => {
  const timestampAlias = !plan.target.system && ["created_time", "updated_time"].includes(plan.target.type);
  const defaultMatches = !plan.defaultValue || (timestampAlias
    ? plan.defaultValue.type === "date" && plan.defaultValue.value.precision === "datetime" && plan.defaultValue.value.end === null
    : plan.defaultValue.type === plan.target.type);
  if ((plan.kind === "default") !== (plan.source === null) || (plan.kind === "default") !== (plan.defaultValue !== null)
    || (plan.source && plan.source.id !== plan.target.id) || (plan.defaultValue && (plan.defaultValue.propertyDefinitionId !== plan.target.id || !defaultMatches))
    || (plan.kind === "deletion" ? plan.target.deletedAt === null : plan.target.deletedAt !== null)) {
    context.addIssue({ code: "custom", message: "mutation plan bindings are inconsistent" });
  }
  const relationLifecycle = !plan.target.system && plan.target.type === "relation" && ["deletion", "restoration"].includes(plan.kind) && plan.source?.type === "relation" && plan.defaultValue === null;
  if(!timestampAlias && !relationLifecycle && !["text","number","select","multi_select","date","checkbox","url","email","phone","file","media"].includes(plan.target.type))context.addIssue({code:"custom",message:"only writable business values can be mutated"});
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
const mutationCommitScope = {
  mutationId: UuidSchema, recordId: UuidSchema, expectedVersion: CareerBusinessRecordSchema.shape.version,
  leaseToken: UuidSchema, operationFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
};
const versions = z.record(UuidSchema, CareerBusinessRecordSchema.shape.version);
export const CareerRelationPropertyMutationChangesSchema = z.strictObject({
  targetRecordIds: z.array(UuidSchema).max(1000).refine(ids => new Set(ids).size === ids.length), targetRecordVersions: versions,
});
export const CareerPropertyMutationCommitSchema = z.union([
  z.strictObject({ ...mutationCommitScope, propertyValues: CareerWriterPropertyDeltaSchema }),
  z.strictObject({ ...mutationCommitScope, relationChanges: CareerRelationPropertyMutationChangesSchema }),
]);
export const CareerPropertyMutationResultSchema = z.strictObject({
  data: CareerBusinessRecordSchema, changed: z.boolean(), replayed: z.boolean(),
});
export const CareerRelationPropertyMutationEdgeSchema = z.strictObject({
  id: UuidSchema, userId: UuidSchema, sourceRecordId: UuidSchema, sourcePropertyId: UuidSchema, targetRecordId: UuidSchema,
  inversePropertyId: UuidSchema.nullable().optional(), cardinality: z.enum(["single", "multiple"]), deletePolicy: z.enum(["restrict", "nullify"]),
  createdBy: z.enum(["user", "ai"]), createdAt: TimestampSchema, updatedAt: TimestampSchema,
});
export const CareerRelationPropertyMutationTombstoneSchema = z.strictObject({
  deletionMutationId: UuidSchema, propertyId: UuidSchema, definitionVersion: CareerBusinessRecordSchema.shape.version,
  deletedAt: TimestampSchema, categoryVersion: CareerBusinessRecordSchema.shape.version, schemaVersion: CareerBusinessRecordSchema.shape.version,
  config: z.record(z.string(), z.unknown()), sourceRecordVersion: CareerBusinessRecordSchema.shape.version,
  forwardEdges: z.array(CareerRelationPropertyMutationEdgeSchema).max(1000), inverseEdges: z.array(CareerRelationPropertyMutationEdgeSchema).max(1000),
  inverseDefinitionBindings: z.array(z.strictObject({ recordId: UuidSchema, categoryId: UuidSchema,
    categoryVersion: CareerBusinessRecordSchema.shape.version, schemaVersion: CareerBusinessRecordSchema.shape.version,
    definitionId: UuidSchema, version: CareerBusinessRecordSchema.shape.version, config: z.record(z.string(), z.unknown()) })).max(1000),
  inverseRecordVersions: versions, inverseRecordReferenceVersions: z.record(UuidSchema, z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)),
});
export const CareerRelationPropertyMutationReadSchema = z.strictObject({
  data: CareerBusinessRecordSchema, relation: z.strictObject({
    edges: z.array(CareerRelationPropertyMutationEdgeSchema).max(1000), inverseEdges: z.array(CareerRelationPropertyMutationEdgeSchema).max(1000),
    targetRecordVersions: versions, tombstone: CareerRelationPropertyMutationTombstoneSchema.nullable(),
  }),
});
export const CareerPropertyMutationReadSchema = z.union([z.strictObject({
  data: CareerBusinessRecordSchema, tombstone: CareerBusinessPropertyValueSchema.nullable(),
}), CareerRelationPropertyMutationReadSchema]);
export type CareerRelationPropertyMutationChanges = z.infer<typeof CareerRelationPropertyMutationChangesSchema>;
export type CareerRelationPropertyMutationEdge = z.infer<typeof CareerRelationPropertyMutationEdgeSchema>;
export type CareerRelationPropertyMutationTombstone = z.infer<typeof CareerRelationPropertyMutationTombstoneSchema>;
export type CareerPropertyMutationPlan = z.infer<typeof CareerPropertyMutationPlanSchema>;
export type CareerPropertyMutationJobPlan = z.infer<typeof CareerPropertyMutationJobPlanSchema>;
export type CareerPropertyMutationCommit = z.infer<typeof CareerPropertyMutationCommitSchema>;
export type CareerPropertyMutationResult = z.infer<typeof CareerPropertyMutationResultSchema>;
export type CareerPropertyMutationRead = z.infer<typeof CareerPropertyMutationReadSchema>;
