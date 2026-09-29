import SwaggerParser from "@apidevtools/swagger-parser";
import { Ajv2020 } from "ajv/dist/2020.js";
import * as addFormatsModule from "ajv-formats";
import type { AnySchema, ValidateFunction } from "ajv";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

import { CareerCategorySchema } from "./career.js";

type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

interface SchemaObject extends Record<string, unknown> {
  pattern?: string;
}

interface ParameterObject {
  name: string;
  in: string;
  required?: boolean;
  schema?: SchemaObject;
}

interface ReferenceObject {
  $ref: string;
}

type MaybeReference<T> = T | ReferenceObject;

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
  headers?: Record<string, MaybeReference<HeaderObject>>;
  content?: Record<string, MediaTypeObject>;
}

interface OperationObject {
  parameters?: Array<MaybeReference<ParameterObject>>;
  requestBody?: RequestBodyObject;
  responses: Record<string, MaybeReference<ResponseObject>>;
  "x-idempotency"?: unknown;
  "x-pagination"?: unknown;
}

interface PathItemObject {
  get?: OperationObject;
  post?: OperationObject;
  put?: OperationObject;
  patch?: OperationObject;
  delete?: OperationObject;
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
const blockBodyFixtures = JSON.parse(
  readFileSync(
    new URL(
      "../openapi/fixtures/career-rich-block-body-v1.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as Record<string, unknown>;
const propertyFixture = JSON.parse(
  readFileSync(
    new URL(
      "../openapi/fixtures/career-property-canonical-v1.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as {
  category: Record<string, unknown>;
  propertyValues: Array<Record<string, unknown>>;
};

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormatsModule.default.default(ajv);

let contract: CareerSliceContract;

function resolveReference<T>(value: MaybeReference<T>): T {
  if (!("$ref" in (value as ReferenceObject))) {
    return value as T;
  }

  const reference = (value as ReferenceObject).$ref;
  expect(reference.startsWith("#/"), reference).toBe(true);
  const resolved = reference
    .slice(2)
    .split("/")
    .reduce<unknown>((current, segment) => {
      expect(current, reference).toBeTypeOf("object");
      return (current as Record<string, unknown>)[segment];
    }, contract);
  expect(resolved, reference).toBeDefined();
  return resolved as T;
}

function operation(path: string, method: HttpMethod): OperationObject {
  const value = contract.paths[path]?.[method];
  expect(value, `${method.toUpperCase()} ${path}`).toBeDefined();
  return value as OperationObject;
}

function requiredHeader(
  operationObject: OperationObject,
  name: string,
): ParameterObject {
  const header = operationObject.parameters
    ?.map((parameter) => resolveReference<ParameterObject>(parameter))
    .find(
    (parameter) =>
      parameter.in === "header" &&
      parameter.name.toLowerCase() === name.toLowerCase(),
    );
  expect(header, `${name} header`).toEqual(
    expect.objectContaining({ required: true }),
  );
  return header?.schema
    ? {
        ...header,
        schema: resolveReference<SchemaObject>(
          header.schema as MaybeReference<SchemaObject>,
        ),
      }
    : header as ParameterObject;
}

function response(
  operationObject: OperationObject,
  status: string,
): ResponseObject {
  const value = operationObject.responses[status];
  expect(value, `${status} response`).toBeDefined();
  return resolveReference<ResponseObject>(value as MaybeReference<ResponseObject>);
}

function responseHeader(
  responseObject: ResponseObject,
  name: string,
): HeaderObject {
  const value = responseObject.headers?.[name];
  expect(value, `${name} response header`).toBeDefined();
  const header = resolveReference<HeaderObject>(
    value as MaybeReference<HeaderObject>,
  );
  return header.schema
    ? {
        ...header,
        schema: resolveReference<SchemaObject>(
          header.schema as MaybeReference<SchemaObject>,
        ),
      }
    : header;
}

function schemaValidator(name: string): ValidateFunction {
  const schema = contract.components.schemas[name];
  expect(schema, `${name} schema`).toBeDefined();
  return ajv.compile({
    $ref: `#/components/schemas/${name}`,
    components: { schemas: contract.components.schemas },
  } as AnySchema);
}

describe("CareerRecord Spring Slice 1 OpenAPI contract", () => {
  beforeAll(async () => {
    await SwaggerParser.validate(contractPath);
    contract = (await SwaggerParser.parse(
      contractPath,
    )) as unknown as CareerSliceContract;
  });

  it("declares only the first-slice paths behind bearer authentication", () => {
    expect(contract.openapi).toBe("3.1.0");
    expect(Object.keys(contract.paths).sort()).toEqual([
      "/v1/career/categories",
      "/v1/career/categories/{categoryId}/property-schema/apply",
      "/v1/career/categories/{categoryId}/property-schema/preview",
      "/v1/career/records",
      "/v1/career/records/{recordId}",
      "/v1/career/records/{recordId}/move",
      "/v1/career/records/{recordId}/move/preview",
      "/v1/career/records/{recordId}/relations",
      "/v1/career/records/{recordId}/restore",
    ]);
    expect(contract.security).toEqual([{ bearerAuth: [] }]);
    expect(contract.components.securitySchemes.bearerAuth).toEqual({
      type: "http",
      scheme: "bearer",
    });

    operation("/v1/career/categories", "get");
    operation("/v1/career/categories", "post");
    operation("/v1/career/categories/{categoryId}/property-schema/preview", "post");
    operation("/v1/career/categories/{categoryId}/property-schema/apply", "post");
    operation("/v1/career/records", "post");
    operation("/v1/career/records", "get");
    operation("/v1/career/records/{recordId}", "get");
    operation("/v1/career/records/{recordId}", "patch");
    operation("/v1/career/records/{recordId}", "delete");
    operation("/v1/career/records/{recordId}/relations", "put");
    operation("/v1/career/records/{recordId}/restore", "post");

    response(operation("/v1/career/records", "post"), "404");
  });

  it("defines optimistic replacement of CareerRecord relation targets", () => {
    const replace = operation("/v1/career/records/{recordId}/relations", "put");
    requiredHeader(replace, "If-Match");
    const ok = response(replace, "200");
    responseHeader(ok, "ETag");
    for (const status of ["400", "401", "404", "409", "412", "500"]) {
      response(replace, status);
    }

    const validate = schemaValidator("ReplaceCareerRelationTargetsRequest");
    expect(validate({
      propertyId: "10000000-0000-4000-8000-000000000001",
      targetIds: [
        "10000000-0000-4000-8000-000000000002",
        "10000000-0000-4000-8000-000000000002",
      ],
    })).toBe(true);
    expect(validate({
      propertyId: "not-a-uuid",
      targetIds: [],
    })).toBe(false);
    expect(validate({
      propertyId: "10000000-0000-4000-8000-000000000001",
      targetIds: Array.from(
        { length: 1_001 },
        (_, index) => `10000000-0000-4000-8000-${index.toString().padStart(12, "0")}`,
      ),
    })).toBe(false);
  });

  it("defines custom Category create with the existing Fastify Web wire contract", () => {
    const create = operation("/v1/career/categories", "post");
    const created = response(create, "201");
    responseHeader(created, "ETag");
    response(create, "400");
    response(create, "401");
    response(create, "409");

    const validateRequest = schemaValidator("CreateCareerCategoryRequest");
    expect(validateRequest({
      key: "custom_projects",
      name: "사용자 프로젝트",
      icon: "sparkles",
      defaultView: "gallery",
      propertySchema: {
        impact: {
          id: "10000000-0000-4000-8000-000000000001",
          label: "성과",
          type: "number",
          required: false,
          system: false,
        },
        tools: {
          label: "도구",
          type: "tags",
          required: false,
          system: false,
        },
      },
    }), ajv.errorsText(validateRequest.errors)).toBe(true);
    expect(validateRequest({
      key: "custom_notes",
      name: "사용자 메모",
      icon: "folder",
      defaultView: "table",
      propertySchema: {
        note: { label: "메모", type: "text" },
      },
    }), ajv.errorsText(validateRequest.errors)).toBe(true);
    expect(validateRequest({
      key: "System_Category",
      name: "잘못된 카테고리",
      icon: "folder",
      defaultView: "table",
      propertySchema: {},
    })).toBe(false);
    expect(validateRequest({
      key: "custom",
      name: "사용자 카테고리",
      icon: "folder",
      defaultView: "table",
      propertySchema: {},
      isSystem: true,
    })).toBe(false);
  });

  it("defines PropertyDefinition create/rename/reorder preview and apply with the existing Web wire contract", () => {
    const preview = operation("/v1/career/categories/{categoryId}/property-schema/preview", "post");
    const apply = operation("/v1/career/categories/{categoryId}/property-schema/apply", "post");
    requiredHeader(apply, "If-Match");
    requiredHeader(apply, "Idempotency-Key");
    response(preview, "200");
    response(preview, "400");
    response(preview, "404");
    const applied = response(apply, "200");
    responseHeader(applied, "ETag");
    response(apply, "400");
    response(apply, "404");
    response(apply, "403");
    response(apply, "409");

    const propertyId = "10000000-0000-4000-8000-000000000001";
    const change = {
      kind: "create",
      property: {
        id: propertyId,
        key: "achievement",
        name: "성과",
        type: "text",
        required: false,
        system: false,
        config: {},
      },
    };
    expect(
      preview.requestBody?.content["application/json"]?.schema,
    ).toEqual({ $ref: "#/components/schemas/CareerPropertySpringChange" });
    expect(schemaValidator("CareerPropertyCreateChange")(change)).toBe(true);
    expect(schemaValidator("CareerPropertyCreateChange")({ change })).toBe(false);
    expect(schemaValidator("CareerPropertyCreateChange")({
      ...change,
      property: { ...change.property, required: true },
    })).toBe(false);
    const validateCreate = schemaValidator("CareerPropertyCreateChange");
    const specialChanges = [
      {
        ...change,
        property: {
          ...change.property,
          type: "relation",
          config: {
            targetCategoryId: "10000000-0000-4000-8000-000000000002",
            inversePropertyId: null,
            cardinality: "multiple",
            deletePolicy: "nullify",
          },
        },
      },
      {
        ...change,
        property: {
          ...change.property,
          type: "formula",
          config: { source: "1 + 2", ast: null, diagnostics: [] },
        },
      },
      {
        ...change,
        property: {
          ...change.property,
          type: "rollup",
          config: {
            relationPropertyId: "10000000-0000-4000-8000-000000000003",
            targetPropertyId: "10000000-0000-4000-8000-000000000004",
            aggregation: "sum",
          },
        },
      },
    ];
    for (const specialChange of specialChanges) {
      expect(validateCreate(specialChange)).toBe(true);
      expect(schemaValidator("CareerPropertySpringChange")(specialChange)).toBe(true);
      expect(schemaValidator("ApplyCareerPropertyChangeRequest")({
        change: specialChange,
        previewToken: "a".repeat(32),
        confirmLossy: false,
      })).toBe(true);
      expect(validateCreate({
        ...specialChange,
        property: { ...specialChange.property, config: {} },
      })).toBe(false);
      expect(validateCreate({
        ...specialChange,
        property: { ...specialChange.property, config: undefined },
      })).toBe(false);
    }
    expect(validateCreate({
      ...specialChanges[0],
      property: {
        ...specialChanges[0]!.property,
        config: { ...specialChanges[0]!.property.config, cardinality: "many" },
      },
    })).toBe(false);
    expect(validateCreate({
      ...specialChanges[1],
      property: {
        ...specialChanges[1]!.property,
        config: { ...specialChanges[1]!.property.config, diagnostics: "none" },
      },
    })).toBe(false);
    expect(validateCreate({
      ...specialChanges[1],
      property: {
        ...specialChanges[1]!.property,
        config: { source: "eval('x')", ast: null, diagnostics: [] },
      },
    })).toBe(false);
    expect(validateCreate({
      ...specialChanges[1],
      property: {
        ...specialChanges[1]!.property,
        config: {
          source: "1 + true",
          ast: null,
          diagnostics: [{
            code: "invalid_operator",
            message: "타입 오류",
            severity: "error",
            start: 0,
            end: 8,
          }],
        },
      },
    })).toBe(false);
    expect(validateCreate({
      ...specialChanges[2],
      property: {
        ...specialChanges[2]!.property,
        config: { ...specialChanges[2]!.property.config, aggregation: "median" },
      },
    })).toBe(false);
    for (const writableType of [
      "text", "number", "checkbox", "date", "url", "email", "phone", "file", "media",
    ]) {
      expect(validateCreate({
        ...change,
        property: { ...change.property, type: writableType, config: {} },
      })).toBe(true);
    }
    for (const writableType of ["select", "multi_select"]) {
      expect(validateCreate({
        ...change,
        property: { ...change.property, type: writableType, config: { options: [] } },
      })).toBe(true);
    }
    expect(validateCreate({
      ...change,
      property: { ...change.property, type: "text", config: { unexpected: true } },
    })).toBe(false);
    expect(validateCreate({
      ...change,
      property: { ...change.property, type: "select", config: {} },
    })).toBe(false);
    expect(schemaValidator("CareerPropertySpringChange")({
      kind: "rename",
      propertyId,
      name: "담당 역할",
    })).toBe(true);
    expect(schemaValidator("CareerPropertySpringChange")({
      kind: "rename",
      propertyId,
      name: "",
    })).toBe(false);
    expect(schemaValidator("CareerPropertySpringChange")({
      kind: "reorder",
      propertyId,
      order: 4,
    })).toBe(true);
    expect(schemaValidator("CareerPropertySpringChange")({
      kind: "reorder",
      propertyId,
      order: -1,
    })).toBe(false);
    expect(schemaValidator("ApplyCareerPropertyChangeRequest")({
      change,
      previewToken: "a".repeat(32),
      confirmLossy: false,
    })).toBe(true);

    const existingWebCategory = {
        id: "10000000-0000-4000-8000-000000000002",
        key: "custom",
        name: "사용자 카테고리",
        icon: "folder",
        defaultView: "table",
        isSystem: false,
        propertySchema: {},
        propertySchemaV2: [{
          id: propertyId,
          key: "achievement",
          name: "성과",
          type: "text",
          required: false,
          system: false,
          config: {},
          order: 0,
          version: 1,
          deletedAt: null,
        }],
        schemaVersion: 2,
        sortOrder: 0,
        recordCount: 0,
        version: 2,
      };
    expect(CareerCategorySchema.safeParse(existingWebCategory).success).toBe(true);
    expect(schemaValidator("CareerPropertySchemaApplyResponse")({ data: existingWebCategory })).toBe(true);
  });

  it("requires a category-scoped stable page and optimistic trash or restore", () => {
    const list = operation("/v1/career/records", "get");
    const remove = operation("/v1/career/records/{recordId}", "delete");
    const restore = operation("/v1/career/records/{recordId}/restore", "post");

    const categoryId = list.parameters
      ?.map((parameter) => resolveReference<ParameterObject>(parameter))
      .find((parameter) => parameter.in === "query" && parameter.name === "categoryId");
    expect(categoryId).toEqual(expect.objectContaining({ required: true }));
    expect(list["x-pagination"]).toEqual({
      style: "keyset",
      order: ["updatedAt:desc", "id:desc"],
      cursorScope: "categoryId",
      signed: false,
    });
    response(list, "200");
    response(list, "400");

    requiredHeader(remove, "If-Match");
    response(remove, "200");
    response(remove, "404");
    response(remove, "412");

    requiredHeader(restore, "If-Match");
    response(restore, "200");
    response(restore, "404");
    response(restore, "412");

    const validatePage = schemaValidator("CareerRecordListResponse");
    expect(validatePage({
      data: [],
      page: { hasNextPage: false, nextCursor: null },
    })).toBe(true);

    const validateTrash = schemaValidator("CareerRecordTrashResponse");
    expect(validateTrash({
      data: {
        id: "1044d680-6f5b-4f6a-90b7-20f7ba5eddf5",
        deletedAt: "2026-09-14T04:00:00.000Z",
        purgeAfter: "2026-10-14T04:00:00.000Z",
        version: 2,
      },
    })).toBe(true);
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
      expect(
        responseHeader(response(operationObject, status), "ETag").schema?.pattern,
      ).toBe(expectedPattern);
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
            type: "relation",
            value: [],
          },
        ],
      }),
    ).toBe(false);
  });

  it("accepts the shared v1 rich document corpus", () => {
    const validateBlockBody = schemaValidator("BlockBody");

    for (const [name, fixture] of Object.entries(blockBodyFixtures)) {
      expect(
        validateBlockBody(fixture),
        `${name}: ${ajv.errorsText(validateBlockBody.errors)}`,
      ).toBe(true);
    }
  });

  it("enforces known block semantics while preserving unknown blocks", () => {
    const validateBlockBody = schemaValidator("BlockBody");
    const paragraph = {
      id: "50000000-0000-4000-8000-000000000002",
      type: "paragraph",
      attrs: {},
      text: [{ text: "목록 항목" }],
    };

    const invalidDocuments = [
      {
        schemaVersion: 1,
        type: "doc",
        content: [
          {
            id: "50000000-0000-4000-8000-000000000001",
            type: "bulletList",
            attrs: {},
            content: [
              {
                id: "50000000-0000-4000-8000-000000000003",
                type: "listItem",
                attrs: {},
                content: [paragraph],
              },
            ],
            text: [{ text: "목록이 직접 가지면 안 되는 text" }],
          },
        ],
      },
      {
        schemaVersion: 1,
        type: "doc",
        content: [
          {
            id: "50000000-0000-4000-8000-000000000004",
            type: "image",
            attrs: { alt: "mediaId 없는 이미지" },
          },
        ],
      },
      {
        schemaVersion: 1,
        type: "doc",
        content: [
          {
            id: "50000000-0000-4000-8000-000000000005",
            type: "paragraph",
            attrs: {},
            text: [{ text: "링크", marks: [{ type: "link", attrs: {} }] }],
          },
        ],
      },
    ];

    for (const document of invalidDocuments) {
      expect(validateBlockBody(document)).toBe(false);
    }

    expect(
      validateBlockBody(blockBodyFixtures.unknownBlock),
      ajv.errorsText(validateBlockBody.errors),
    ).toBe(true);
  });

  it("publishes portable rich document limits without overstating runtime validation", () => {
    const blockBodySchema = contract.components.schemas.BlockBody;
    const blockSchema = contract.components.schemas.CareerBlock;
    const textSpanSchema = contract.components.schemas.CareerTextSpan;
    const textMarkSchema = contract.components.schemas.CareerTextMark;

    expect(blockBodySchema?.["x-expresso-invariants"]).toEqual({
      globalBlockIdUnique: true,
      maxDepth: 32,
      maxBlocks: 20_000,
      maxAttrsDepth: 16,
      maxBlockAttrsBytes: 65_536,
      maxMarkAttrsBytes: 8_192,
      maxDocumentBytes: 4_194_304,
      runtimeValidationRequired: true,
    });
    expect(blockSchema?.["x-expresso-knownBlockTypes"]).toEqual([
      "paragraph",
      "heading1",
      "heading2",
      "heading3",
      "bulletList",
      "orderedList",
      "taskList",
      "listItem",
      "blockquote",
      "code",
      "callout",
      "horizontalRule",
      "image",
      "file",
      "table",
      "tableRow",
      "tableCell",
      "evidence",
    ]);
    expect(blockSchema?.properties).toEqual(
      expect.objectContaining({
        content: expect.objectContaining({
          items: { $ref: "#/components/schemas/CareerBlock" },
        }),
      }),
    );
    expect(textSpanSchema?.properties).toEqual(
      expect.objectContaining({
        text: expect.objectContaining({ maxLength: 200_000 }),
        marks: expect.objectContaining({ maxItems: 20 }),
      }),
    );
    expect(textMarkSchema).toBeDefined();

    const validateBlockBody = schemaValidator("BlockBody");
    expect(validateBlockBody({ schemaVersion: 1, type: "doc", content: [] })).toBe(
      true,
    );
    expect(
      validateBlockBody({
        schemaVersion: 1,
        type: "doc",
        content: [
          {
            id: "50000000-0000-4000-8000-000000000006",
            type: "paragraph",
            attrs: {},
            text: [{ text: "" }, { text: "가".repeat(200_000) }],
          },
        ],
      }),
      ajv.errorsText(validateBlockBody.errors),
    ).toBe(true);
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

  it("accepts the shared canonical property definition and writable value fixture", () => {
    const validateCategory = schemaValidator("CareerCategory");
    const validatePropertyValues = schemaValidator("PropertyValues");

    expect(
      validateCategory(propertyFixture.category),
      ajv.errorsText(validateCategory.errors),
    ).toBe(true);
    expect(
      validatePropertyValues(propertyFixture.propertyValues),
      ajv.errorsText(validatePropertyValues.errors),
    ).toBe(true);

    const definitions = propertyFixture.category.propertyDefinitions as Array<{
      id: string;
      type: string;
      config: { options?: Array<{ name: string }> };
    }>;
    expect(definitions[1]?.config.options?.map(({ name }) => name)).toEqual([
      "Java",
      "java",
      " Java ",
    ]);

    const definitionsById = new Map(
      definitions.map((definition) => [definition.id, definition]),
    );
    for (const propertyValue of propertyFixture.propertyValues) {
      const definition = definitionsById.get(
        propertyValue.propertyDefinitionId as string,
      );
      expect(definition, propertyValue.propertyDefinitionId as string).toBeDefined();
      expect(definition?.type).toBe(propertyValue.type);
    }
  });

  it("uses the migration 0006 identity for the shared role definition and its value", () => {
    const officialRoleId = "f3b3693d-2b90-526a-9e13-81d8f64e9e09";
    const definitions = propertyFixture.category.propertyDefinitions as Array<{
      id: string;
      key: string;
    }>;
    const roleDefinition = definitions.find(({ key }) => key === "role");

    expect(roleDefinition?.id).toBe(officialRoleId);
    expect(propertyFixture.propertyValues).toContainEqual(
      expect.objectContaining({
        propertyDefinitionId: officialRoleId,
        type: "text",
      }),
    );
  });

  it("uses name and the official stable identity as the canonical definition contract", () => {
    const definitionSchema = contract.components.schemas.PropertyDefinition;
    const definitionTypeSchema = contract.components.schemas.PropertyDefinitionType;

    expect(definitionSchema?.required).toEqual([
      "id",
      "key",
      "name",
      "type",
      "required",
      "system",
      "config",
      "order",
      "version",
      "deletedAt",
    ]);
    expect(definitionSchema?.description).toContain("0006");
    expect(definitionSchema?.description).toContain("propertySchemaV2");
    expect(definitionSchema?.properties).toEqual(
      expect.objectContaining({
        name: expect.objectContaining({ minLength: 1, maxLength: 80 }),
        type: expect.objectContaining({
          $ref: "#/components/schemas/PropertyDefinitionType",
        }),
      }),
    );
    expect(definitionSchema?.properties).not.toHaveProperty("label");
    expect(definitionTypeSchema?.enum).not.toContain("title");
  });

  it("preserves exact option whitespace but rejects names made only of whitespace", () => {
    const validateOption = schemaValidator("CareerSelectOption");
    const id = "20000000-0000-4000-8000-000000000003";

    expect(validateOption({ id, name: " Java " })).toBe(true);
    expect(validateOption({ id, name: "   " })).toBe(false);
  });

  it("validates canonical definition config by property type", () => {
    const validateDefinition = schemaValidator("PropertyDefinition");
    const base = {
      id: "6c663539-48c1-5d12-939d-f100fac993c1",
      key: "role",
      name: "역할",
      required: false,
      system: true,
      order: 0,
      version: 1,
      deletedAt: null,
    };

    expect(validateDefinition({ ...base, type: "text", config: {} })).toBe(true);
    expect(validateDefinition({ ...base, type: "text", config: { unknown: true } })).toBe(false);
    expect(validateDefinition({
      ...base,
      type: "relation",
      config: {
        targetCategoryId: "54e2b29a-d2ba-4c80-a4bc-1c1d08740497",
        inversePropertyId: null,
        cardinality: "multiple",
        deletePolicy: "nullify",
      },
    })).toBe(true);
    expect(validateDefinition({ ...base, type: "relation", config: {} })).toBe(false);
  });

  it("accepts only writable property value types and keeps text at 50000 characters", () => {
    const validatePropertyValues = schemaValidator("PropertyValues");
    const propertyDefinitionId = "7e96f07a-30ba-496e-ac9d-20d4421c1703";

    expect(
      validatePropertyValues([
        { propertyDefinitionId, type: "text", value: "가".repeat(50_000) },
      ]),
      ajv.errorsText(validatePropertyValues.errors),
    ).toBe(true);
    expect(
      validatePropertyValues([
        { propertyDefinitionId, type: "text", value: "가".repeat(50_001) },
      ]),
    ).toBe(false);

    for (const type of [
      "title",
      "relation",
      "formula",
      "rollup",
      "created_time",
      "updated_time",
    ]) {
      expect(
        validatePropertyValues([{ propertyDefinitionId, type, value: null }]),
        `${type}은 일반 writable propertyValues가 아니다`,
      ).toBe(false);
    }
  });

  it("uses lossless plain decimal strings for canonical number values", () => {
    const validatePropertyValues = schemaValidator("PropertyValues");
    const propertyDefinitionId = "10000000-0000-4000-8000-000000000004";

    for (const value of ["0", "-0.25", "123.4500"]) {
      expect(
        validatePropertyValues([{ propertyDefinitionId, type: "number", value }]),
        `${value}: ${ajv.errorsText(validatePropertyValues.errors)}`,
      ).toBe(true);
    }

    for (const value of [123.45, "1e3", "NaN", "Infinity", "+1", " 1", "1 "]) {
      expect(
        validatePropertyValues([{ propertyDefinitionId, type: "number", value }]),
        `${String(value)}는 canonical plain decimal string이 아니다`,
      ).toBe(false);
    }
  });

  it("validates month day and offset datetime precision without inventing missing precision", () => {
    const validateDate = schemaValidator("CareerDateValue");

    for (const value of [
      { precision: "month", start: "2026-09", end: null },
      { precision: "day", start: "2026-09-05", end: "2026-09-30" },
      {
        precision: "datetime",
        start: "2026-09-05T09:30:00+09:00",
        end: null,
        timezone: "Asia/Seoul",
      },
      {
        precision: "datetime",
        start: "2026-09-05T00:30:00Z",
        end: null,
        timezone: null,
      },
    ]) {
      expect(validateDate(value), ajv.errorsText(validateDate.errors)).toBe(true);
    }

    for (const value of [
      { start: "2026-09", end: null },
      { precision: "month", start: "2026-09-01", end: null },
      { precision: "month", start: "2026-09", end: null, timezone: null },
      { precision: "day", start: "2026-09", end: null },
      {
        precision: "datetime",
        start: "2026-09-05T09:30:00",
        end: null,
        timezone: "Asia/Seoul",
      },
      {
        precision: "datetime",
        start: "2026-09-05T09:30:00+09:00",
        end: null,
      },
    ]) {
      expect(validateDate(value)).toBe(false);
    }
  });

  it("limits create and patch payloads to the first-slice mutations", () => {
    const validateCreate = schemaValidator("CreateCareerRecordRequest");
    const validatePatch = schemaValidator("PatchCareerRecordRequest");
    const categoryId = "54e2b29a-d2ba-4c80-a4bc-1c1d08740497";

    expect(validateCreate({ categoryId })).toBe(true);
    expect(
      validateCreate({
        categoryId,
        propertyValues: [
          {
            propertyDefinitionId: "7e96f07a-30ba-496e-ac9d-20d4421c1703",
            type: "select",
            value: "8ec09af1-45a6-4f54-8f48-d0c1e32882fe",
          },
        ],
      }),
      ajv.errorsText(validateCreate.errors),
    ).toBe(true);
    expect(
      validateCreate({
        categoryId,
        propertyValues: [
          {
            propertyDefinitionId: "7e96f07a-30ba-496e-ac9d-20d4421c1703",
            type: "multi_select",
            value: ["8ec09af1-45a6-4f54-8f48-d0c1e32882fe"],
          },
        ],
      }),
      ajv.errorsText(validateCreate.errors),
    ).toBe(true);
    expect(validateCreate({ categoryId, propertyValues: [] })).toBe(true);
    expect(validateCreate({
      categoryId,
      propertyValues: [{
        propertyDefinitionId: "7e96f07a-30ba-496e-ac9d-20d4421c1703",
        type: "select",
        value: null,
      }],
    })).toBe(false);
    expect(validateCreate({
      categoryId,
      propertyValues: [{
        propertyDefinitionId: "7e96f07a-30ba-496e-ac9d-20d4421c1703",
        type: "multi_select",
        value: [],
      }],
    })).toBe(false);
    expect(
      validateCreate({
        categoryId,
        propertyValues: [
          {
            propertyDefinitionId: "7e96f07a-30ba-496e-ac9d-20d4421c1703",
            type: "text",
            value: "생성 시 역할",
          },
        ],
      }),
    ).toBe(false);
    expect(
      validateCreate({
        categoryId,
        propertyValues: [
          {
            propertyDefinitionId: "7e96f07a-30ba-496e-ac9d-20d4421c1703",
            type: "select",
            value: "8ec09af1-45a6-4f54-8f48-d0c1e32882fe",
          },
          {
            propertyDefinitionId: "8cc8aa20-aacd-4529-9d62-135e71b8234b",
            type: "multi_select",
            value: ["40ab2ac4-f770-4983-9352-110b0ef95fb4"],
          },
        ],
      }),
    ).toBe(false);
    expect(validateCreate({ categoryId, title: "생성 시 제목" })).toBe(false);
    expect(validateCreate({
      categoryId,
      title: "원본 기록 복제",
      properties: {
        role: { type: "select", value: "8ec09af1-45a6-4f54-8f48-d0c1e32882fe" },
      },
      bodyMd: "# 저장된 레거시 본문",
    }), ajv.errorsText(validateCreate.errors)).toBe(true);
    expect(validateCreate({ categoryId, title: "원본 기록 복제", properties: {} })).toBe(false);
    expect(validateCreate({
      categoryId,
      title: "원본 기록 복제",
      properties: { attachment: { type: "file", value: "not-an-array" } },
      bodyMd: "본문",
    })).toBe(false);
    expect(validateCreate({
      categoryId,
      title: "원본 기록 복제",
      properties: { note: "a".repeat(5_001) },
      bodyMd: "본문",
    })).toBe(false);
    expect(validateCreate({
      categoryId,
      title: "원본 기록 복제",
      properties: {},
      bodyMd: "본문",
      propertyValues: [],
    })).toBe(false);

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
    expect(validatePatch({ status: "organized" })).toBe(true);
    expect(validatePatch({ status: "invalid" })).toBe(false);
    expect(validatePatch({ status: "organized", title: "함께 변경" })).toBe(false);
    expect(validatePatch({ bodyMd: "legacy" })).toBe(false);
    expect(validatePatch({ categoryId })).toBe(false);
  });

  it("contracts category move preview and commit with lossless canonical unmapped values", () => {
    const preview = operation(
      "/v1/career/records/{recordId}/move/preview",
      "post",
    );
    const commit = operation("/v1/career/records/{recordId}/move", "post");
    expect(preview.responses).toHaveProperty("200");
    expect(commit.responses).toHaveProperty("200");
    expect(commit.responses).toHaveProperty("409");
    expect(commit.responses).toHaveProperty("412");

    const validateUnmapped = schemaValidator("CareerUnmappedProperties");
    const propertyDefinitionId = "10000000-0000-4000-8000-000000000001";
    const value = {
      [propertyDefinitionId]: {
        sourceCategoryId: "20000000-0000-4000-8000-000000000001",
        propertyValue: {
          propertyDefinitionId,
          type: "number",
          value: "123.4500",
        },
        provenance: {
          sourcePropertyKey: "score",
          sourcePropertyName: "점수",
          sourcePropertyDefinitionVersion: 3,
          preservedAt: "2026-09-14T08:00:00.000Z",
          sourceRecordVersion: 7,
          reason: "no_target_property",
        },
      },
    };
    expect(validateUnmapped(value), ajv.errorsText(validateUnmapped.errors)).toBe(true);
    expect(contract.components.schemas.CareerUnmappedProperties).toMatchObject({
      maxProperties: 200,
      "x-expresso-keyEquals": "propertyValue.propertyDefinitionId",
      "x-expresso-maxUtf8Bytes": 4_194_304,
    });
  });
});
