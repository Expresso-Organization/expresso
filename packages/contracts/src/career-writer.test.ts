import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CareerWriterCreateSchema, CareerWriterPatchSchema, CareerWriterIfMatchSchema, CareerWriterMoveSchema, CareerWriterRelationSchema } from "./career-writer.js";
import { careerWriterOpenApi } from "./career-writer-openapi.js";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { ApiErrorResponseSchema } from "./common.js";
const fixture = JSON.parse(readFileSync(new URL("../openapi/fixtures/career-writer-v1.json", import.meta.url), "utf8"));
const validators = { create: CareerWriterCreateSchema, patch: CareerWriterPatchSchema, ifMatch: CareerWriterIfMatchSchema, move: CareerWriterMoveSchema, relation: CareerWriterRelationSchema };
describe("prepared Spring Career writer contract", () => {
  it("accepts the shared MVC and authentication filter error envelopes", () => {
    const errors = JSON.parse(readFileSync(new URL("../openapi/fixtures/career-writer-errors-v1.json", import.meta.url), "utf8"));
    const ajv = new Ajv2020({ strict: true }); addFormats.default(ajv);
    const validate = ajv.compile(careerWriterOpenApi.components.schemas.ApiErrorResponse);
    for (const response of Object.values(errors)) {
      expect(ApiErrorResponseSchema.safeParse(response).success).toBe(true);
      expect(validate(response)).toBe(true);
    }
  });
  it("agrees with the shared Java input cases", () => {
    for (const item of fixture.cases) {
      const schema = validators[item.kind as keyof typeof validators];
      expect(schema.safeParse(item.input).success, item.name).toBe(item.valid);
    }
  });
  it("publishes only command paths in a separate OpenAPI document", () => {
    expect(Object.keys(careerWriterOpenApi.paths)).toEqual([
      "/v1/career/records", "/v1/career/records/{id}", "/v1/career/records/{id}/restore",
      "/v1/career/records/{id}/move/preview", "/v1/career/records/{id}/move", "/v1/career/records/{id}/relations",
    ]);
    expect(JSON.stringify(careerWriterOpenApi.paths)).not.toMatch(/blockBody|bodyMd|documentVersion/);
    expect("get" in careerWriterOpenApi.paths["/v1/career/records/{id}/relations"]).toBe(false);
  });
  it("documents structural input boundaries including safe integer ETags", () => {
    const ajv = new Ajv2020({ strict: true }); addFormats.default(ajv);
    const schemas = careerWriterOpenApi.components.schemas;
    const names = { create: "CareerWriterCreate", patch: "CareerWriterPatch", ifMatch: "CareerWriterIfMatch", move: "CareerWriterMove", relation: "CareerWriterRelation" } as const;
    // option·date 순서·ID 중복의 의미 검증은 Zod/Java가 담당합니다.
    for (const item of fixture.cases.filter((item: { structural?: boolean }) => item.structural !== false)) {
      const validate = ajv.compile(schemas[names[item.kind as keyof typeof names]]);
      expect(validate(item.input), item.name).toBe(item.valid);
    }
  });
});
