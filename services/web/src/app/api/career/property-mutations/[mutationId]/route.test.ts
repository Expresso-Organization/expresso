import { API_PREFIX } from "@expresso/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ readAccessToken: vi.fn() }));
vi.mock("@/lib/session", () => ({ readAccessToken: mocks.readAccessToken }));
vi.mock("@/lib/api/client", () => ({ API_BASE_URL: "http://backend.test" }));
import { GET } from "./route";
import { POST } from "./resume/route";

const mutationId = "00000000-0000-4000-8000-000000000001";
const categoryId = "00000000-0000-4000-8000-000000000002";
const propertyId = "00000000-0000-4000-8000-000000000003";
const status = { id: mutationId, categoryId, propertyId, status: "failed", active: true, processedCount: 1, totalCount: 2, retryable: true, updatedAt: "2026-09-01T00:00:00Z", completedAt: null };
const params = { params: Promise.resolve({ mutationId }) };
function request(method: "GET" | "POST", body?: unknown) {
  return new Request("http://web.test/api/mutation?userId=client-owner", { method, headers: { authorization: "Bearer client-token", "content-type": "application/json" }, ...(method === "POST" && body !== undefined ? { body: JSON.stringify(body) } : {}) });
}
beforeEach(() => {
  mocks.readAccessToken.mockReset().mockResolvedValue("server-session-token");
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ data: status })));
});
afterEach(() => vi.unstubAllGlobals());
describe.each([["GET", GET, ""], ["POST", POST, "/resume"]] as const)("property mutation %s BFF", (method, handler, suffix) => {
  it("requires the server session despite a client authorization header", async () => {
    mocks.readAccessToken.mockResolvedValue(null);
    expect((await handler(request(method, {}), params)).status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("validates route IDs before forwarding", async () => {
    expect((await handler(request(method, {}), { params: Promise.resolve({ mutationId: "invalid" }) })).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("forwards server authentication without owner input or a shared cache", async () => {
    const original = request(method, {});
    const response = await handler(original, params);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: status });
    expect(fetch).toHaveBeenCalledExactlyOnceWith("http://backend.test" + API_PREFIX + "/career/property-mutations/" + mutationId + suffix, {
      ...(method === "POST" ? { method: "POST", body: "{}" } : {}),
      headers: { authorization: "Bearer server-session-token", accept: "application/json", ...(method === "POST" ? { "content-type": "application/json" } : {}) },
      cache: "no-store", signal: original.signal,
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.has("authorization")).toBe(false);
  });
  it.each([404, 409])("retains backend rejection %s with no private payload", async (code) => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ operationFingerprint: "private" }, { status: code })));
    const response = await handler(request(method, {}), params);
    expect(response.status).toBe(code);
    expect(await response.text()).toBe("");
  });
  it("rejects upstream owner/plan fields and invalid progress", async () => {
    for (const data of [{ ...status, userId: categoryId }, { ...status, processedCount: 3 }, { ...status, retryable: false }]) {
      vi.stubGlobal("fetch", vi.fn(async () => Response.json({ data })));
      expect((await handler(request(method, {}), params)).status).toBe(502);
    }
  });
  it("rejects a response for a different mutation", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ data: { ...status, id: categoryId } })));
    expect((await handler(request(method, {}), params)).status).toBe(502);
  });
});
describe("property mutation resume body", () => {
  it("accepts an omitted body and forwards the same empty object", async () => {
    expect((await POST(request("POST"), params)).status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ body: "{}" }));
  });
  it("rejects owner, failure-policy and malformed input before forwarding", async () => {
    for (const body of [{ userId: categoryId }, { confirmLossy: true }, null, []]) {
      expect((await POST(request("POST", body), params)).status).toBe(400);
    }
    expect((await POST(new Request("http://web.test/api/mutation", { method: "POST", body: "{" }), params)).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
});