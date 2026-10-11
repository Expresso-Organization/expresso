import { API_PREFIX } from "@expresso/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ readAccessToken: vi.fn() }));
vi.mock("@/lib/session", () => ({ readAccessToken: mocks.readAccessToken }));
vi.mock("@/lib/api/client", () => ({ API_BASE_URL: "http://backend.test" }));
import { POST } from "./route";

const categoryId = "00000000-0000-4000-8000-000000000001";
const propertyId = "00000000-0000-4000-8000-000000000002";
const optionId = "00000000-0000-4000-8000-000000000003";
const params = { params: Promise.resolve({ categoryId, propertyId }) };
function request(body: unknown = { label: "  C++  " }) {
  return new Request("http://web.test/api/options", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer client-supplied-token" }, body: JSON.stringify(body) });
}
beforeEach(() => {
  mocks.readAccessToken.mockReset().mockResolvedValue("server-session-token");
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ data: { id: optionId, name: "  C++  " }, version: 1 })));
});
afterEach(() => vi.unstubAllGlobals());
describe("private Career option BFF route", () => {
  it("requires the server session even when a client supplies authorization", async () => {
    mocks.readAccessToken.mockResolvedValue(null);
    expect((await POST(request(), params)).status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("forwards the exact label with only server credentials and no shared cache", async () => {
    const original = request();
    const response = await POST(original, params);
    expect(await response.json()).toEqual({ data: { id: optionId, name: "  C++  " }, version: 1 });
    expect(fetch).toHaveBeenCalledExactlyOnceWith("http://backend.test" + API_PREFIX + "/career/categories/" + categoryId + "/property-schema/" + propertyId + "/options", {
      method: "POST", headers: { authorization: "Bearer server-session-token", "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ label: "  C++  " }), cache: "no-store", signal: original.signal,
    });
    expect(response.headers.has("authorization")).toBe(false);
  });
  it("rejects a client-selected owner and invalid route IDs before forwarding", async () => {
    expect((await POST(request({ label: "tag", userId: categoryId }), params)).status).toBe(400);
    expect((await POST(request(), { params: Promise.resolve({ categoryId: "invalid", propertyId }) })).status).toBe(400);
    expect((await POST(request(), { params: Promise.resolve({ categoryId, propertyId: "invalid" }) })).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects malformed JSON before forwarding", async () => {
    const invalid = new Request("http://web.test/api/options", { method: "POST", body: "{" });
    expect((await POST(invalid, params)).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([403, 409])("preserves backend rejection %s without exposing its payload", async (status) => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ private: "backend details" }, { status })));
    const response = await POST(request(), params);
    expect(response.status).toBe(status);
    expect(await response.text()).toBe("");
  });
  it("rejects a backend response outside the shared contract", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ data: { id: optionId, name: "tag", userId: categoryId }, version: 1 })));
    expect((await POST(request(), params)).status).toBe(502);
  });
});