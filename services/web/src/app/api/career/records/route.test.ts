import { CareerRecordResponseSchema } from "@expresso/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { readAccessToken } = vi.hoisted(() => ({
  readAccessToken: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ readAccessToken }));

import { POST } from "./route";

const categoryId = "00000000-0000-4000-8000-000000000001";
const recordId = "00000000-0000-4000-8000-000000000009";
const updatedAt = "2026-09-03T00:00:00.000Z";

const springResponse = {
  data: {
    id: recordId,
    categoryId,
    title: "",
    propertyValues: [],
    blockBody: {
      schemaVersion: 1,
      type: "doc",
      content: [
        {
          id: "00000000-0000-4000-8000-000000000010",
          type: "paragraph",
          attrs: {},
          text: [],
        },
      ],
    },
    version: 1,
    updatedAt,
  },
};

const legacyResponse = {
  data: {
    id: recordId,
    categoryId,
    title: "",
    status: "draft",
    origin: "manual",
    properties: {},
    bodyMd: "",
    version: 1,
    updatedAt,
  },
  resource: { version: 1, updatedAt },
};

function createRequest(body: unknown) {
  return new Request("http://localhost/api/career/records", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": "create-career-record-0001",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/career/records", () => {
  beforeEach(() => {
    readAccessToken.mockResolvedValue("exps_session_token");
    process.env.CAREER_SPRING_API_BASE_URL = "http://localhost:4100";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.CAREER_SPRING_API_BASE_URL;
  });

  it("빈 기록은 Spring에서 생성한 뒤 Fastify legacy 응답으로 다시 읽는다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(springResponse, { status: 201 }))
      .mockResolvedValueOnce(Response.json(legacyResponse));
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      createRequest({ categoryId, title: "", properties: {}, bodyMd: "" }),
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://localhost:4100/v1/career/records",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer exps_session_token",
          "idempotency-key": "create-career-record-0001",
        }),
        body: JSON.stringify({ categoryId }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `http://127.0.0.1:4000/v1/career/records/${recordId}`,
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer exps_session_token",
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(CareerRecordResponseSchema.parse(await response.json())).toEqual(
      legacyResponse,
    );
  });

  it("내용이 있는 기존 생성 요청은 Fastify create를 유지한다", async () => {
    const body = {
      categoryId,
      title: "기존 제목",
      properties: { role: "백엔드 개발자" },
      bodyMd: "기존 본문",
    };
    const fetchMock = vi.fn().mockResolvedValue(Response.json(legacyResponse));
    vi.stubGlobal("fetch", fetchMock);

    await POST(createRequest(body));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:4000/v1/career/records",
      expect.objectContaining({ method: "POST", body: JSON.stringify(body) }),
    );
  });

  it("Spring URL이 없으면 빈 생성도 기존 Fastify create를 유지한다", async () => {
    delete process.env.CAREER_SPRING_API_BASE_URL;
    const body = { categoryId, title: "", properties: {}, bodyMd: "" };
    const fetchMock = vi.fn().mockResolvedValue(Response.json(legacyResponse));
    vi.stubGlobal("fetch", fetchMock);

    await POST(createRequest(body));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:4000/v1/career/records",
      expect.objectContaining({ method: "POST", body: JSON.stringify(body) }),
    );
  });

  it("Spring 생성 뒤 Fastify 조회 연결이 실패하면 502를 반환한다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(springResponse, { status: 201 }))
      .mockRejectedValueOnce(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      createRequest({ categoryId, title: "", properties: {}, bodyMd: "" }),
    );

    expect(response.status).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
