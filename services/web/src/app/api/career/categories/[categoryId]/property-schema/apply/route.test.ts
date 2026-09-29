import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { readAccessToken } = vi.hoisted(() => ({ readAccessToken: vi.fn() }));
vi.mock("@/lib/session", () => ({ readAccessToken }));

import { POST } from "./route";

const categoryId = "10000000-0000-4000-8000-000000000001";
const propertyId = "10000000-0000-4000-8000-000000000002";
const change = {
  kind: "create" as const,
  property: {
    key: "achievement",
    name: "성과",
    type: "text" as const,
    required: false,
    system: false,
    config: {},
  },
};
const applyBody = {
  change,
  previewToken: "p".repeat(40),
  confirmLossy: false,
};
const appliedCategory = {
  data: {
    id: categoryId,
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
    version: 8,
  },
};

function request(body: unknown = applyBody) {
  return new Request("http://localhost/api/career/property-schema/apply", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "if-match": "\"v7\"",
      "idempotency-key": "create-property-0001",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/career/categories/[categoryId]/property-schema/apply", () => {
  beforeEach(() => {
    readAccessToken.mockResolvedValue("exps_session_token");
    process.env.CAREER_SPRING_API_BASE_URL = "http://localhost:4100";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.CAREER_SPRING_API_BASE_URL;
  });

  it("apply payload와 조건부 헤더를 Spring에 전달하고 ETag를 반환한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json(appliedCategory, { headers: { etag: "\"v8\"" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(request(), { params: Promise.resolve({ categoryId }) });

    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:4100/v1/career/categories/${categoryId}/property-schema/apply`,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer exps_session_token",
          "if-match": "\"v7\"",
          "idempotency-key": "create-property-0001",
        }),
        body: JSON.stringify(applyBody),
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("etag")).toBe("\"v8\"");
    expect(await response.json()).toEqual(appliedCategory);
  });

  it("Spring 409의 status와 error body를 그대로 반환한다", async () => {
    const error = {
      error: {
        code: "CONFLICT",
        message: "Request conflicts with current state",
        requestId: "request-1",
      },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(error, { status: 409 })));

    const response = await POST(request(), { params: Promise.resolve({ categoryId }) });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual(error);
  });

  it("rename을 Spring apply로 전달한다", async () => {
    const renameBody = {
      change: { kind: "rename", propertyId, name: "새 이름" },
      previewToken: "p".repeat(40),
      confirmLossy: false,
    };
    const fetchMock = vi.fn().mockResolvedValue(Response.json(appliedCategory));
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(request(renameBody), { params: Promise.resolve({ categoryId }) });

    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:4100/v1/career/categories/${categoryId}/property-schema/apply`,
      expect.objectContaining({ body: JSON.stringify(renameBody) }),
    );
    expect(response.status).toBe(200);
  });

  it("reorder를 Spring apply로 전달한다", async () => {
    const reorderBody = {
      change: { kind: "reorder", propertyId, order: 4 },
      previewToken: "p".repeat(40),
      confirmLossy: false,
    };
    const fetchMock = vi.fn().mockResolvedValue(Response.json(appliedCategory));
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(request(reorderBody), { params: Promise.resolve({ categoryId }) });

    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:4100/v1/career/categories/${categoryId}/property-schema/apply`,
      expect.objectContaining({ body: JSON.stringify(reorderBody) }),
    );
    expect(response.status).toBe(200);
  });

  it.each([
    { kind: "type-change", propertyId, type: "number", config: {} },
    { kind: "delete", propertyId },
    { kind: "restore", propertyId },
    { ...change, property: { ...change.property, config: { defaultValue: { type: "text", value: "기본값" } } } },
  ])("MVP에서 제외한 deferred mutation을 upstream에 전달하지 않는다", async (excluded) => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(appliedCategory));
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(request({ ...applyBody, change: excluded }), { params: Promise.resolve({ categoryId }) });

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("relation create를 Spring apply로 전달하고 URL이 없으면 503을 반환한다", async () => {
    const relationBody = {
      ...applyBody,
      change: {
        ...change,
        property: {
          ...change.property,
          type: "relation" as const,
          config: {
            targetCategoryId: propertyId,
            inversePropertyId: null,
            cardinality: "multiple",
            deletePolicy: "nullify",
          },
        },
      },
    };
    const fetchMock = vi.fn().mockResolvedValue(Response.json(appliedCategory));
    vi.stubGlobal("fetch", fetchMock);

    expect((await POST(request(relationBody), { params: Promise.resolve({ categoryId }) })).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:4100/v1/career/categories/${categoryId}/property-schema/apply`,
      expect.objectContaining({ body: JSON.stringify(relationBody) }),
    );

    delete process.env.CAREER_SPRING_API_BASE_URL;
    expect((await POST(request(relationBody), { params: Promise.resolve({ categoryId }) })).status).toBe(503);
  });

  it("formula create를 Spring apply로 전달한다", async () => {
    const formulaBody = {
      ...applyBody,
      change: { ...change, property: { ...change.property, type: "formula" as const, config: { source: "1 + 2", ast: null, diagnostics: [] } } },
    };
    const fetchMock = vi.fn().mockResolvedValue(Response.json(appliedCategory));
    vi.stubGlobal("fetch", fetchMock);

    expect((await POST(request(formulaBody), { params: Promise.resolve({ categoryId }) })).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:4100/v1/career/categories/${categoryId}/property-schema/apply`,
      expect.objectContaining({ body: JSON.stringify(formulaBody) }),
    );
  });

  it("rollup create를 Spring apply로 전달한다", async () => {
    const rollupBody = {
      ...applyBody,
      change: { ...change, property: { ...change.property, type: "rollup" as const, config: { relationPropertyId: propertyId, targetPropertyId: categoryId, aggregation: "sum" } } },
    };
    const fetchMock = vi.fn().mockResolvedValue(Response.json(appliedCategory));
    vi.stubGlobal("fetch", fetchMock);

    expect((await POST(request(rollupBody), { params: Promise.resolve({ categoryId }) })).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:4100/v1/career/categories/${categoryId}/property-schema/apply`,
      expect.objectContaining({ body: JSON.stringify(rollupBody) }),
    );
  });
});
