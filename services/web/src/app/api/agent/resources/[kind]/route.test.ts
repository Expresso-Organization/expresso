import { afterEach, describe, expect, it, vi } from "vitest";
const session = vi.hoisted(() => ({ token: "test-token" as string | null }));
vi.mock("@/lib/session", () => ({ readAccessToken: async () => session.token }));
import { GET } from "./route";
const get = (kind: string, query = "") => GET(new Request(`http://localhost/api/agent/resources/${kind}${query}`), { params: Promise.resolve({ kind }) });
afterEach(() => { vi.unstubAllGlobals(); session.token = "test-token"; });
describe("자료 목록 BFF", () => {
  it("세션 없이 자료 목록에 접근할 수 없다", async () => {
    session.token = null; const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    expect((await get("portfolios")).status).toBe(401); expect(fetcher).not.toHaveBeenCalled();
  });
  it("허용하지 않은 자료 종류와 잘못된 페이지를 차단한다", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    expect((await get("users")).status).toBe(404);
    expect((await get("jobs", "?page=-1")).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("내 포트폴리오 다음 커서를 인증된 목록 요청으로 전달한다", async () => {
    const payload = { data: [], page: { hasNextPage: false, nextCursor: null } };
    const fetcher = vi.fn(async () => Response.json(payload)); vi.stubGlobal("fetch", fetcher);
    const response = await get("portfolios", "?cursor=next-page&limit=20");
    expect(response.status).toBe(200); expect(await response.json()).toEqual(payload);
    const [url, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URL(url).searchParams.get("cursor")).toBe("next-page");
    expect(new Headers(options.headers).get("authorization")).toBe("Bearer test-token");
  });
  it("백엔드 계약을 어긴 응답은 목록으로 표시하지 않는다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ data: [{ id: "bad" }] })));
    expect((await get("records")).status).toBe(502);
  });
  it("백엔드 연결 실패를 재시도 가능한 오류로 반환한다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const response = await get("jobs"); expect(response.status).toBe(502);
    expect((await response.json()).error.message).toContain("다시 시도");
  });
});
