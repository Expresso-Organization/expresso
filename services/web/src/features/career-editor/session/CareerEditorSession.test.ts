import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmptyCareerDocument, encodeDocumentAsYUpdate } from "@expresso/editor";
import { CareerEditorSession } from "./CareerEditorSession";

const recordId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const serverId = "33333333-3333-4333-8333-333333333333";
const token = "t".repeat(40);
const document = createEmptyCareerDocument();
const bootstrap = {
  record: { id: recordId, categoryId: serverId, title: "기록", status: "draft", origin: "manual", properties: {}, bodyMd: "", version: 1, updatedAt: "2026-09-01T00:00:00.000Z" },
  document, snapshotVersion: 0, documentVersion: 0, stateVectorBase64: "", pendingUpdateCount: 0, sessionToken: token,
};

class FakeSocket {
  static instances: FakeSocket[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event?: { code: number }) => void) | null = null;
  sent: string[] = [];
  constructor(_url: string) { FakeSocket.instances.push(this); }
  send(value: string) { this.sent.push(value); }
  close(code = 1000) { this.readyState = 3; this.onclose?.({ code }); }
  open() { this.readyState = 1; this.onopen?.(); }
  receive(value: unknown) { this.onmessage?.({ data: JSON.stringify(value) }); }
}

afterEach(() => { FakeSocket.instances = []; vi.restoreAllMocks(); vi.useRealTimers(); });
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

it("keeps the newest version when an update arrives before an older ready", async () => {
  const session = new CareerEditorSession(recordId, { fetch: vi.fn(async () => Response.json(bootstrap)), WebSocket: FakeSocket as unknown as typeof WebSocket });
  try {
    await flush();
    const socket = FakeSocket.instances[0]!;
    socket.open();
    const sid = JSON.parse(socket.sent[0]!).sessionId;
    const next = createEmptyCareerDocument();
    next.content[0]!.text = [{ text: "latest remote" }];
    const update = encodeDocumentAsYUpdate(next, [encodeDocumentAsYUpdate(document)]);
    socket.receive({ protocolVersion: 1, recordId, sessionId: sid, type: "update", sequence: 2, updateBase64: Buffer.from(update).toString("base64"), actor: "user" });
    socket.receive({ protocolVersion: 1, recordId, sessionId: sid, type: "ready", sequence: 1, documentVersion: 1 });
    expect(session.getSnapshot()).toMatchObject({ documentVersion: 2, lastAckSequence: 2, status: "saved" });
    expect(session.getDocument()?.content[0]?.text?.[0]?.text).toBe("latest remote");
  } finally { session.dispose(); }
});

it("accepts a resent edit's old ACK without regressing the reconnect version", async () => {
  const session = new CareerEditorSession(recordId, { fetch: vi.fn(async () => Response.json(bootstrap)), WebSocket: FakeSocket as unknown as typeof WebSocket, reconnectDelay: () => 0 });
  try {
    await flush();
    const first = FakeSocket.instances[0]!;
    first.open();
    const sid = JSON.parse(first.sent[0]!).sessionId;
    first.receive({ protocolVersion: 1, recordId, sessionId: sid, type: "ready", sequence: 0, documentVersion: 0 });
    session.updateDocument(document);
    first.close();
    await flush();
    const second = FakeSocket.instances[1]!;
    second.open();
    second.receive({ protocolVersion: 1, recordId, sessionId: sid, type: "ready", sequence: 2, documentVersion: 2 });
    expect(second.sent.filter(frame => JSON.parse(frame).type === "update")).toHaveLength(1);
    expect(session.hasPendingUpdates()).toBe(true);
    second.receive({ protocolVersion: 1, recordId, sessionId: sid, type: "ack", sequence: 1, documentVersion: 1 });
    expect(session.hasPendingUpdates()).toBe(false);
    expect(session.getSnapshot()).toMatchObject({ documentVersion: 2, lastAckSequence: 2, status: "saved" });
    session.updateDocument(document);
    second.receive({ protocolVersion: 1, recordId, sessionId: sid, type: "ack", sequence: 1, documentVersion: 1 });
    expect(session.hasPendingUpdates()).toBe(true);
    expect(session.getSnapshot()).toMatchObject({ documentVersion: 2, status: "saving" });
  } finally { session.dispose(); }
});

