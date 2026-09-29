import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { readAccessToken } = vi.hoisted(() => ({ readAccessToken: vi.fn() }));
vi.mock("@/lib/session", () => ({ readAccessToken }));

import { GET, PUT } from "./route";

const recordId = "00000000-0000-4000-8000-000000000001";
const categoryId = "00000000-0000-4000-8000-000000000002";
const propertyId = "00000000-0000-4000-8000-000000000003";
const targetId = "00000000-0000-4000-8000-000000000004";
const updatedAt = "2026-09-27T00:00:00.000Z";
const fastifyRecord = {
  data: {
    id: recordId,
    categoryId,
    title: "관계 기록",
    status: "draft",
    origin: "manual",
    properties: {},
    propertyValues: [],
    bodyMd: "",
    version: 2,
    updatedAt,
  },
  resource: { version: 2, updatedAt },
};

describe("/api/career/records/[recordId]/relations", () => {
  beforeEach(() => {
    readAccessToken.mockResolvedValue("exps_session_token");
    process.env.CAREER_SPRING_API_BASE_URL = "http://localhost:4100/";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.CAREER_SPRING_API_BASE_URL;
  });

  it("keeps relation GET on Fastify", async () => {
    const targets = { data: [{ recordId: targetId, title: "대상" }] };
    const fetchMock = vi.fn().mockResolvedValue(Response.json(targets));
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new Request(`http://localhost/api/career/records/${recordId}/relations?propertyId=${propertyId}`),
      { params: Promise.resolve({ recordId }) },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      `http://127.0.0.1:4000/v1/career/records/${recordId}/relations?propertyId=${propertyId}`,
      expect.objectContaining({ headers: expect.objectContaining({ authorization: "Bearer exps_session_token" }) }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(targets);
  });

  it("writes relation targets to Spring and refreshes the existing Web record contract from Fastify", async () => {
    const springResponse = {
      data: {
        id: recordId,
        categoryId,
        title: "관계 기록",
        propertyValues: [],
        blockBody: { schemaVersion: 1, type: "doc", content: [] },
        version: 2,
        updatedAt,
      },
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json(springResponse, { headers: { etag: '"v2"' } }))
      .mockResolvedValueOnce(Response.json(fastifyRecord));
    vi.stubGlobal("fetch", fetchMock);
    const body = { propertyId, targetIds: [targetId] };

    const response = await PUT(new Request("http://localhost", {
      method: "PUT",
      headers: { "content-type": "application/json", "if-match": '"v1"' },
      body: JSON.stringify(body),
    }), { params: Promise.resolve({ recordId }) });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `http://localhost:4100/v1/career/records/${recordId}/relations`,
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({
          authorization: "Bearer exps_session_token",
          "if-match": '"v1"',
        }),
        body: JSON.stringify(body),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `http://127.0.0.1:4000/v1/career/records/${recordId}`,
      expect.objectContaining({ headers: expect.objectContaining({ authorization: "Bearer exps_session_token" }) }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("etag")).toBe('"v2"');
    expect(await response.json()).toEqual(fastifyRecord);
  });

  it.each([400, 404, 409, 412])("returns Spring relation failure %i without reading Fastify", async (status) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await PUT(new Request("http://localhost", {
      method: "PUT",
      headers: { "content-type": "application/json", "if-match": '"v1"' },
      body: JSON.stringify({ propertyId, targetIds: [] }),
    }), { params: Promise.resolve({ recordId }) });

    expect(response.status).toBe(status);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not fall back to Fastify PUT when Spring URL is absent", async () => {
    delete process.env.CAREER_SPRING_API_BASE_URL;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await PUT(new Request("http://localhost", {
      method: "PUT",
      headers: { "content-type": "application/json", "if-match": '"v1"' },
      body: JSON.stringify({ propertyId, targetIds: [] }),
    }), { params: Promise.resolve({ recordId }) });

    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
