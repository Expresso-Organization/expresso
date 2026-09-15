import { afterEach, expect, it, vi } from "vitest";
const session = vi.hoisted(() => ({ token: "token" as string | null }));
vi.mock("@/lib/session", () => ({ readAccessToken: async () => session.token }));
import { POST } from "./route";
const request = (body: unknown) => new Request("http://localhost/api/agent/consent", { method: "POST", body: JSON.stringify(body) });
afterEach(() => { vi.unstubAllGlobals(); session.token = "token"; });
it("인증 없이 동의를 기록하지 않는다", async () => {
  session.token = null; const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  expect((await POST(request({ scopes: ["career_records"], policyVersion: 1 }))).status).toBe(401);
  expect(fetcher).not.toHaveBeenCalled();
});
it("화면에서 요청한 범위와 정책 버전만 전달한다", async () => {
  const payload = { data: { policyVersion: 1, consents: ["career_records", "job_posting_analysis"].map(scope => ({ scope, granted: scope === "career_records", policyVersion: scope === "career_records" ? 1 : null, grantedAt: scope === "career_records" ? "2026-09-15T00:00:00.000Z" : null, revokedAt: null, needsRenewal: false })) } };
  const fetcher = vi.fn(async (_url: string, _options: RequestInit) => Response.json(payload)); vi.stubGlobal("fetch", fetcher);
  expect((await POST(request({ scopes: ["career_records"], policyVersion: 1 }))).status).toBe(200);
  expect(JSON.parse(String(fetcher.mock.calls[0]![1].body))).toEqual({ scopes: ["career_records"], policyVersion: 1 });
  expect((await POST(request({ scopes: ["job_posting_analysis"], policyVersion: 1 }))).status).toBe(400);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
