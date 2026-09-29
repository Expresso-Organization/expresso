import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { readAccessToken } = vi.hoisted(() => ({ readAccessToken: vi.fn() }));
vi.mock("@/lib/session", () => ({ readAccessToken }));

import { POST } from "./route";

const recordId = "00000000-0000-4000-8000-000000000001";
const categoryId = "00000000-0000-4000-8000-000000000002";
const updatedAt = "2026-09-14T09:00:00.000Z";
const record = { data: { id: recordId, categoryId, title: "", status: "draft", origin: "manual", properties: {}, propertyValues: [], bodyMd: "", version: 2, updatedAt }, resource: { version: 2, updatedAt } };

describe("POST /api/career/records/[recordId]/move", () => {
  beforeEach(() => { readAccessToken.mockResolvedValue("exps_token"); process.env.CAREER_SPRING_API_BASE_URL = "http://localhost:4100"; process.env.CAREER_SPRING_CATEGORY_MOVE_ENABLED = "true"; });
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.CAREER_SPRING_API_BASE_URL; delete process.env.CAREER_SPRING_CATEGORY_MOVE_ENABLED; });

  it("Spring에서 이동한 뒤 Fastify 호환 응답을 새로 읽는다", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ data: { id: recordId } }, { headers: { etag: '"v2"' } })).mockResolvedValueOnce(Response.json(record));
    vi.stubGlobal("fetch", fetchMock);
    const body = { targetCategoryId: categoryId, previewToken: "x".repeat(40), expectedVersion: 1, discardUnmappedPropertyIds: [] };

    const response = await POST(new Request("http://localhost", { method: "POST", headers: { "content-type": "application/json", "if-match": '"v1"' }, body: JSON.stringify(body) }), { params: Promise.resolve({ recordId }) });

    expect(fetchMock).toHaveBeenNthCalledWith(1, `http://localhost:4100/v1/career/records/${recordId}/move`, expect.objectContaining({ method: "POST", headers: expect.objectContaining({ authorization: "Bearer exps_token", "if-match": '"v1"' }) }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, `http://127.0.0.1:4000/v1/career/records/${recordId}`, expect.objectContaining({ headers: expect.objectContaining({ authorization: "Bearer exps_token" }) }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(record);
  });

  it("legacy flag가 없어도 Spring commit과 Fastify read-after-write만 사용한다", async () => {
    delete process.env.CAREER_SPRING_CATEGORY_MOVE_ENABLED;
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ data: { id: recordId } }, { headers: { etag: '"v2"' } })).mockResolvedValueOnce(Response.json(record));
    vi.stubGlobal("fetch", fetchMock);
    const body = { targetCategoryId: categoryId, previewToken: "x".repeat(40), expectedVersion: 1, discardUnmappedPropertyIds: [] };

    const response = await POST(new Request("http://localhost", { method: "POST", headers: { "content-type": "application/json", "if-match": '"v1"' }, body: JSON.stringify(body) }), { params: Promise.resolve({ recordId }) });

    expect(fetchMock).toHaveBeenNthCalledWith(1, `http://localhost:4100/v1/career/records/${recordId}/move`, expect.anything());
    expect(fetchMock).toHaveBeenNthCalledWith(2, `http://127.0.0.1:4000/v1/career/records/${recordId}`, expect.anything());
    expect(response.status).toBe(200);
  });

  it("Spring URL이 없으면 Fastify Move로 fallback하지 않는다", async () => {
    delete process.env.CAREER_SPRING_API_BASE_URL;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const body = { targetCategoryId: categoryId, previewToken: "x".repeat(40), expectedVersion: 1, discardUnmappedPropertyIds: [] };

    const response = await POST(new Request("http://localhost", { method: "POST", headers: { "content-type": "application/json", "if-match": '"v1"' }, body: JSON.stringify(body) }), { params: Promise.resolve({ recordId }) });

    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
