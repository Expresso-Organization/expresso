// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiProposalPanel, type AiProposalClient } from "./AiProposalPanel";
const id = "00000000-0000-4000-8000-000000000001";
const proposal = { proposalId: id, recordId: id, baseDocumentVersion: 0, selection: { blockIds: [id] }, summary: "Canonical proposal", commands: [], propertyChanges: [{ propertyId: id, previousValue: null, nextValue: { type: "text" as const, value: "after" } }], createdAt: "2026-10-09T00:00:00Z", expiresAt: "2026-10-10T00:00:00Z", status: "ready" as const };
const operation = { operationId: id, producer: "ai-proposal", state: "pending", recordId: id, owners: { business: "pending", document: "not-required" }, statusUrl: "/v1/career/write-operations/" + id, retryable: true, updatedAt: "2026-10-09T00:00:00Z" };
function api(apply: unknown, undo: unknown = undefined): AiProposalClient {
  return { create: vi.fn(async () => proposal), get: vi.fn(async () => ({ ...proposal, status: "applied" as const, undoScope: "none" as const, businessChangesRetained: true })), apply: vi.fn(async () => apply) as AiProposalClient["apply"], undo: vi.fn(async () => undo) as AiProposalClient["undo"], reject: vi.fn(async () => {}), cancel: vi.fn(async () => {}) };
}
async function ready(client: AiProposalClient, onApplied = vi.fn()) {
  render(<AiProposalPanel recordId={id} documentVersion={0} selectedBlockIds={[id]} client={client} onApplied={onApplied} />);
  fireEvent.change(screen.getByLabelText("AI에게 편집 요청"), { target: { value: "edit" } });
  fireEvent.click(screen.getByRole("button", { name: "제안 만들기" }));
  await screen.findByText(proposal.summary);
  return onApplied;
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); sessionStorage.clear(); });
describe("AI canonical owner outcomes", () => {
  it("keeps business-only applied and explains the absent document target", async () => {
    await ready(api({ ...proposal, status: "applied" as const, undoScope: "none" as const, businessChangesRetained: true }));
    fireEvent.click(screen.getByRole("button", { name: /개 변경 적용/ }));
    expect(await screen.findByText(/문서 복원 대상이 없습니다/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /개 변경 적용/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "변경 되돌리기" })).toBeNull();
  });
  it("labels mixed Undo as document-only and retains applied on an explicit no-target result", async () => {
    await ready(api({ ...proposal, status: "applied", appliedDocumentVersion: 1, undoScope: "document", businessChangesRetained: true }, { outcome: "no-document-target", scope: "none", businessChangesRetained: true }));
    fireEvent.click(screen.getByRole("button", { name: /개 변경 적용/ }));
    fireEvent.click(await screen.findByRole("button", { name: "본문 변경 되돌리기" }));
    expect(screen.getByText(/속성 변경은 유지됩니다/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "본문 되돌리기 확인" }));
    expect(await screen.findByText(/문서 복원 대상이 없습니다/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /개 변경 적용/ })).toBeNull();
  });
  it("does not claim completion or refresh properties until the owned pending operation completes", async () => {
    let resolve!: (value: Response) => void;
    const statusRequest = vi.fn(() => new Promise<Response>(done => { resolve = done; }));
    vi.stubGlobal("fetch", statusRequest);
    const applied = await ready(api(operation));
    fireEvent.click(screen.getByRole("button", { name: /개 변경 적용/ }));
    expect(await screen.findByText(/변경 적용 중/)).toBeTruthy();
    expect(applied).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /개 변경 적용/ })).toBeNull();
    await waitFor(() => expect(statusRequest).toHaveBeenCalledWith("/api/career/write-operations/" + id, expect.objectContaining({ cache: "no-store" })));
    resolve(Response.json({ data: { ...operation, state: "completed", owners: { business: "completed", document: "not-required" }, retryable: false } }));
    await waitFor(() => expect(applied).toHaveBeenCalledOnce());
    expect(await screen.findByText(/문서 복원 대상이 없습니다/)).toBeTruthy();
  });
});it("does not adopt an earlier record's apply response after switching records", async () => {
  let resolve!: (value: Awaited<ReturnType<AiProposalClient["apply"]>>) => void;
  const client = api(undefined);
  client.apply = vi.fn(() => new Promise<Awaited<ReturnType<AiProposalClient["apply"]>>>(done => { resolve = done; }));
  const applied = vi.fn();
  const view = render(<AiProposalPanel recordId={id} documentVersion={0} selectedBlockIds={[id]} client={client} onApplied={applied} />);
  fireEvent.change(screen.getByLabelText("AI에게 편집 요청"), { target: { value: "edit" } });
  fireEvent.click(screen.getByRole("button", { name: "제안 만들기" }));
  await screen.findByText(proposal.summary);
  fireEvent.click(screen.getByRole("button", { name: /개 변경 적용/ }));
  view.rerender(<AiProposalPanel recordId="00000000-0000-4000-8000-000000000002" documentVersion={0} selectedBlockIds={[id]} client={client} onApplied={applied} />);
  resolve({ ...proposal, status: "applied", undoScope: "none", businessChangesRetained: true });
  await waitFor(() => expect(screen.queryByText(proposal.summary)).toBeNull());
  expect(applied).not.toHaveBeenCalled();
  expect(screen.queryByText(/문서 복원 대상이 없습니다/)).toBeNull();
});
it("shows an actual terminal409 through the default AI client without reapplying or pretending conflict-ready",async()=>{
 const terminal={...operation,state:"recovery-required",retryable:false};
 const fetcher=vi.fn(async(url:string,init?:RequestInit)=>{
  if(url.endsWith("/apply"))return Response.json({error:{code:"CONFLICT",message:"Conflict",requestId:id,details:{operation:terminal}}},{status:409});
  if(url.includes("/write-operations/"))return Response.json({data:terminal});
  return Response.json({data:proposal});
 });
 vi.stubGlobal("fetch",fetcher);
 const onApplied=vi.fn();render(<AiProposalPanel recordId={id} documentVersion={0} selectedBlockIds={[id]} onApplied={onApplied}/>);
 fireEvent.change(screen.getByLabelText("AI에게 편집 요청"),{target:{value:"edit"}});fireEvent.click(screen.getByRole("button",{name:"제안 만들기"}));await screen.findByText(proposal.summary);
 fireEvent.click(screen.getByRole("button",{name:/개 변경 적용/}));
 expect((await screen.findByRole("alert")).textContent).toContain("복구 확인");
 expect(screen.queryByRole("button",{name:/개 변경 적용/})).toBeNull();
 expect(onApplied).not.toHaveBeenCalled();
 expect(fetcher.mock.calls.filter(([url,init])=>url.endsWith("/apply")&&init?.method==="POST")).toHaveLength(1);
});

