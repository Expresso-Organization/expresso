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
const preview = {
  data: {
    categoryId,
    categoryVersion: 7,
    change,
    impact: {
      affectedRecordCount: 0,
      convertibleCount: 0,
      lossyExamples: [],
      dependentViews: [],
      dependentFormulas: [],
      dependentRollups: [],
    },
    previewToken: "p".repeat(40),
  },
};

function request(body: unknown = change) {
  return new Request("http://localhost/api/career/property-schema/preview", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/career/categories/[categoryId]/property-schema/preview", () => {
  beforeEach(() => {
    readAccessToken.mockResolvedValue("exps_session_token");
    process.env.CAREER_SPRING_API_BASE_URL = "http://localhost:4100";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.CAREER_SPRING_API_BASE_URL;
  });

  it("bare change와 opaque 인증을 Spring preview로 그대로 전달한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(preview));
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(request(), { params: Promise.resolve({ categoryId }) });

    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:4100/v1/career/categories/${categoryId}/property-schema/preview`,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer exps_session_token",
          "content-type": "application/json",
        }),
        body: JSON.stringify(change),
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(preview);
  });

  it("rename을 Spring preview로 전달한다", async () => {
    const rename = { kind: "rename", propertyId, name: "새 이름" };
    const renamePreview = { data: { ...preview.data, change: rename } };
    const fetchMock = vi.fn().mockResolvedValue(Response.json(renamePreview));
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(request(rename), { params: Promise.resolve({ categoryId }) });

    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:4100/v1/career/categories/${categoryId}/property-schema/preview`,
      expect.objectContaining({ body: JSON.stringify(rename) }),
    );
    expect(response.status).toBe(200);
  });

  it("reorder를 Spring preview로 전달한다", async () => {
    const reorder = { kind: "reorder", propertyId, order: 4 };
    const reorderPreview = { data: { ...preview.data, change: reorder } };
    const fetchMock = vi.fn().mockResolvedValue(Response.json(reorderPreview));
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(request(reorder), { params: Promise.resolve({ categoryId }) });

    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:4100/v1/career/categories/${categoryId}/property-schema/preview`,
      expect.objectContaining({ body: JSON.stringify(reorder) }),
    );
    expect(response.status).toBe(200);
  });

  it.each([
    { kind: "type-change", propertyId, type: "number", config: {} },
    { kind: "delete", propertyId },
    { kind: "restore", propertyId },
    { kind: "configure", propertyId, config: { source: "1 + 2" } },
    { kind: "configure", propertyId, config: { relationPropertyId: categoryId, aggregation: "sum" } },
    { ...change, property: { ...change.property, config: { defaultValue: { type: "text", value: "기본값" } } } },
  ])("MVP에서 제외한 deferred mutation을 upstream에 전달하지 않는다", async (excluded) => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(preview));
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(request(excluded), { params: Promise.resolve({ categoryId }) });

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("relation create를 Spring preview로 전달하고 URL이 없으면 503을 반환한다", async () => {
    const relation = {
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
    };
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: { ...preview.data, change: relation } }));
    vi.stubGlobal("fetch", fetchMock);

    expect((await POST(request(relation), { params: Promise.resolve({ categoryId }) })).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:4100/v1/career/categories/${categoryId}/property-schema/preview`,
      expect.objectContaining({ body: JSON.stringify(relation) }),
    );

    delete process.env.CAREER_SPRING_API_BASE_URL;
    expect((await POST(request(relation), { params: Promise.resolve({ categoryId }) })).status).toBe(503);
  });

  it("formula create를 Spring preview로 전달한다", async () => {
    const formula = { ...change, property: { ...change.property, type: "formula" as const, config: { source: "1 + 2", ast: null, diagnostics: [] } } };
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: { ...preview.data, change: formula } }));
    vi.stubGlobal("fetch", fetchMock);

    expect((await POST(request(formula), { params: Promise.resolve({ categoryId }) })).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:4100/v1/career/categories/${categoryId}/property-schema/preview`,
      expect.objectContaining({ body: JSON.stringify(formula) }),
    );
  });

  it("rollup create를 Spring preview로 전달한다", async () => {
    const rollup = { ...change, property: { ...change.property, type: "rollup" as const, config: { relationPropertyId: propertyId, targetPropertyId: categoryId, aggregation: "sum" } } };
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: { ...preview.data, change: rollup } }));
    vi.stubGlobal("fetch", fetchMock);

    expect((await POST(request(rollup), { params: Promise.resolve({ categoryId }) })).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:4100/v1/career/categories/${categoryId}/property-schema/preview`,
      expect.objectContaining({ body: JSON.stringify(rollup) }),
    );
  });
});
