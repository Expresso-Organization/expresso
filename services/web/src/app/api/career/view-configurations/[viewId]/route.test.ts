import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session", () => ({ readAccessToken: async () => "token" }));
import { DELETE } from "./route";

const viewId = "00000000-0000-4000-8000-000000000101";

describe("저장 뷰 프록시", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("본문 없는 삭제에는 content-type을 붙이지 않는다", async () => {
    const upstream = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", upstream);
    const response = await DELETE(new Request(`http://localhost/api/career/view-configurations/${viewId}`, { method: "DELETE", headers: { "if-match": "\"v3\"" } }), { params: Promise.resolve({ viewId }) });
    expect(response.status).toBe(204);
    const init = (upstream.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.headers).toMatchObject({ "if-match": "\"v3\"" });
    expect(init.headers).not.toHaveProperty("content-type");
    expect(init.body).toBeUndefined();
  });
});
