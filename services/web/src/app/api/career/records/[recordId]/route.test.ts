import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { readAccessToken } = vi.hoisted(() => ({ readAccessToken: vi.fn() }));
vi.mock("@/lib/session", () => ({ readAccessToken }));

import { DELETE, PATCH } from "./route";

const recordId = "00000000-0000-4000-8000-000000000001";
const categoryId = "00000000-0000-4000-8000-000000000002";
const propertyDefinitionId = "00000000-0000-4000-8000-000000000003";
const propertyValues = [
  { propertyDefinitionId, type: "number", value: "123.4500" },
  {
    propertyDefinitionId: "00000000-0000-4000-8000-000000000004",
    type: "date",
    value: { precision: "month", start: "2026-01", end: "2026-03" },
  },
] as const;
const updatedAt = "2026-09-09T00:00:00.000Z";
const springResponse = {
  data: {
    id: recordId,
    categoryId,
    title: "기록",
    propertyValues,
    blockBody: { schemaVersion: 1, type: "doc", content: [] },
    version: 2,
    updatedAt,
  },
};
const fastifyResponse = {
  data: {
    id: recordId,
    categoryId,
    title: "기록",
    status: "draft",
    origin: "manual",
    properties: {},
    propertyValues,
    bodyMd: "",
    version: 2,
    updatedAt,
  },
  resource: { version: 2, updatedAt },
};