it("retries the original apply body and idempotency key after a lost response and document version advance",async()=>{
 const requests:Array<{body:string;key:string|null}>=[];
 const fetcher=vi.fn(async(url:string,init?:RequestInit)=>{
  if(url.endsWith("/apply")){
   requests.push({body:String(init?.body),key:new Headers(init?.headers).get("idempotency-key")});
   if(requests.length===1)throw new TypeError("lost prepared202 response");
   if(requests[1]!.body!==requests[0]!.body||requests[1]!.key!==requests[0]!.key)return Response.json({error:{code:"CONFLICT"}},{status:409});
   return Response.json({data:operation},{status:202});
  }
  if(url.includes("/write-operations/"))return Response.json({data:{...operation,state:"completed",retryable:false,owners:{business:"completed",document:"not-required"}}});
  return Response.json({data:url.endsWith("/"+id)?{...proposal,progress:null,appliedDocumentVersion:null,revisionId:null}:proposal});
 });
 vi.stubGlobal("fetch",fetcher);
 const onApplied=vi.fn(),view=render(<AiProposalPanel recordId={id} documentVersion={0} selectedBlockIds={[id]} onApplied={onApplied}/>);
 fireEvent.change(screen.getByLabelText("AI에게 편집 요청"),{target:{value:"edit"}});fireEvent.click(screen.getByRole("button",{name:"제안 만들기"}));await screen.findByText(proposal.summary);
 fireEvent.click(screen.getByRole("button",{name:/개 변경 적용/}));await screen.findByRole("alert");
 view.rerender(<AiProposalPanel recordId={id} documentVersion={1} selectedBlockIds={[id]} onApplied={onApplied}/>);
 fireEvent.click(screen.getByRole("button",{name:/개 변경 적용/}));
 await waitFor(()=>expect(requests).toHaveLength(2));
 expect(JSON.parse(requests[0]!.body).expectedDocumentVersion).toBe(0);
 expect(requests[1]).toEqual(requests[0]);
 await waitFor(()=>expect(onApplied).toHaveBeenCalledOnce());
});
it("recovers the frozen first request after remount even when the live document version changed",async()=>{
 const requests:Array<{body:string;key:string|null}>=[];
 let lost=true;
 vi.stubGlobal("fetch",vi.fn(async(url:string,init?:RequestInit)=>{
  if(url.endsWith("/apply")){
   requests.push({body:String(init?.body),key:new Headers(init?.headers).get("idempotency-key")});
   if(lost){lost=false;throw new TypeError("lost response");}
   return Response.json({data:{...proposal,status:"applied",progress:null,appliedDocumentVersion:null,revisionId:null,undoScope:"none",businessChangesRetained:true}});
  }
  return Response.json({data:{...proposal,progress:null,appliedDocumentVersion:null,revisionId:null}});
 }));
 const first=render(<AiProposalPanel recordId={id} documentVersion={0} announcedProposal={{proposalId:id,baseDocumentVersion:0,status:"ready"}}/>);
 await screen.findByText(proposal.summary);fireEvent.click(screen.getByRole("button",{name:/개 변경 적용/}));await screen.findByRole("alert");first.unmount();
 render(<AiProposalPanel recordId={id} documentVersion={2} announcedProposal={{proposalId:id,baseDocumentVersion:0,status:"ready"}}/>);
 await screen.findByText(proposal.summary);fireEvent.click(screen.getByRole("button",{name:/개 변경 적용/}));
 await screen.findByText(/문서 복원 대상이 없습니다/);
 expect(requests).toHaveLength(2);expect(requests[1]).toEqual(requests[0]);
 expect(sessionStorage.getItem("ex-career-ai-apply:v1:"+id+":"+id)).toBeNull();
});
it("adopts a saved pending operation when the current proposal is announced after reconnect",async()=>{
 sessionStorage.setItem("ex-career-write:v1:ai:"+id+":"+id+":apply:operation",id);
 let finish!:(response:Response)=>void,completed=false;
 const fetcher=vi.fn(async(url:string)=>{
  if(url.includes("/write-operations/"))return new Promise<Response>(resolve=>{finish=response=>{completed=true;resolve(response);};});
  return Response.json({data:{...proposal,status:completed?"applied":"ready",progress:null,appliedDocumentVersion:null,revisionId:null,undoScope:"none",businessChangesRetained:completed}});
 });
 vi.stubGlobal("fetch",fetcher);const applied=vi.fn();
 render(<AiProposalPanel recordId={id} documentVersion={1} announcedProposal={{proposalId:id,baseDocumentVersion:0,status:"ready"}} onApplied={applied}/>);
 expect(await screen.findByText(/변경 적용 중/)).toBeTruthy();expect(applied).not.toHaveBeenCalled();
 await waitFor(()=>expect(finish).toBeTypeOf("function"));
 finish(Response.json({data:{...operation,state:"completed",retryable:false,owners:{business:"completed",document:"not-required"}}}));
 await waitFor(()=>expect(applied).toHaveBeenCalledOnce());
 expect(fetcher.mock.calls.some(([url])=>url.endsWith("/apply"))).toBe(false);
 expect(sessionStorage.getItem("ex-career-write:v1:ai:"+id+":"+id+":apply:operation")).toBeNull();
});
it("keeps A operation identity and frozen storage when proposal B arrives before A completes", async () => {
  const proposalBId = "00000000-0000-4000-8000-000000000002";
  const operationBId = "00000000-0000-4000-8000-000000000003";
  const proposalB = { ...proposal, proposalId: proposalBId, summary: "New proposal B" };
  const scopes = (proposalId: string) => "ex-career-write:v1:ai:" + id + ":" + proposalId + ":apply:operation";
  const bodies = (proposalId: string) => "ex-career-ai-apply:v1:" + id + ":" + proposalId;
  const requests: Array<{ url: string; signal?: AbortSignal | null | undefined; finish: (response: Response) => void }> = [];
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => new Promise<Response>(finish => requests.push({ url, signal: init?.signal, finish }))));
  let completed = false;
  const client = api(operation);
  client.get = vi.fn(async (_recordId, requestedId) => requestedId === proposalBId ? proposalB : { ...proposal, status: completed ? "applied" as const : "ready" as const, undoScope: "none" as const, businessChangesRetained: completed });
  const onApplied = vi.fn();
  const panel = render(<AiProposalPanel recordId={id} documentVersion={0} client={client} announcedProposal={{ proposalId: id, baseDocumentVersion: 0, status: "ready" }} onApplied={onApplied} />);
  await screen.findByText(proposal.summary);
  fireEvent.click(screen.getByRole("button", { name: /개 변경 적용/ }));
  await waitFor(() => expect(requests).toHaveLength(1));
  sessionStorage.setItem(scopes(proposalBId), operationBId);
  sessionStorage.setItem(bodies(proposalBId), JSON.stringify({ expectedDocumentVersion: 1, commandIndexes: [], propertyChangeIndexes: [0] }));
  panel.rerender(<AiProposalPanel recordId={id} documentVersion={1} client={client} announcedProposal={{ proposalId: proposalBId, createdAt: proposalB.createdAt, baseDocumentVersion: 1, status: "ready" }} onApplied={onApplied} />);
  await screen.findByText(proposalB.summary);
  expect(requests[0]!.signal?.aborted).toBe(false);
  expect(sessionStorage.getItem(scopes(id))).toBe(id);
  expect(sessionStorage.getItem(scopes(proposalBId))).toBe(operationBId);
  completed = true;
  requests[0]!.finish(Response.json({ data: { ...operation, state: "completed", owners: { business: "completed", document: "not-required" }, retryable: false } }));
  await waitFor(() => expect(onApplied).toHaveBeenCalledOnce());
  await waitFor(() => expect(sessionStorage.getItem(scopes(id))).toBeNull());
  expect(client.get).toHaveBeenLastCalledWith(id, id);
  expect(sessionStorage.getItem(bodies(id))).toBeNull();
  expect(sessionStorage.getItem(scopes(proposalBId))).toBe(operationBId);
  expect(sessionStorage.getItem(bodies(proposalBId))).not.toBeNull();
  expect(screen.getByText(proposalB.summary)).toBeTruthy();
  expect(screen.queryByText(/문서 복원 대상이 없습니다/)).toBeNull();
});
it.each(["older-time", "same-time-lower-id"] as const)("keeps the newest proposal for an out-of-order %s announcement", async order => {
  const newer = { ...proposal, proposalId: "00000000-0000-4000-8000-000000000020", summary: "Newest proposal", createdAt: "2026-10-09T02:00:00Z" };
  const older = { ...proposal, proposalId: order === "older-time" ? "00000000-0000-4000-8000-000000000099" : "00000000-0000-4000-8000-000000000010", summary: "Older proposal", createdAt: order === "older-time" ? "2026-10-09T01:00:00Z" : newer.createdAt };
  const client = api(undefined); client.get = vi.fn(async (_recordId, proposalId) => proposalId === newer.proposalId ? newer : older);
  const view = render(<AiProposalPanel recordId={id} documentVersion={0} client={client} announcedProposal={{ proposalId: newer.proposalId, baseDocumentVersion: 0, status: "ready" }} />);
  await screen.findByText(newer.summary);
  view.rerender(<AiProposalPanel recordId={id} documentVersion={0} client={client} announcedProposal={{ proposalId: older.proposalId, baseDocumentVersion: 0, status: "ready", ...{ createdAt: older.createdAt } }} />);
  await act(async () => {});
  expect(screen.queryByText(older.summary)).toBeNull();
  expect(screen.getByText(newer.summary)).toBeTruthy();
  expect(client.get).toHaveBeenCalledTimes(1);
});

