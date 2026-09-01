import SwaggerParser from "@apidevtools/swagger-parser";
import { Ajv2020 } from "ajv/dist/2020.js";
import * as addFormatsModule from "ajv-formats";
import type { AnySchema, ValidateFunction } from "ajv";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

type HttpMethod = "get" | "post" | "patch";

interface SchemaObject extends Record<string, unknown> {
  pattern?: string;
}

interface ParameterObject {
  name: string;
  in: string;
  required?: boolean;
  schema?: SchemaObject;
}

interface MediaTypeObject {
  schema: SchemaObject;
}

interface RequestBodyObject {
  required?: boolean;
  content: Record<string, MediaTypeObject>;
}

interface HeaderObject {
  schema?: SchemaObject;
}

interface ResponseObject {
  headers?: Record<string, HeaderObject>;
  content?: Record<string, MediaTypeObject>;
}

interface OperationObject {
  parameters?: ParameterObject[];
  requestBody?: RequestBodyObject;
  responses: Record<string, ResponseObject>;
  "x-idempotency"?: unknown;
}

interface PathItemObject {
  get?: OperationObject;
  post?: OperationObject;
  patch?: OperationObject;
}

interface CareerSliceContract {
  openapi: string;
  security?: Array<Record<string, unknown>>;
  paths: Record<string, PathItemObject>;
  components: {
    schemas: Record<string, SchemaObject>;
    securitySchemes: Record<string, Record<string, unknown>>;
  };
}

const contractPath = fileURLToPath(
  new URL("../openapi/career-record-slice-v1.yaml", import.meta.url),
);

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormatsModule.default.default(ajv);

let contract: CareerSliceContract;

function operation(path: string, method: HttpMethod): OperationObject {
  const value = contract.paths[path]?.[method];
  expect(value, `${method.toUpperCase()} ${path}`).toBeDefined();
  return value as OperationObject;
}

function requiredHeader(
  operationObject: OperationObject,
  name: string,
): ParameterObject {
  const header = operationObject.parameters?.find(
    (parameter) =>
      parameter.in === "header" &&
      parameter.name.toLowerCase() === name.toLowerCase(),
  );
  expect(header, `${name} header`).toEqual(
    expect.objectContaining({ required: true }),
  );
  return header as ParameterObject;
}

function response(
  operationObject: OperationObject,
  status: string,
): ResponseObject {
  const value = operationObject.responses[status];
  expect(value, `${status} response`).toBeDefined();
  return value as ResponseObject;
}

function schemaValidator(name: string): ValidateFunction {
  const schema = contract.components.schemas[name];
  expect(schema, `${name} schema`).toBeDefined();
  return ajv.compile(schema as AnySchema);
}

