// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WriteOperationStatus } from "./WriteOperationStatus";
import { durableWriteKey, saveOperation, savedOperation } from "./write-operation-client";
const id = "00000000-0000-4000-8000-000000000001";
const operation = { operationId: id, producer: "ai-proposal" as const, state: "pending" as const, recordId: id, owners: { business: "pending" as const, document: "not-required" as const }, statusUrl: "/v1/career/write-operations/" + id, retryable: true, updatedAt: "2026-10-09T00:00:00Z" };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); sessionStorage.clear(); });
it.each(["recovery-required", "cancelled"] as const)("shows %s explicitly without pretending completion or calling an owner", async state => {
  const completed = vi.fn();
  const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => Response.json({ data: { ...operation, state, retryable: false } }));
  vi.stubGlobal("fetch", fetcher);
  render(<WriteOperationStatus operationId={id} scope="own-record" producer="ai-proposal" recordId={id} onCompleted={completed} />);
  expect((await screen.findByRole("alert")).textContent).toContain(state === "cancelled" ? "취소" : "복구 확인");
  expect(completed).not.toHaveBeenCalled();
  expect(fetcher).toHaveBeenCalledOnce();
  expect(fetcher.mock.calls[0]?.[1]?.method).toBeUndefined();
});
it.each([401, 404])("clears persisted adoption after owner-scoped status returns %s", async status => {
  saveOperation("own-record", id);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status })));
  render(<WriteOperationStatus operationId={id} scope="own-record" producer="ai-proposal" onCompleted={vi.fn()} />);
  await screen.findByRole("alert");
  expect(savedOperation("own-record")).toBeNull();
});
it("persists only hashes and keys, reusing exact retries and replacing changed drafts", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const first = await durableWriteKey("own-record", { transcript: "private answer" });
  expect(await durableWriteKey("own-record", { transcript: "private answer" })).toBe(first);
  expect(await durableWriteKey("own-record", { transcript: "changed answer" })).not.toBe(first);
  expect(Object.keys(sessionStorage).join(" ")).not.toContain("answer");
  expect(Object.values(sessionStorage).join(" ")).not.toContain("answer");
});
it("handles a later operation independently when the same status component is reused", async () => {
  const second = "00000000-0000-4000-8000-000000000002";
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const operationId = url.endsWith(second) ? second : id;
    return Response.json({ data: { ...operation, operationId, statusUrl: "/v1/career/write-operations/" + operationId, state: "completed", owners: { business: "completed", document: "not-required" }, retryable: false } });
  }));
  const completed = vi.fn();
  const view = render(<WriteOperationStatus operationId={id} scope="own-record" producer="ai-proposal" recordId={id} onCompleted={completed} />);
  await waitFor(() => expect(completed).toHaveBeenCalledOnce());
  view.rerender(<WriteOperationStatus operationId={second} scope="own-record" producer="ai-proposal" recordId={id} onCompleted={completed} />);
  await waitFor(() => expect(completed).toHaveBeenCalledTimes(2));
});

it("bounds pending polling and leaves a status-only retry without rerunning an owner", async () => {
  vi.useFakeTimers();
  const completed = vi.fn();
  const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => Response.json({ data: operation }));
  vi.stubGlobal("fetch", fetcher);
  render(<WriteOperationStatus operationId={id} scope="own-record" producer="ai-proposal" recordId={id} onCompleted={completed} />);
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(fetcher).toHaveBeenCalledTimes(30);
  expect(screen.getByRole("button", { name: "상태 다시 확인" })).toBeTruthy();
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(fetcher).toHaveBeenCalledTimes(30);
  expect(completed).not.toHaveBeenCalled();
  expect(fetcher.mock.calls.every(call => call[0].startsWith("/api/career/write-operations/") && call[1]?.method === undefined)).toBe(true);
});
it("does not show a previous operation's completed state while a reused component awaits a new operation",async()=>{
 const second="00000000-0000-4000-8000-000000000002";
 let resolve!:(value:Response)=>void;
 vi.stubGlobal("fetch",vi.fn(async(url:string)=>url.endsWith(second)?new Promise<Response>(done=>{resolve=done;}):Response.json({data:{...operation,state:"completed",retryable:false,owners:{business:"completed",document:"not-required"}}})));
 const completed=vi.fn();const rendered=render(<WriteOperationStatus operationId={id} scope="own-record" producer="ai-proposal" onCompleted={completed}/>);
 await waitFor(()=>expect(completed).toHaveBeenCalledOnce());
 rendered.rerender(<WriteOperationStatus operationId={second} scope="own-record" producer="ai-proposal" onCompleted={completed}/>);
 expect(screen.queryByText("변경 적용이 완료되었습니다.")).toBeNull();
 expect(screen.getByText("변경 적용 중입니다.")).toBeTruthy();
 resolve(Response.json({data:{...operation,operationId:second,statusUrl:"/v1/career/write-operations/"+second,state:"cancelled",retryable:false}}));
 expect((await screen.findByRole("alert")).textContent).toContain("취소");
});

it("rejects a completed operation that omits the requested existing record binding",async()=>{
 const completed=vi.fn();
 vi.stubGlobal("fetch",vi.fn(async()=>Response.json({data:{...operation,state:"completed",recordId:null,retryable:false,owners:{business:"completed",document:"not-required"}}})));
 render(<WriteOperationStatus operationId={id} scope="own-record" producer="ai-proposal" recordId={id} onCompleted={completed}/>);
 expect(await screen.findByRole("alert")).toBeTruthy();
 expect(screen.queryByText("변경 적용이 완료되었습니다.")).toBeNull();
 expect(completed).not.toHaveBeenCalled();
});
