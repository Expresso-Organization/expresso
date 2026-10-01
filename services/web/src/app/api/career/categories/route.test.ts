import { CareerCategorySchema } from "@expresso/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { readAccessToken } = vi.hoisted(() => ({ readAccessToken: vi.fn() }));
vi.mock("@/lib/session", () => ({ readAccessToken }));

import { POST } from "./route";

const requestBody = {
  key: "custom_projects",
  name: "사용자 프로젝트",
  icon: "sparkles",
  defaultView: "gallery" as const,
  propertySchema: {},
};
const createdCategory = {
  id: "10000000-0000-4000-8000-000000000001",
  key: "custom_projects",
  name: "사용자 프로젝트",
  icon: "sparkles",
  defaultView: "gallery",
  isSystem: false,
  propertySchema: {},
  propertySchemaV2: [],
  schemaVersion: 1,
  sortOrder: 7,
  recordCount: 0,
  version: 1,
};

function request(body: unknown = requestBody) {
  return new Request("http://localhost/api/career/categories", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/career/categories", () => {
  beforeEach(() => {
    readAccessToken.mockResolvedValue("exps_session_token");
    process.env.CAREER_SPRING_API_BASE_URL = "http://localhost:4100";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.CAREER_SPRING_API_BASE_URL;
  });

  it("검증한 custom Category 요청과 opaque 인증을 Spring으로 전달한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(
      { data: createdCategory },
      { status: 201, headers: { etag: '"v1"' } },
    ));
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(request());

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4100/v1/career/categories",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer exps_session_token",
          "content-type": "application/json",
        }),
        body: JSON.stringify(requestBody),
      }),
    );
    expect(response.status).toBe(201);
    expect(response.headers.get("etag")).toBe('"v1"');
    const payload = await response.json() as { data: unknown };
    expect(CareerCategorySchema.parse(payload.data)).toEqual(createdCategory);
  });

  it("Spring 주소가 없으면 Fastify로 되돌리지 않고 503을 반환한다", async () => {
    delete process.env.CAREER_SPRING_API_BASE_URL;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