describe("CareerRecord Spring Slice 1 OpenAPI contract", () => {
  beforeAll(async () => {
    await SwaggerParser.validate(contractPath);
    contract = (await SwaggerParser.dereference(
      contractPath,
    )) as unknown as CareerSliceContract;
  });

  it("declares only the first-slice paths behind bearer authentication", () => {
    expect(contract.openapi).toBe("3.1.0");
    expect(Object.keys(contract.paths).sort()).toEqual([
      "/v1/career/categories",
      "/v1/career/records",
      "/v1/career/records/{recordId}",
    ]);
    expect(contract.security).toEqual([{ bearerAuth: [] }]);
    expect(contract.components.securitySchemes.bearerAuth).toEqual({
      type: "http",
      scheme: "bearer",
    });

    operation("/v1/career/categories", "get");
    operation("/v1/career/records", "post");
    operation("/v1/career/records/{recordId}", "get");
    operation("/v1/career/records/{recordId}", "patch");
  });

  it("makes create idempotency and update preconditions explicit", () => {
    const create = operation("/v1/career/records", "post");
    const update = operation("/v1/career/records/{recordId}", "patch");

    requiredHeader(create, "Idempotency-Key");
    expect(create.requestBody?.required).toBe(true);
    response(create, "201");
    response(create, "200");
    response(create, "409");
    expect(create["x-idempotency"]).toEqual({
      scope: "authenticated-user",
      header: "Idempotency-Key",
      sameKeySameRequest: "return-same-record",
      sameKeyDifferentRequest: "409",
    });

    const ifMatch = requiredHeader(update, "If-Match");
    expect(ifMatch.schema?.pattern).toBe('^"v[1-9][0-9]*"$');
    expect(update.requestBody?.required).toBe(true);
    response(update, "200");
    response(update, "404");
    response(update, "412");
  });

  it("uses the same quoted version format for If-Match and every record ETag", () => {
    const create = operation("/v1/career/records", "post");
    const get = operation("/v1/career/records/{recordId}", "get");
    const update = operation("/v1/career/records/{recordId}", "patch");
    const expectedPattern = requiredHeader(update, "If-Match").schema?.pattern;

    for (const [operationObject, status] of [
      [create, "201"],
      [create, "200"],
      [get, "200"],
      [update, "200"],
    ] as const) {
      expect(response(operationObject, status).headers?.ETag?.schema?.pattern).toBe(
        expectedPattern,
      );
    }
  });

  it("accepts the canonical record and rejects legacy or out-of-slice shapes", () => {
    const validateRecord = schemaValidator("CareerRecord");
    const canonicalRecord = {
      id: "1044d680-6f5b-4f6a-90b7-20f7ba5eddf5",
      categoryId: "54e2b29a-d2ba-4c80-a4bc-1c1d08740497",
      title: "결제 안정화",
      propertyValues: [
        {
          propertyDefinitionId: "7e96f07a-30ba-496e-ac9d-20d4421c1703",
          type: "text",
          value: "백엔드 개발자",
        },
      ],
      blockBody: {
        schemaVersion: 1,
        type: "doc",
        content: [
          {
            id: "4757df92-59c2-48fc-bf9b-dc25f25d193f",
            type: "paragraph",
            attrs: {},
            text: [{ text: "장애율을 낮춘 기록" }],
          },
        ],
      },
      version: 3,
      updatedAt: "2026-09-01T08:00:00Z",
    };

    expect(validateRecord(canonicalRecord), ajv.errorsText(validateRecord.errors)).toBe(
      true,
    );
    expect(validateRecord({ ...canonicalRecord, bodyMd: "legacy" })).toBe(false);
    expect(validateRecord({ ...canonicalRecord, status: "draft" })).toBe(false);
    expect(
      validateRecord({
        ...canonicalRecord,
        propertyValues: [
          { key: "role", type: "text", value: "백엔드 개발자" },
        ],
      }),
    ).toBe(false);
    expect(
      validateRecord({
        ...canonicalRecord,
        propertyValues: [
          {
            propertyDefinitionId: "7e96f07a-30ba-496e-ac9d-20d4421c1703",
            type: "number",
            value: 3,
          },
        ],
      }),
    ).toBe(false);
    expect(
      validateRecord({
        ...canonicalRecord,
        blockBody: {
          schemaVersion: 1,
          type: "doc",
          content: [
            {
              id: "4757df92-59c2-48fc-bf9b-dc25f25d193f",
              type: "heading",
              attrs: {},
              text: [{ text: "범위 밖 블록" }],
            },
          ],
        },
      }),
    ).toBe(false);
  });

  it("publishes duplicate property definitions as a domain invariant without overstating JSON Schema", () => {
    const propertyValuesSchema = contract.components.schemas.PropertyValues;
    expect(propertyValuesSchema?.uniqueItems).toBe(true);
    expect(propertyValuesSchema?.["x-expresso-uniqueBy"]).toBe(
      "propertyDefinitionId",
    );

    const validatePropertyValues = schemaValidator("PropertyValues");
    const propertyDefinitionId = "7e96f07a-30ba-496e-ac9d-20d4421c1703";
    expect(
      validatePropertyValues([
        { propertyDefinitionId, type: "text", value: "백엔드 개발자" },
        { propertyDefinitionId, type: "text", value: "플랫폼 엔지니어" },
      ]),
      "JSON Schema uniqueItems는 같은 ID와 서로 다른 value를 거절하지 않는다",
    ).toBe(true);
  });

  it("limits create and patch payloads to the first-slice mutations", () => {
    const validateCreate = schemaValidator("CreateCareerRecordRequest");
    const validatePatch = schemaValidator("PatchCareerRecordRequest");
    const categoryId = "54e2b29a-d2ba-4c80-a4bc-1c1d08740497";

    expect(validateCreate({ categoryId })).toBe(true);
    expect(validateCreate({ categoryId, title: "생성 시 제목" })).toBe(false);

    expect(validatePatch({ title: "수정된 제목" })).toBe(true);
    expect(
      validatePatch({
        propertyValues: [
          {
            propertyDefinitionId: "7e96f07a-30ba-496e-ac9d-20d4421c1703",
            type: "text",
            value: "플랫폼 엔지니어",
          },
        ],
      }),
    ).toBe(true);
    expect(
      validatePatch({
        blockBody: {
          schemaVersion: 1,
          type: "doc",
          content: [
            {
              id: "4757df92-59c2-48fc-bf9b-dc25f25d193f",
              type: "paragraph",
              attrs: {},
              text: [],
            },
          ],
        },
      }),
    ).toBe(true);
    expect(validatePatch({})).toBe(false);
    expect(validatePatch({ status: "organized" })).toBe(false);
    expect(validatePatch({ bodyMd: "legacy" })).toBe(false);
    expect(validatePatch({ categoryId })).toBe(false);
  });
});