function request(body: unknown, ifMatch = '"v1"') {
  return new Request(`http://localhost/api/career/records/${recordId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", "if-match": ifMatch },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/career/records/[recordId]", () => {
  beforeEach(() => {
    readAccessToken.mockResolvedValue("exps_session_token");
    process.env.CAREER_SPRING_API_BASE_URL = "http://localhost:4100";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.CAREER_SPRING_API_BASE_URL;
  });

  it("canonical propertyValues 전체 snapshot을 Spring에 보내고 Fastify에서 갱신된 Record를 읽는다", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json(springResponse, { headers: { etag: '"v2"' } }))
      .mockResolvedValueOnce(Response.json(fastifyResponse));
    vi.stubGlobal("fetch", fetchMock);

    const response = await PATCH(request({ propertyValues }), { params: Promise.resolve({ recordId }) });

    expect(fetchMock).toHaveBeenNthCalledWith(1, `http://localhost:4100/v1/career/records/${recordId}`, expect.objectContaining({
      method: "PATCH",
      headers: expect.objectContaining({ authorization: "Bearer exps_session_token", "if-match": '"v1"' }),
      body: JSON.stringify({ propertyValues }),
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, `http://127.0.0.1:4000/v1/career/records/${recordId}`, expect.objectContaining({
      headers: expect.objectContaining({ authorization: "Bearer exps_session_token" }),
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get("etag")).toBe('"v2"');
    expect(await response.json()).toEqual(fastifyResponse);
  });

  it("Spring의 stale 412를 그대로 반환하고 Fastify를 조회하지 않는다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 412 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await PATCH(request({ propertyValues }), { params: Promise.resolve({ recordId }) });

    expect(response.status).toBe(412);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("no-op 응답의 기존 version과 ETag를 그대로 유지한다", async () => {
    const unchanged = {
      ...fastifyResponse,
      data: { ...fastifyResponse.data, version: 1 },
      resource: { ...fastifyResponse.resource, version: 1 },
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ ...springResponse, data: { ...springResponse.data, version: 1 } }, { headers: { etag: '"v1"' } }))
      .mockResolvedValueOnce(Response.json(unchanged));
    vi.stubGlobal("fetch", fetchMock);

    const response = await PATCH(request({ propertyValues }), { params: Promise.resolve({ recordId }) });

    expect(response.status).toBe(200);
    expect(response.headers.get("etag")).toBe('"v1"');
    expect((await response.json()).data.version).toBe(1);
  });

  it("Spring PATCH 뒤 다른 쓰기가 끼어들어도 ETag는 반환 body의 최신 version을 가리킨다", async () => {
    const latest = {
      ...fastifyResponse,
      data: { ...fastifyResponse.data, version: 3 },
      resource: { ...fastifyResponse.resource, version: 3 },
    };
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json(springResponse, { headers: { etag: '"v2"' } }))
      .mockResolvedValueOnce(Response.json(latest)));

    const response = await PATCH(request({ propertyValues }), { params: Promise.resolve({ recordId }) });

    expect((await response.json()).data.version).toBe(3);
    expect(response.headers.get("etag")).toBe('"v3"');
  });

  it("title patch를 Spring에 보내고 Fastify에서 갱신된 Record를 읽는다", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({
        ...springResponse,
        data: { ...springResponse.data, title: "수정" },
      }, { headers: { etag: '"v2"' } }))
      .mockResolvedValueOnce(Response.json({
        ...fastifyResponse,
        data: { ...fastifyResponse.data, title: "수정" },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await PATCH(request({ title: "수정" }), { params: Promise.resolve({ recordId }) });

    expect(fetchMock).toHaveBeenNthCalledWith(1, `http://localhost:4100/v1/career/records/${recordId}`, expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ title: "수정" }),
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, `http://127.0.0.1:4000/v1/career/records/${recordId}`, expect.objectContaining({
      headers: expect.objectContaining({ authorization: "Bearer exps_session_token" }),
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get("etag")).toBe('"v2"');
    expect((await response.json()).data.title).toBe("수정");
  });

  it("status-only patch를 Spring에 보내고 Fastify에서 갱신된 Record를 읽는다", async () => {
    const organized = {
      ...fastifyResponse,
      data: { ...fastifyResponse.data, status: "organized" },
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json(springResponse, { headers: { etag: '"v2"' } }))
      .mockResolvedValueOnce(Response.json(organized));
    vi.stubGlobal("fetch", fetchMock);

    const response = await PATCH(request({ status: "organized" }), { params: Promise.resolve({ recordId }) });

    expect(fetchMock).toHaveBeenNthCalledWith(1, `http://localhost:4100/v1/career/records/${recordId}`, expect.objectContaining({
      method: "PATCH",
      headers: expect.objectContaining({ "if-match": '"v1"' }),
      body: JSON.stringify({ status: "organized" }),
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, `http://127.0.0.1:4000/v1/career/records/${recordId}`, expect.anything());
    expect(response.status).toBe(200);
    expect((await response.json()).data.status).toBe("organized");
  });

  it.each([
    { properties: { role: { type: "text", value: "레거시 역할" } } },
    { bodyMd: "# 레거시 본문" },
  ])("legacy Career 필드 PATCH를 백엔드에 전달하지 않는다", async (body) => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(fastifyResponse));
    vi.stubGlobal("fetch", fetchMock);

    const response = await PATCH(request(body), { params: Promise.resolve({ recordId }) });

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/career/records/[recordId]", () => {
  beforeEach(() => {
    readAccessToken.mockResolvedValue("exps_session_token");
    process.env.CAREER_SPRING_API_BASE_URL = "http://localhost:4100";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.CAREER_SPRING_API_BASE_URL;
  });

  it("현재 Record version을 Spring Trash If-Match로 전달하고 기존 Web 204 응답을 유지한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      data: {
        id: recordId,
        deletedAt: "2026-09-09T00:00:00.000Z",
        purgeAfter: "2026-10-09T00:00:00.000Z",
        version: 2,
      },
    }, { headers: { etag: '"v2"' } }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await DELETE(new Request(
      `http://localhost/api/career/records/${recordId}`,
      { method: "DELETE", headers: { "if-match": '"v1"' } },
    ), { params: Promise.resolve({ recordId }) });

    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:4100/v1/career/records/${recordId}`,
      expect.objectContaining({
        method: "DELETE",
        headers: expect.objectContaining({
          authorization: "Bearer exps_session_token",
          "if-match": '"v1"',
        }),
      }),
    );
    expect(fetchMock.mock.calls[0]?.[1]).not.toHaveProperty("body");
    expect(response.status).toBe(204);
  });

  it.each([404, 412])("Spring Trash %i 상태를 그대로 반환한다", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status })));

    const response = await DELETE(new Request(
      `http://localhost/api/career/records/${recordId}`,
      { method: "DELETE", headers: { "if-match": '"v1"' } },
    ), { params: Promise.resolve({ recordId }) });

    expect(response.status).toBe(status);
  });

  it("Spring Career API 주소가 없으면 Fastify로 fallback하지 않는다", async () => {
    delete process.env.CAREER_SPRING_API_BASE_URL;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await DELETE(new Request(
      `http://localhost/api/career/records/${recordId}`,
      { method: "DELETE", headers: { "if-match": '"v1"' } },
    ), { params: Promise.resolve({ recordId }) });

    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
