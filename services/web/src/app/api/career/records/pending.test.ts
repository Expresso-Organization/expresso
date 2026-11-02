import { afterEach, expect, it, vi } from "vitest";
const token = vi.hoisted(() => ({ value: "server-only-token" as string | null }));
vi.mock("@/lib/session", () => ({ readAccessToken: async () => token.value }));
vi.mock("@/lib/api/client", () => ({ API_BASE_URL: "http://backend.invalid" }));
import { POST } from "./route";
import { PATCH } from "./[recordId]/route";
const id = "00000000-0000-4000-8000-000000000001", opId = "00000000-0000-4000-8000-000000000002";
const operation = { operationId: opId, producer: "career-product", state: "retry", recordId: id, owners: { business: "completed", document: "pending" }, statusUrl: "/v1/career/write-operations/" + opId, retryable: true, updatedAt: "2026-10-09T00:00:00Z" };
afterEach(() => { vi.unstubAllGlobals(); token.value = "server-only-token"; });
it.each(["create", "update"])("preserves actual %s pending202 and server-owned status Location", async kind => {
  const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => Response.json({ data: operation }, { status: 202 }));
  vi.stubGlobal("fetch", fetcher);
  const request = new Request("http://web/api/career/records/" + id, { method: kind === "create" ? "POST" : "PATCH", headers: { "content-type": "application/json", "if-match": '"v1"', "idempotency-key": opId }, body: JSON.stringify(kind === "create" ? { categoryId: id, title: "Create", propertyValues: [], bodyMd: "Original body" } : { title: "Update" }) });
  const response = kind === "create" ? await POST(request) : await PATCH(request, { params: Promise.resolve({ recordId: id }) });
  expect(response.status).toBe(202);
  expect(await response.json()).toEqual({ data: operation });
  expect(response.headers.get("location")).toBe(operation.statusUrl);
  expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({ authorization: "Bearer server-only-token", "idempotency-key": opId });
});
it("rejects mismatched pending record identity and completed/private data presented as202", async () => {
  for (const data of [{ ...operation, recordId: opId }, { ...operation, state: "completed", retryable: false }, { ...operation, fingerprint: "a".repeat(64) }]) {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ data }, { status: 202 })));
    const response = await PATCH(new Request("http://web/api/career/records/" + id, { method: "PATCH", headers: { "content-type": "application/json", "if-match": '"v1"' }, body: JSON.stringify({ title: "Update" }) }), { params: Promise.resolve({ recordId: id }) });
    expect(response.status).toBe(502);
  }
});
it("does not call upstream without the httpOnly server session", async () => {
  token.value = null;
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  expect((await POST(new Request("http://web/api/career/records", { method: "POST", body: "{}" }))).status).toBe(401);
  expect(fetcher).not.toHaveBeenCalled();
});
it.each(["create","update"])("preserves safe terminal %s operation409 metadata without forwarding private error details",async kind=>{
 const terminal={...operation,state:"recovery-required",retryable:false};
 vi.stubGlobal("fetch",vi.fn(async()=>Response.json({error:{code:"CONFLICT",message:"Conflict",requestId:id,details:{operation:terminal,command:"private command"}}},{status:409})));
 const request=new Request("http://web/api/career/records/"+id,{method:kind==="create"?"POST":"PATCH",headers:{"content-type":"application/json","if-match":'"v1"',"idempotency-key":opId},body:JSON.stringify(kind==="create"?{categoryId:id,title:"Create",propertyValues:[],bodyMd:"Original body"}:{bodyMd:"Original body"})});
 const response=kind==="create"?await POST(request):await PATCH(request,{params:Promise.resolve({recordId:id})});
 expect(response.status).toBe(409);
 expect(await response.json()).toEqual({error:{code:"CONFLICT",message:"Conflict",requestId:id,details:{operation:terminal}}});
});
