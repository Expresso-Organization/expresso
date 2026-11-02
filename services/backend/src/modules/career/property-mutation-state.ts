import { createHash } from "node:crypto";
import { CareerPropertyMutationJobPlanSchema, type CareerPropertyMutationJobPlan } from "@expresso/contracts";
import type { CareerPropertyMutationDoc } from "@expresso/database";

export function mutationCanonicalJson(value: unknown): string {
  if(Array.isArray(value)) return `[${value.map(mutationCanonicalJson).join(",")}]`;
  if(value && typeof value==="object") return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${mutationCanonicalJson((value as Record<string,unknown>)[key])}`).join(",")}}`;
  const result=JSON.stringify(value);if(result===undefined) throw new Error("mutation plan must contain JSON values");return result;
}
export function mutationFingerprint(value: unknown): string {return createHash("sha256").update(mutationCanonicalJson(value)).digest("hex");}
export function mutationJobPlan(job: CareerPropertyMutationDoc): CareerPropertyMutationJobPlan {
  if(createHash("sha256").update(job.planJson).digest("hex")!==job.operationFingerprint) throw new Error("mutation plan fingerprint mismatch");
  const plan=CareerPropertyMutationJobPlanSchema.parse(JSON.parse(job.planJson));
  if(plan.userId!==job.userId || plan.categoryId!==job.categoryId || plan.operation.target.id!==job.propertyId) throw new Error("mutation plan scope mismatch");
  return plan;
}