it("does not replace a newer announced proposal with a delayed create response", async () => {
  const newer = { ...proposal, proposalId: "00000000-0000-4000-8000-000000000002", summary: "Newest announced proposal", createdAt: "2026-10-09T02:00:00Z" };
  let finishCreate!: (value: typeof proposal) => void;
  const client = api(undefined);
  client.create = vi.fn(() => new Promise<typeof proposal>(resolve => { finishCreate = resolve; }));
  let proposalReads = 0;
  client.get = vi.fn(async () => ++proposalReads === 1 ? newer : new Promise<never>(() => {}));
  const view = render(<AiProposalPanel recordId={id} documentVersion={0} selectedBlockIds={[id]} client={client} />);
  fireEvent.change(screen.getByLabelText("AI에게 편집 요청"), { target: { value: "edit" } }); fireEvent.click(screen.getByRole("button", { name: "제안 만들기" }));
  view.rerender(<AiProposalPanel recordId={id} documentVersion={0} selectedBlockIds={[id]} client={client} announcedProposal={{ proposalId: newer.proposalId, baseDocumentVersion: 0, status: "ready", ...{ createdAt: newer.createdAt } }} />);
  await screen.findByText(newer.summary);
  await act(async () => { finishCreate(proposal); });
  expect(screen.queryByText(proposal.summary)).toBeNull();
  expect(screen.getByText(newer.summary)).toBeTruthy();
  expect(client.get).toHaveBeenCalledTimes(1);
});
it("refreshes A after a delayed direct apply without marking newly announced B applied", async () => {
  const newer = { ...proposal, proposalId: "00000000-0000-4000-8000-000000000002", summary: "New ready proposal B", createdAt: "2026-10-09T02:00:00Z" };
  let finishApply!: (value: Awaited<ReturnType<AiProposalClient["apply"]>>) => void;
  const client = api(undefined);
  client.apply = vi.fn(() => new Promise<Awaited<ReturnType<AiProposalClient["apply"]>>>(resolve => { finishApply = resolve; }));
  let newerReads = 0;
  client.get = vi.fn(async (_recordId, requestedId) => requestedId === id ? proposal : ++newerReads === 1 ? newer : new Promise<never>(() => {}));
  const onApplied = vi.fn();
  const panel = render(<AiProposalPanel recordId={id} documentVersion={0} client={client} announcedProposal={{ proposalId: id, baseDocumentVersion: 0, status: "ready" }} onApplied={onApplied} />);
  await screen.findByText(proposal.summary); fireEvent.click(screen.getByRole("button", { name: /개 변경 적용/ }));
  panel.rerender(<AiProposalPanel recordId={id} documentVersion={1} client={client} announcedProposal={{ proposalId: newer.proposalId, baseDocumentVersion: 1, status: "ready", ...{ createdAt: newer.createdAt } }} onApplied={onApplied} />);
  await screen.findByText(newer.summary);
  await act(async () => { finishApply({ ...proposal, status: "applied", undoScope: "none", businessChangesRetained: true }); });
  expect(onApplied).toHaveBeenCalledOnce();
  expect(screen.getByText(newer.summary)).toBeTruthy();
  expect(screen.queryByText(/문서 복원 대상이 없습니다/)).toBeNull();
  expect(screen.getByRole("button", { name: /개 변경 적용/ })).toBeTruthy();
});
it("holds the newest announcement identity while its detail GET is still pending", async () => {
  const newerId = "00000000-0000-4000-8000-000000000002";
  let finishCreate!: (value: typeof proposal) => void;
  let finishGet!: (value: typeof proposal) => void;
  const client = api(undefined);
  client.create = vi.fn(() => new Promise<typeof proposal>(resolve => { finishCreate = resolve; }));
  client.get = vi.fn(() => new Promise<typeof proposal>(resolve => { finishGet = resolve; }));
  const panel = render(<AiProposalPanel recordId={id} documentVersion={0} selectedBlockIds={[id]} client={client} />);
  fireEvent.change(screen.getByLabelText("AI에게 편집 요청"), { target: { value: "edit" } }); fireEvent.click(screen.getByRole("button", { name: "제안 만들기" }));
  panel.rerender(<AiProposalPanel recordId={id} documentVersion={0} selectedBlockIds={[id]} client={client} announcedProposal={{ proposalId: newerId, createdAt: "2026-10-09T02:00:00Z", baseDocumentVersion: 0, status: "ready" }} />);
  await waitFor(() => expect(finishGet).toBeTypeOf("function"));
  await act(async () => { finishCreate(proposal); });
  expect(screen.queryByText(proposal.summary)).toBeNull();
  await act(async () => { finishGet({ ...proposal, proposalId: newerId, createdAt: "2026-10-09T02:00:00Z", summary: "Newest detail arrived" }); });
  expect(screen.getByText("Newest detail arrived")).toBeTruthy();
});
it.each(["unmount", "switch"] as const)("does not clear a queued request after its original Panel %s", async transition => {
  let finishCreate!: (value: typeof proposal) => void;
  const client = api(undefined);
  client.create = vi.fn(() => new Promise<typeof proposal>(resolve => { finishCreate = resolve; }));
  const handled = vi.fn();
  const view = render(<AiProposalPanel recordId={id} documentVersion={0} client={client} requestedPrompt={{ id: "request-A", recordId: id, prompt: "A", blockIds: [id] }} onRequestHandled={handled} />);
  await waitFor(() => expect(finishCreate).toBeTypeOf("function"));
  if (transition === "unmount") view.unmount();
  else view.rerender(<AiProposalPanel recordId="00000000-0000-4000-8000-000000000002" documentVersion={0} client={client} requestedPrompt={null} onRequestHandled={handled} />);
  await act(async () => { finishCreate(proposal); });
  expect(handled).not.toHaveBeenCalled();
});
it("keeps ready B visible after the delayed Reject response for A", async () => {
  const newer = { ...proposal, proposalId: "00000000-0000-4000-8000-000000000002", summary: "Reject latest proposal B", createdAt: "2026-10-09T02:00:00Z" };
  let finishReject!: () => void;
  const client = api(undefined);
  client.reject = vi.fn(() => new Promise<void>(resolve => { finishReject = resolve; }));
  client.get = vi.fn(async (_recordId, requestedId) => requestedId === id ? proposal : newer);
  const panel = render(<AiProposalPanel recordId={id} documentVersion={0} client={client} announcedProposal={{ proposalId: id, baseDocumentVersion: 0, status: "ready" }} />);
  await screen.findByText(proposal.summary);
  fireEvent.click(screen.getByRole("button", { name: "거절" }));
  expect(client.reject).toHaveBeenCalledWith(id, id);
  panel.rerender(<AiProposalPanel recordId={id} documentVersion={0} client={client} announcedProposal={{ proposalId: newer.proposalId, createdAt: newer.createdAt, baseDocumentVersion: 0, status: "ready" }} />);
  await screen.findByText(newer.summary);
  expect(client.get).toHaveBeenLastCalledWith(id, newer.proposalId);
  await act(async () => { finishReject(); });
  expect(screen.getByText(newer.summary)).toBeTruthy();
  expect(screen.queryByText("제안을 거절했습니다.")).toBeNull();
  expect((screen.getByRole("button", { name: /개 변경 적용/ }) as HTMLButtonElement).disabled).toBe(false);
  expect(client.reject).toHaveBeenCalledOnce();
});