describe("CareerEditorSession", () => {
  it("parses bootstrap, queues updates, and removes only one pending update per ack", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(bootstrap), { status: 200 }));
    const session = new CareerEditorSession(recordId, { fetch: fetcher as typeof fetch, WebSocket: FakeSocket as unknown as typeof WebSocket });
    await flush();
    const socket = FakeSocket.instances[0]!;
    socket.open();
    expect(JSON.parse(socket.sent[0]!).type).toBe("sync");
    const next = createEmptyCareerDocument();
    session.updateDocument(next);
    expect(session.getSnapshot().status).toBe("saving");
    socket.receive({ protocolVersion: 1, recordId, sessionId: JSON.parse(socket.sent[0]!).sessionId, type: "ready", sequence: 0, documentVersion: 0 });
    socket.receive({ protocolVersion: 1, recordId, sessionId: JSON.parse(socket.sent[0]!).sessionId, type: "ack", sequence: 1, documentVersion: 1 });
    expect(session.getSnapshot().status).toBe("saved");
    socket.receive({ protocolVersion: 1, recordId, sessionId: JSON.parse(socket.sent[0]!).sessionId, type: "ack", sequence: 1, documentVersion: 1 });
    expect(session.getSnapshot().lastAckSequence).toBe(1);
    session.dispose();
  });

  it("resends unacknowledged updates after reconnect and caps the delay", async () => {
    const delays: number[] = [];
    const fetcher = vi.fn(async () => new Response(JSON.stringify(bootstrap), { status: 200 }));
    const session = new CareerEditorSession(recordId, {
      fetch: fetcher as typeof fetch,
      WebSocket: FakeSocket as unknown as typeof WebSocket,
      reconnectDelay: (attempt) => { const value = Math.min(250 * 2 ** attempt, 10_000); delays.push(value); return 0; },
    });
    await flush();
    const first = FakeSocket.instances[0]!;
    session.updateDocument(createEmptyCareerDocument());
    first.open();
    first.receive({ protocolVersion: 1, recordId, sessionId: JSON.parse(first.sent[0]!).sessionId, type: "ready", sequence: 0, documentVersion: 0 });
    expect(first.sent.filter((frame) => JSON.parse(frame).type === "update")).toHaveLength(1);
    first.close();
    await flush();
    const second = FakeSocket.instances[1]!;
    second.open();
    second.receive({ protocolVersion: 1, recordId, sessionId: JSON.parse(second.sent[0]!).sessionId, type: "ready", sequence: 0, documentVersion: 0 });
    expect(second.sent.filter((frame) => JSON.parse(frame).type === "update")).toHaveLength(1);
    expect(Math.max(...Array.from({ length: 12 }, (_, attempt) => Math.min(250 * 2 ** attempt, 10_000)))).toBe(10_000);
    expect(delays[0]).toBe(250);
    session.dispose();
  });

  it("applies remote updates and exposes conflict state", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(bootstrap), { status: 200 }));
    const session = new CareerEditorSession(recordId, { fetch: fetcher as typeof fetch, WebSocket: FakeSocket as unknown as typeof WebSocket });
    await flush();
    const socket = FakeSocket.instances[0]!;
    socket.open();
    const sync = JSON.parse(socket.sent[0]!);
    socket.receive({ protocolVersion: 1, recordId, sessionId: sync.sessionId, type: "ready", sequence: 0, documentVersion: 0 });
    const next = createEmptyCareerDocument();
    next.content[0]!.text = [{ text: "remote" }];
    const update = encodeDocumentAsYUpdate(next, [encodeDocumentAsYUpdate(document)]);
    socket.receive({ protocolVersion: 1, recordId, sessionId: sync.sessionId, type: "update", sequence: 1, updateBase64: Buffer.from(update).toString("base64"), actor: "user" });
    expect(session.getDocument()?.content[0]?.text?.[0]?.text).toBe("remote");
    expect(session.getSnapshot().lastAckSequence).toBe(1);
    socket.receive({ protocolVersion: 1, recordId, sessionId: sync.sessionId, type: "proposal", proposalId: serverId, baseDocumentVersion: 1, status: "streaming", progress: { phase: "generating", completed: 1, total: 3 } });
    expect(session.getSnapshot().proposal).toEqual({ proposalId: serverId, baseDocumentVersion: 1, status: "streaming", progress: { phase: "generating", completed: 1, total: 3 } });
    socket.receive({ protocolVersion: 1, recordId, sessionId: sync.sessionId, type: "error", code: "VERSION_CONFLICT", message: "stale" });
    expect(session.getSnapshot().status).toBe("conflict");
    session.dispose();
  });
});

