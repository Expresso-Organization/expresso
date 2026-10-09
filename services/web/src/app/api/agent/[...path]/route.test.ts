import { afterEach, describe, expect, it, vi } from "vitest";
const session = vi.hoisted(() => ({ token: "test-token" as string | null }));
vi.mock("@/lib/session", () => ({ readAccessToken: async () => session.token }));
import { POST } from "./route";
const id = "00000000-0000-4000-8000-000000000001";
afterEach(() => { vi.unstubAllGlobals(); session.token = "test-token"; });
describe("에이전트 BFF", () => {
  it("취소 요청에 유효한 빈 JSON을 전달한다", async () => {
    const fetcher = vi.fn(async (_url: string, _options?: RequestInit) => Response.json({ data: { id, title: "대화", contexts: [], messages: [], run: null, version: 1, updatedAt: "2026-09-14T00:00:00.000Z" } }));
    vi.stubGlobal("fetch", fetcher);
    const response = await POST(new Request("http://localhost/api/agent/conversations/" + id + "/cancel", { method: "POST", body: "{}" }), { params: Promise.resolve({ path: ["conversations", id, "cancel"] }) });
    expect(response.status).toBe(200);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ method: "POST", body: "{}", headers: { authorization: "Bearer test-token" } });
  });
  it("세션이 없으면 백엔드를 호출하지 않는다", async () => {
    session.token = null; const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const response = await POST(new Request("http://localhost/api/agent/conversations", { method: "POST" }), { params: Promise.resolve({ path: ["conversations"] }) });
    expect(response.status).toBe(401); expect(fetcher).not.toHaveBeenCalled();
  });
});
