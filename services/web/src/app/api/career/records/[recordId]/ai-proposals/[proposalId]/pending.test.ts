import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/session", () => ({ readAccessToken: vi.fn(async () => "server-secret") }));
import { POST as apply } from "./apply/route";
import { POST as undo } from "./undo/route";
const id = "00000000-0000-4000-8000-000000000001";
const params = Promise.resolve({ recordId: id, proposalId: id });
const operation = { operationId: id, producer: "ai-proposal", state: "pending", recordId: id, owners: { business: "pending", document: "not-required" }, statusUrl: "/v1/career/write-operations/" + id, retryable: true, updatedAt: "2026-10-09T00:00:00Z" };

it("forwards only a scoped pre-prepare apply rejection without private validation details",async()=>{
 const aiApplyRejection={recordId:id,proposalId:id,state:"not-prepared"};
 vi.stubGlobal("fetch",vi.fn(async()=>Response.json({error:{code:"CONFLICT",message:"Conflict",requestId:id,details:{aiApplyRejection,privateValue:"private value"}}},{status:409})));
 const response=await apply(new Request("http://web/api",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({expectedDocumentVersion:0,commandIndexes:[0],propertyChangeIndexes:[0]})}),{params});
 expect(response.status).toBe(409);expect(await response.json()).toEqual({error:{code:"CONFLICT",message:"Conflict",requestId:id,details:{aiApplyRejection}}});
});
afterEach(() => vi.unstubAllGlobals());
describe("AI apply and Undo pending BFF", () => {
  it.each(["apply", "undo"] as const)("preserves actual 202 from %s and forwards its durable key", async kind => {
    const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => Response.json({ data: operation }, { status: 202 }));
    vi.stubGlobal("fetch", fetcher);
    const body = kind === "apply" ? { expectedDocumentVersion: 0, commandIndexes: [], propertyChangeIndexes: [0] } : { expectedDocumentVersion: 0 };
    const response = await (kind === "apply" ? apply : undo)(new Request("http://web/api", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "stable-request-key" }, body: JSON.stringify(body) }), { params });
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ data: operation });
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ headers: { "idempotency-key": "stable-request-key" } });
  });
  it("returns explicit no-document-target without a fake bootstrap", async () => {
    const body = { data: { outcome: "no-document-target", scope: "none", businessChangesRetained: true } };
    vi.stubGlobal("fetch", vi.fn(async (_url: string, _init?: RequestInit) => Response.json(body)));
    const response = await undo(new Request("http://web/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedDocumentVersion: 0 }) }), { params });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(body);
  });
});
it.each(["apply","undo"] as const)("forwards safe terminal %s operation409 without private owner details",async kind=>{
 const terminal={...operation,state:"recovery-required",retryable:false};
 vi.stubGlobal("fetch",vi.fn(async()=>Response.json({error:{code:"CONFLICT",message:"Conflict",requestId:id,details:{operation:terminal,plan:"private plan"}}},{status:409})));
 const body=kind==="apply"?{expectedDocumentVersion:0,commandIndexes:[],propertyChangeIndexes:[0]}:{expectedDocumentVersion:0};
 const response=await(kind==="apply"?apply:undo)(new Request("http://web/api",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)}),{params});
 expect(response.status).toBe(409);
 expect(await response.json()).toEqual({error:{code:"CONFLICT",message:"Conflict",requestId:id,details:{operation:terminal}}});
});
