import { beforeEach, describe, expect, it, vi } from "vitest";

const { readAccessToken } = vi.hoisted(() => ({ readAccessToken: vi.fn() }));
vi.mock("@/lib/session", () => ({ readAccessToken }));

import { POST } from "./route";

describe("POST /api/career/categories/[categoryId]/property-schema/[propertyId]/restore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readAccessToken.mockResolvedValue("exps_token");
  });

  it("MVP에서 제외한 Property restore를 upstream에 전달하지 않는다", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(new Request("http://localhost/api/restore", { method: "POST" }), {
      params: Promise.resolve({
        categoryId: "10000000-0000-4000-8000-000000000001",
        propertyId: "10000000-0000-4000-8000-000000000002",
      }),
    });

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