it("never lets an older late proposal frame replace the newest replay or live proposal",async()=>{
 const session=new CareerEditorSession(recordId,{fetch:vi.fn(async()=>new Response(JSON.stringify(bootstrap),{status:200})),WebSocket:FakeSocket as unknown as typeof WebSocket});
 await flush();const socket=FakeSocket.instances[0]!;socket.open();const sid=JSON.parse(socket.sent[0]!).sessionId as string;
 const frame=(proposalId:string,createdAt:string,status="ready")=>({type:"proposal",protocolVersion:1,recordId,sessionId:sid,proposalId,createdAt,baseDocumentVersion:0,status,progress:null});
 socket.receive(frame("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","2026-10-01T00:00:00.000Z"));
 socket.receive(frame("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","2026-10-02T00:00:00.000Z"));
 socket.receive(frame("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","2026-10-01T00:00:00.000Z","applied"));
 expect(session.getSnapshot().proposal).toMatchObject({proposalId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",status:"ready"});
 socket.receive(frame("cccccccc-cccc-4ccc-8ccc-cccccccccccc","2026-10-02T00:00:00.000Z"));
 socket.receive(frame("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","2026-10-02T00:00:00.000Z","applied"));
 expect(session.getSnapshot().proposal).toMatchObject({proposalId:"cccccccc-cccc-4ccc-8ccc-cccccccccccc",status:"ready"});
 const legacy=frame("cccccccc-cccc-4ccc-8ccc-cccccccccccc","2026-10-02T00:00:00.000Z");const {createdAt:_createdAt,...withoutOrder}=legacy;socket.receive(withoutOrder);
 socket.receive(frame("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","2026-10-02T00:00:00.000Z","applied"));
 expect(session.getSnapshot().proposal).toMatchObject({proposalId:"cccccccc-cccc-4ccc-8ccc-cccccccccccc",createdAt:"2026-10-02T00:00:00.000Z",status:"ready"});
 session.dispose();
});

it("sends each pending edit once per authenticated connection", async () => {
  const session = new CareerEditorSession(recordId, { fetch: vi.fn(async () => new Response(JSON.stringify(bootstrap))), WebSocket: FakeSocket as unknown as typeof WebSocket });
  await flush(); const socket = FakeSocket.instances[0]!; socket.open();
  const sid = JSON.parse(socket.sent[0]!).sessionId;
  session.updateDocument(document);
  expect(socket.sent.filter(frame => JSON.parse(frame).type === "update")).toHaveLength(0);
  socket.receive({ protocolVersion: 1, recordId, sessionId: sid, type: "ready", sequence: 0, documentVersion: 0 });
  for (let i = 0; i < 7; i++) session.updateDocument(document);
  expect(socket.sent.filter(frame => JSON.parse(frame).type === "update")).toHaveLength(8);
  expect(session.getSnapshot().status).toBe("saving");
  session.dispose();
});

it("backs off transport-open connections that never finish authenticated sync", async () => {
  const attempts: number[] = [];
  const session = new CareerEditorSession(recordId, { fetch: vi.fn(async () => new Response(JSON.stringify(bootstrap))), WebSocket: FakeSocket as unknown as typeof WebSocket, reconnectDelay: attempt => { attempts.push(attempt); return 0; } });
  await flush(); FakeSocket.instances[0]!.open(); FakeSocket.instances[0]!.close(); await flush();
  FakeSocket.instances[1]!.open(); FakeSocket.instances[1]!.close(); await flush();
  expect(attempts).toEqual([0, 1]); session.dispose();
});

it("restores the causal state on HTTP reopen and on authenticated reconnect", async () => {
 const base=encodeDocumentAsYUpdate(document); const saved=createEmptyCareerDocument(); saved.content[0]!.text=[{text:"saved2"}];
 const state=encodeDocumentAsYUpdate(saved,[base],"original:1");
 const session=new CareerEditorSession(recordId,{fetch:vi.fn(async()=>Response.json({...bootstrap,document:saved,documentVersion:1,stateUpdateBase64:Buffer.from(state).toString("base64")})),WebSocket:FakeSocket as unknown as typeof WebSocket});
 await flush();const socket=FakeSocket.instances[0]!;socket.open();const sid=JSON.parse(socket.sent[0]!).sessionId;
 const remote=createEmptyCareerDocument();remote.content[0]!.text=[{text:"remote latest"}];const remoteState=encodeDocumentAsYUpdate(remote,[state],"remote:2");
 socket.receive({protocolVersion:1,recordId,sessionId:sid,type:"ready",sequence:2,documentVersion:2,stateUpdateBase64:Buffer.from(remoteState).toString("base64")});
 expect(session.getDocument()?.content[0]?.text?.[0]?.text).toBe("remote latest");
 const next=createEmptyCareerDocument();next.content[0]!.text=[{text:"next2"}];session.updateDocument(next);
 expect(session.getDocument()?.content[0]?.text?.[0]?.text).toBe("next2"); session.dispose();
});

it("renews an expired sync credential without dropping unacknowledged edits", async () => {
 const fetcher=vi.fn(async()=>Response.json(bootstrap));
 const session=new CareerEditorSession(recordId,{fetch:fetcher,WebSocket:FakeSocket as unknown as typeof WebSocket,reconnectDelay:()=>0});
 await flush();const first=FakeSocket.instances[0]!;first.open();session.updateDocument(document);first.close(4401);
 await flush();await flush();expect(fetcher).toHaveBeenCalledTimes(2);expect(session.hasPendingUpdates()).toBe(true);
 const second=FakeSocket.instances[1]!;second.open();second.receive({protocolVersion:1,recordId,sessionId:JSON.parse(second.sent[0]!).sessionId,type:"ready",sequence:0,documentVersion:0});
 expect(second.sent.filter(frame=>JSON.parse(frame).type==="update")).toHaveLength(1);session.dispose();
});
it("does not retry a rejected Origin or reopen after disposal during bootstrap", async () => {
 const fetcher=vi.fn(async()=>Response.json(bootstrap));const delay=vi.fn(()=>0);
 const session=new CareerEditorSession(recordId,{fetch:fetcher,WebSocket:FakeSocket as unknown as typeof WebSocket,reconnectDelay:delay});
 await flush();FakeSocket.instances[0]!.open();FakeSocket.instances[0]!.close(4403);await flush();expect(delay).not.toHaveBeenCalled();session.dispose();
 let resolve!: (value: Response)=>void;
 const pending=new CareerEditorSession(recordId,{fetch:vi.fn(()=>new Promise<Response>(done=>resolve=done)),WebSocket:FakeSocket as unknown as typeof WebSocket});
 pending.dispose();resolve(Response.json(bootstrap));await flush();expect(FakeSocket.instances).toHaveLength(1);
});
