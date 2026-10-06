import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { readAccessToken } = vi.hoisted(() => ({ readAccessToken: vi.fn() }));
vi.mock("@/lib/session", () => ({ readAccessToken }));

import { POST } from "./route";

describe("POST /api/career/records/[recordId]/move/preview", () => {
  beforeEach(() => { readAccessToken.mockResolvedValue("exps_token"); process.env.CAREER_SPRING_API_BASE_URL = "http://localhost:4100"; process.env.CAREER_SPRING_CATEGORY_MOVE_ENABLED = "true"; });
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.CAREER_SPRING_API_BASE_URL; delete process.env.CAREER_SPRING_CATEGORY_MOVE_ENABLED; });

  it("opaque token으로 Spring preview를 호출한다", async () => {
    const recordId = "00000000-0000-4000-8000-000000000001";
    const targetCategoryId = "00000000-0000-4000-8000-000000000002";
    const preview = { data: { recordId, sourceCategoryId: "00000000-0000-4000-8000-000000000003", targetCategoryId, recordVersion: 1, sourceSchemaVersion: 1, targetSchemaVersion: 1, conversions: [], unmappedProperties: {}, previewToken: "x".repeat(40) } };
    const fetchMock = vi.fn().mockResolvedValue(Response.json(preview));
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(new Request("http://localhost", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ targetCategoryId }) }), { params: Promise.resolve({ recordId }) });

    expect(fetchMock).toHaveBeenCalledWith(`http://localhost:4100/v1/career/records/${recordId}/move/preview`, expect.objectContaining({ headers: expect.objectContaining({ authorization: "Bearer exps_token" }) }));
    expect(response.status).toBe(200);
  });

  it("legacy flag가 없어도 Spring preview만 호출한다", async () => {
    delete process.env.CAREER_SPRING_CATEGORY_MOVE_ENABLED;
    const recordId = "00000000-0000-4000-8000-000000000001";
    const targetCategoryId = "00000000-0000-4000-8000-000000000002";
    const preview = { data: { recordId, sourceCategoryId: "00000000-0000-4000-8000-000000000003", targetCategoryId, recordVersion: 1, sourceSchemaVersion: 1, targetSchemaVersion: 1, conversions: [], unmappedProperties: {}, previewToken: "x".repeat(40) } };
    const fetchMock = vi.fn().mockResolvedValue(Response.json(preview));
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(new Request("http://localhost", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ targetCategoryId }) }), { params: Promise.resolve({ recordId }) });

    expect(fetchMock).toHaveBeenCalledWith(`http://localhost:4100/v1/career/records/${recordId}/move/preview`, expect.anything());
    expect(response.status).toBe(200);
  });

  it("Spring URL이 없으면 Fastify로 fallback하지 않는다", async () => {
    delete process.env.CAREER_SPRING_API_BASE_URL;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(new Request("http://localhost", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ targetCategoryId: "00000000-0000-4000-8000-000000000002" }) }), { params: Promise.resolve({ recordId: "00000000-0000-4000-8000-000000000001" }) });

    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
