import { z } from "zod";
import { CareerPropertyMutationCommitSchema, CareerPropertyMutationJobPlanSchema, CareerPropertyMutationReadSchema, CareerPropertyMutationResultSchema } from "./career-property-mutation.js";
const component=(schema:z.ZodType)=>{const {$schema:_dialect,...result}=z.toJSONSchema(schema,{target:"draft-2020-12",io:"input"});return result;};
// 내부 포트의 값 계약만 제공합니다. 제품 OpenAPI path에 합치지 않습니다.
export const careerPropertyMutationOpenApiComponents={
  CareerPropertyMutationCommit:component(CareerPropertyMutationCommitSchema),
  CareerPropertyMutationJobPlan:component(CareerPropertyMutationJobPlanSchema),
  CareerPropertyMutationRead:component(CareerPropertyMutationReadSchema),
  CareerPropertyMutationResult:component(CareerPropertyMutationResultSchema),
} as const;
