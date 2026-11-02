import { z } from "zod";
import { ApiErrorResponseSchema, IdempotencyKeySchema, UuidSchema } from "./common.js";
import { careerBusinessOpenApiComponents } from "./career-business-openapi.js";
import {
  CareerWriterCreateSchema, CareerWriterPatchSchema, CareerWriterPropertyDeltaSchema, CareerWriterIfMatchSchema, CareerWriterMovePreviewInputSchema,
  CareerWriterMoveSchema, CareerWriterRelationSchema, CareerWriterRestoreSchema, CareerWriterMovePreviewResponseSchema,
} from "./career-writer.js";
const component = (schema: z.ZodType) => {
  const { $schema: _dialect, ...definition } = z.toJSONSchema(schema, { target: "draft-2020-12", io: "input" });
  return definition;
};
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const response = (name: string) => ({ description: "Business command result", headers: { ETag: { schema: ref("CareerWriterIfMatch") } }, content: { "application/json": { schema: ref(name) } } });
const error = { description: "Business command error", content: { "application/json": { schema: ref("ApiErrorResponse") } } };
const command = (operationId: string, body: string | null, options: { create?: boolean; preview?: boolean } = {}) => ({
  operationId, security: [{ opaqueSession: [] }],
  parameters: options.create ? [{ name: "Idempotency-Key", in: "header", required: true, schema: ref("CareerWriterIdempotencyKey") }] : [
    { name: "id", in: "path", required: true, schema: component(UuidSchema) },
    { name: "If-Match", in: "header", required: true, schema: ref("CareerWriterIfMatch") },
  ],
  ...(body ? { requestBody: { required: body !== "CareerWriterRestore", content: { "application/json": { schema: ref(body) } } } } : {}),
  responses: { [options.create ? "201" : "200"]: options.preview ? { description: "Signed move preview", content: { "application/json": { schema: ref("CareerWriterMovePreviewResponse") } } } : response("CareerBusinessRecordResponse"),
    "400": error, "401": error, "404": error, "409": error, "412": error, "500": error },
});
// 기존 제품 OpenAPI에는 합치지 않습니다. B2 facade가 명시적으로 사용할 별도 writer 명세입니다.
export const careerWriterOpenApi = {
  openapi: "3.1.0", info: { title: "Prepared Career business writer", version: "1.0.0" },
  paths: {
    "/v1/career/records": { post: command("createCareerBusiness", "CareerWriterCreate", { create: true }) },
    "/v1/career/records/{id}": { patch: command("patchCareerBusiness", "CareerWriterPatch"), delete: command("trashCareerBusiness", null) },
    "/v1/career/records/{id}/restore": { post: command("restoreCareerBusiness", "CareerWriterRestore") },
    "/v1/career/records/{id}/move/preview": { post: command("previewCareerBusinessMove", "CareerWriterMovePreviewInput", { preview: true }) },
    "/v1/career/records/{id}/move": { post: command("moveCareerBusiness", "CareerWriterMove") },
    "/v1/career/records/{id}/relations": { put: command("replaceCareerBusinessRelations", "CareerWriterRelation") },
  },
  components: { securitySchemes: { opaqueSession: { type: "http", scheme: "bearer", bearerFormat: "exps_ opaque session" } }, schemas: {
    ...careerBusinessOpenApiComponents,
    CareerWriterCreate: component(CareerWriterCreateSchema), CareerWriterPatch: component(CareerWriterPatchSchema),
    CareerWriterPropertyDelta: component(CareerWriterPropertyDeltaSchema),
    CareerWriterIfMatch: component(CareerWriterIfMatchSchema), CareerWriterIdempotencyKey: component(IdempotencyKeySchema),
    CareerWriterMovePreviewInput: component(CareerWriterMovePreviewInputSchema), CareerWriterMove: component(CareerWriterMoveSchema),
    CareerWriterRelation: component(CareerWriterRelationSchema), CareerWriterRestore: component(CareerWriterRestoreSchema),
    CareerWriterMovePreviewResponse: component(CareerWriterMovePreviewResponseSchema), ApiErrorResponse: component(ApiErrorResponseSchema),
  } },
} as const;
