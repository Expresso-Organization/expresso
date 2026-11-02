import { afterEach, describe, expect, it, vi } from "vitest";
const session = vi.hoisted(() => ({ readAccessToken: vi.fn(async () => "server-secret") }));
vi.mock("@/lib/session", () => session);
import { GET } from "./route";
const id = "00000000-0000-4000-8000-000000000001";
const operation = { operationId: id, producer: "ai-proposal", state: "pending", recordId: id, owners: { business: "pending", document: "not-required" }, statusUrl: "/v1/career/write-operations/" + id, retryable: true, updatedAt: "2026-10-09T00:00:00Z" };
afterEach(() => { vi.unstubAllGlobals(); session.readAccessToken.mockResolvedValue("server-secret"); });
describe("owned write operation BFF", () => {
  it("uses server authentication and validates the public scoped operation", async () => {
    const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => Response.json({ data: operation }));
    vi.stubGlobal("fetch", fetcher);
    const response = await GET(new Request("http://web/api"), { params: Promise.resolve({ operationId: id }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: operation });
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ headers: { authorization: "Bearer server-secret" }, cache: "no-store" });
  });
  it("rejects missing auth and client ownership overrides", async () => {
    session.readAccessToken.mockResolvedValue(null as unknown as string);
    expect((await GET(new Request("http://web/api"), { params: Promise.resolve({ operationId: id }) })).status).toBe(401);
    session.readAccessToken.mockResolvedValue("server-secret");
    expect((await GET(new Request("http://web/api?userId=" + id), { params: Promise.resolve({ operationId: id }) })).status).toBe(400);
  });
  it("rejects mismatched IDs and private owner metadata", async () => {
    for (const data of [{ ...operation, operationId: "00000000-0000-4000-8000-000000000002" }, { ...operation, userId: id }]) {
      vi.stubGlobal("fetch", vi.fn(async (_url: string, _init?: RequestInit) => Response.json({ data })));
      expect((await GET(new Request("http://web/api"), { params: Promise.resolve({ operationId: id }) })).status).toBe(502);
    }
  });
});