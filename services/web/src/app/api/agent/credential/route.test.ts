import { afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ token: "token" as string | null }));
vi.mock("@/lib/session", () => ({ readAccessToken: async () => state.token }));
import { PUT, DELETE } from "./route";
afterEach(() => { vi.unstubAllGlobals(); state.token = "token"; });
it("등록/삭제 모두 인증을 요구한다", async () => {
  state.token = null; const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  expect((await PUT(new Request("http://localhost/api/agent/credential", { method: "PUT" }))).status).toBe(401);
  expect((await DELETE(new Request("http://localhost/api/agent/credential", { method: "DELETE" }))).status).toBe(401);
  expect(fetcher).not.toHaveBeenCalled();
});
it("키 저장 응답은 상태만 반환하고 삭제 요청도 전달한다", async () => {
  const fetcher = vi.fn(async (_url: string, init: RequestInit) => Response.json({ data: { configured: init.method === "PUT" } })); vi.stubGlobal("fetch", fetcher);
  const saved = await PUT(new Request("http://localhost/api/agent/credential", { method: "PUT", body: JSON.stringify({ apiKey: "sk-ant-test-only-secret" }) }));
  expect(await saved.json()).toEqual({ data: { configured: true } });
  const deleted = await DELETE(new Request("http://localhost/api/agent/credential", { method: "DELETE" }));
  expect(await deleted.json()).toEqual({ data: { configured: false } });
});
