import { z } from "zod";
import {
  CareerBusinessDateValueSchema,
  CareerBusinessDecimalSchema,
  CareerBusinessPropertyValueSchema,
  CareerBusinessRecordResponseSchema,
  CareerBusinessRecordSchema,
} from "./career-business.js";

const component = (schema: z.ZodType) => {
  const { $schema: _dialect, ...definition } = z.toJSONSchema(schema, { target: "draft-2020-12", io: "output" });
  return definition;
};

// OpenAPI 3.1의 component만 제공합니다. 제품 경로에는 아직 연결하지 않습니다.
// 날짜 순서·중복 ID 같은 의미 검증은 Zod와 business domain이 담당합니다.
export const careerBusinessOpenApiComponents = {
  CareerBusinessDecimal: component(CareerBusinessDecimalSchema),
  CareerBusinessDateValue: component(CareerBusinessDateValueSchema),
  CareerBusinessPropertyValue: component(CareerBusinessPropertyValueSchema),
  CareerBusinessRecord: component(CareerBusinessRecordSchema),
  CareerBusinessRecordResponse: component(CareerBusinessRecordResponseSchema),
};
