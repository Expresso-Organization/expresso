import { z } from "zod";
import { CareerBusinessDecimalSchema, CareerBusinessPropertyValueSchema, CareerBusinessRecordSchema } from "./career-business.js";
import { CareerPropertiesSchema, CareerPropertyValueSchema } from "./career-property-values.js";
import { CareerWriterPropertyDeltaSchema } from "./career-writer.js";

/** 응답 projection은 긴 원본 십진 문자열도 보존합니다. 기존 properties 쓰기 한도는 유지합니다. */
export const CareerProductPropertiesSchema = z.record(
  CareerPropertiesSchema.keyType,
  z.union([
    CareerPropertyValueSchema,
    CareerBusinessDecimalSchema,
    CareerBusinessPropertyValueSchema.options[0].omit({ propertyDefinitionId: true }),
    CareerBusinessPropertyValueSchema.options[6].omit({ propertyDefinitionId: true }),
  ]),
);

export const CareerProductTitleSchema = CareerBusinessRecordSchema.shape.title;

/** 기존 제품 응답에 추가하는 원본 값입니다. 누락과 빈 배열을 구분합니다. */
export const CareerProductPropertyValuesSchema = z.array(CareerBusinessPropertyValueSchema).max(50).refine(
  (values) => new Set(values.map((value) => value.propertyDefinitionId)).size === values.length,
  { message: "duplicate propertyDefinitionId" },
);

/** 정의 ID 단위로 편집하며 포함하지 않은 속성은 그대로 보존합니다. */
export const CareerProductPropertyDeltaSchema = CareerWriterPropertyDeltaSchema;

export type CareerProductPropertyValues = z.infer<typeof CareerProductPropertyValuesSchema>;
export type CareerProductPropertyDelta = z.infer<typeof CareerProductPropertyDeltaSchema>;