it.each(["document", "no-document-target"] as const)("keeps B status and Undo metadata after delayed A Undo (%s), while refreshing actual document completion", async outcome => {
  const older = { ...proposal, status: "applied" as const, undoScope: "document" as const, appliedDocumentVersion: 3, businessChangesRetained: true };
  const newer = { ...proposal, proposalId: "00000000-0000-4000-8000-000000000002", summary: "Undo latest proposal B", createdAt: "2026-10-09T02:00:00Z" };
  let finishUndo!: (result: Awaited<ReturnType<AiProposalClient["undo"]>>) => void;
  const client = api(undefined);
  client.undo = vi.fn(() => new Promise<Awaited<ReturnType<AiProposalClient["undo"]>>>(resolve => { finishUndo = resolve; }));
  client.get = vi.fn(async (_recordId, requestedId) => requestedId === id ? older : newer);
  client.apply = vi.fn(async () => ({ ...newer, status: "applied" as const, undoScope: "document" as const, appliedDocumentVersion: 4 }));
  const onApplied = vi.fn();
  const panel = render(<AiProposalPanel recordId={id} documentVersion={3} client={client} announcedProposal={{ proposalId: id, baseDocumentVersion: 0, status: "applied" }} onApplied={onApplied} />);
  await screen.findByText(older.summary);
  fireEvent.click(screen.getByRole("button", { name: "본문 변경 되돌리기" }));
  fireEvent.click(screen.getByRole("button", { name: "본문 되돌리기 확인" }));
  expect(client.undo).toHaveBeenCalledWith(id, id, 3);
  panel.rerender(<AiProposalPanel recordId={id} documentVersion={4} client={client} announcedProposal={{ proposalId: newer.proposalId, createdAt: newer.createdAt, baseDocumentVersion: 0, status: "ready" }} onApplied={onApplied} />);
  await screen.findByText(newer.summary);
  expect(client.get).toHaveBeenLastCalledWith(id, newer.proposalId);
  await act(async () => { finishUndo(outcome === "document" ? undefined : { outcome: "no-document-target", scope: "none", businessChangesRetained: true }); });
  expect(onApplied).toHaveBeenCalledTimes(outcome === "document" ? 1 : 0);
  expect(screen.getByText(newer.summary)).toBeTruthy();
  expect(screen.queryByText(/문서 복원 대상이 없습니다|본문을 되돌렸습니다/)).toBeNull();
  const apply = screen.getByRole("button", { name: /개 변경 적용/ }) as HTMLButtonElement;
  expect(apply.disabled).toBe(false);
  fireEvent.click(apply);
  expect(await screen.findByRole("button", { name: "본문 변경 되돌리기" })).toBeTruthy();
  expect(client.apply).toHaveBeenCalledWith(id, newer.proposalId, expect.anything());
  expect(client.undo).toHaveBeenCalledOnce();
  expect(screen.queryByText(/본문을 되돌렸습니다/)).toBeNull();
});