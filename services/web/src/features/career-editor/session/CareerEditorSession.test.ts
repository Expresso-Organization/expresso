import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmptyCareerDocument } from "@expresso/editor";
import * as Y from "yjs";
import { CareerEditorSession } from "./CareerEditorSession";

const recordId = "11111111-1111-4111-8111-111111111111";
const serverId = "33333333-3333-4333-8333-333333333333";
const token = "t".repeat(40);

function baseState(text = "시작"): Uint8Array {
  const document = new Y.Doc();
  document.getXmlFragment("document-store").insert(0, [new Y.XmlText(text)]);
  return Y.encodeStateAsUpdate(document);
}
function bootstrapBody(documentVersion = 0, state = baseState()) {
  return {
    record: { id: recordId, categoryId: serverId, title: "기록", status: "draft", origin: "manual", properties: {}, bodyMd: "", version: 1, updatedAt: "2026-09-01T00:00:00.000Z" },
    document: createEmptyCareerDocument(), snapshotVersion: 0, documentVersion, stateVectorBase64: "", pendingUpdateCount: 0, sessionToken: token,
    editor: "blocknote", stateBase64: Buffer.from(state).toString("base64"),
  };
}

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
  close(code?: number) { this.readyState = 3; this.onclose?.(code === undefined ? undefined : { code }); }
  open() { this.readyState = 1; this.onopen?.(); }
  receive(value: unknown) { this.onmessage?.({ data: JSON.stringify(value) }); }
}

afterEach(() => { FakeSocket.instances = []; vi.restoreAllMocks(); vi.useRealTimers(); });
const updatesSent = (socket: FakeSocket) => socket.sent.filter((frame) => JSON.parse(frame).type === "update");
const text = (session: CareerEditorSession) => (session.getYDocument()!.getXmlFragment("document-store").get(0) as Y.XmlText);

describe("CareerEditorSession", () => {
  it("starts from the server state and removes one pending batch per ack", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async () => new Response(JSON.stringify(bootstrapBody(4)), { status: 200 }));
    const session = new CareerEditorSession(recordId, { fetch: fetcher as typeof fetch, WebSocket: FakeSocket as unknown as typeof WebSocket });
    await vi.waitFor(() => expect(FakeSocket.instances).toHaveLength(1));
    const socket = FakeSocket.instances[0]!;
    socket.open();
    const sync = JSON.parse(socket.sent[0]!);
    expect(sync).toMatchObject({ type: "sync", lastAckSequence: 4 });
    expect(text(session).toString()).toBe("시작");
    text(session).insert(2, "!");
    expect(session.getSnapshot().status).toBe("saving");
    vi.advanceTimersByTime(300);
    expect(updatesSent(socket)).toHaveLength(1);
    socket.receive({ protocolVersion: 1, recordId, sessionId: sync.sessionId, type: "ack", sequence: 5, documentVersion: 5 });
    expect(session.getSnapshot()).toMatchObject({ status: "saved", documentVersion: 5 });
    socket.receive({ protocolVersion: 1, recordId, sessionId: sync.sessionId, type: "ack", sequence: 5, documentVersion: 5 });
    expect(session.hasPendingUpdates()).toBe(false);
    session.dispose();
  });

  it("resends unacknowledged batches after reconnect", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async () => new Response(JSON.stringify(bootstrapBody()), { status: 200 }));
    const session = new CareerEditorSession(recordId, { fetch: fetcher as typeof fetch, WebSocket: FakeSocket as unknown as typeof WebSocket, reconnectDelay: () => 0 });
    await vi.waitFor(() => expect(FakeSocket.instances).toHaveLength(1));
    const first = FakeSocket.instances[0]!;
    first.open();
    text(session).insert(0, "끊기기 전 ");
    vi.advanceTimersByTime(300);
    expect(updatesSent(first)).toHaveLength(1);
    first.close();
    expect(session.getSnapshot().status).toBe("offline");
    vi.advanceTimersByTime(0);
    const second = FakeSocket.instances[1]!;
    second.open();
    expect(updatesSent(second)).toHaveLength(1);
    session.dispose();
  });

  it("stops after a 404 bootstrap and for a non-BlockNote document", async () => {
    for (const respond of [async () => new Response(null, { status: 404 }), async () => new Response(JSON.stringify({ ...bootstrapBody(), editor: undefined, stateBase64: undefined }), { status: 200 })]) {
      const fetcher = vi.fn(respond);
      const session = new CareerEditorSession(recordId, { fetch: fetcher as typeof fetch, WebSocket: FakeSocket as unknown as typeof WebSocket, reconnectDelay: () => 0 });
      await vi.waitFor(() => expect(session.getSnapshot().status).toBe("unavailable"));
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(session.getYDocument()).toBeNull();
      expect(FakeSocket.instances).toHaveLength(0);
      session.dispose();
    }
  });

  it.each([
    ["a network error", async () => { throw new TypeError("fetch failed"); }],
    ["a 503 response", async () => new Response(null, { status: 503 })],
  ])("keeps retrying the bootstrap after %s", async (_label, respond) => {
    const fetcher = vi.fn(respond);
    const session = new CareerEditorSession(recordId, { fetch: fetcher as typeof fetch, WebSocket: FakeSocket as unknown as typeof WebSocket, reconnectDelay: () => 0 });
    await vi.waitFor(() => expect(fetcher.mock.calls.length).toBeGreaterThan(1));
    expect(session.getSnapshot().status).toBe("offline");
    session.dispose();
  });

  it("applies remote updates without echoing them and exposes proposal and conflict state", async () => {
    vi.useFakeTimers();
    const state = baseState();
    const fetcher = vi.fn(async () => new Response(JSON.stringify(bootstrapBody(0, state)), { status: 200 }));
    const session = new CareerEditorSession(recordId, { fetch: fetcher as typeof fetch, WebSocket: FakeSocket as unknown as typeof WebSocket });
    await vi.waitFor(() => expect(FakeSocket.instances).toHaveLength(1));
    const socket = FakeSocket.instances[0]!;
    socket.open();
    const sync = JSON.parse(socket.sent[0]!);
    const remote = new Y.Doc(); Y.applyUpdate(remote, state);
    const before = Y.encodeStateVector(remote);
    (remote.getXmlFragment("document-store").get(0) as Y.XmlText).insert(0, "[원격]");
    socket.receive({ protocolVersion: 1, recordId, sessionId: sync.sessionId, type: "update", sequence: 1, updateBase64: Buffer.from(Y.encodeStateAsUpdate(remote, before)).toString("base64"), actor: "ai" });
    vi.advanceTimersByTime(300);
    expect(text(session).toString()).toBe("[원격]시작");
    expect(updatesSent(socket)).toHaveLength(0);
    expect(session.getSnapshot().lastAckSequence).toBe(1);
    socket.receive({ protocolVersion: 1, recordId, sessionId: sync.sessionId, type: "proposal", proposalId: serverId, baseDocumentVersion: 1, status: "streaming", progress: { phase: "generating", completed: 1, total: 3 } });
    expect(session.getSnapshot().proposal).toEqual({ proposalId: serverId, baseDocumentVersion: 1, status: "streaming", progress: { phase: "generating", completed: 1, total: 3 } });
    socket.receive({ protocolVersion: 1, recordId, sessionId: sync.sessionId, type: "error", code: "VERSION_CONFLICT", message: "stale" });
    expect(session.getSnapshot().status).toBe("conflict");
    session.dispose();
  });

  it("publishes the editor's document copy to listeners", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(bootstrapBody()), { status: 200 }));
    const session = new CareerEditorSession(recordId, { fetch: fetcher as typeof fetch, WebSocket: FakeSocket as unknown as typeof WebSocket });
    await vi.waitFor(() => expect(session.getYDocument()).not.toBeNull());
    const listener = vi.fn();
    session.subscribe(listener);
    const next = createEmptyCareerDocument();
    session.publishDocument(next);
    expect(session.getDocument()).toBe(next);
    expect(listener).toHaveBeenCalled();
    session.dispose();
  });
  it("re-bootstraps after the session token expires, keeps the editor document and resends pending updates", async () => {
    vi.useFakeTimers();
    // 서버는 같은 문서 상태를 다시 돌려줍니다. 호출마다 새 Y.Doc을 만들면 다른 문서가 섞여 결과가 흔들립니다.
    const state = baseState();
    const fetcher = vi.fn(async () => new Response(JSON.stringify(bootstrapBody(0, state)), { status: 200 }));
    const session = new CareerEditorSession(recordId, { fetch: fetcher as typeof fetch, WebSocket: FakeSocket as unknown as typeof WebSocket, reconnectDelay: () => 0 });
    await vi.waitFor(() => expect(FakeSocket.instances).toHaveLength(1));
    const first = FakeSocket.instances[0]!;
    first.open();
    const yDocument = session.getYDocument();
    first.close(4401);
    text(session).insert(0, "만료 뒤 ");
    expect(session.getSnapshot().status).toBe("offline");
    vi.advanceTimersByTime(300);
    vi.advanceTimersByTime(0);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(FakeSocket.instances).toHaveLength(2));
    expect(session.getYDocument()).toBe(yDocument);
    expect(text(session).toString()).toBe("만료 뒤 시작");
    const second = FakeSocket.instances[1]!;
    second.open();
    expect(updatesSent(second)).toHaveLength(1);
    session.dispose();
  });

  it("stops reconnecting when the server rejects an update as too large", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async () => new Response(JSON.stringify(bootstrapBody()), { status: 200 }));
    const session = new CareerEditorSession(recordId, { fetch: fetcher as typeof fetch, WebSocket: FakeSocket as unknown as typeof WebSocket, reconnectDelay: () => 0 });
    await vi.waitFor(() => expect(FakeSocket.instances).toHaveLength(1));
    FakeSocket.instances[0]!.open();
    FakeSocket.instances[0]!.close(4409);
    vi.advanceTimersByTime(1_000);
    expect(session.getSnapshot().status).toBe("error");
    expect(FakeSocket.instances).toHaveLength(1);
    session.dispose();
  });

  it("does not reset the reconnect backoff until the server says ready", async () => {
    vi.useFakeTimers();
    const attempts: number[] = [];
    const fetcher = vi.fn(async () => new Response(JSON.stringify(bootstrapBody()), { status: 200 }));
    const session = new CareerEditorSession(recordId, { fetch: fetcher as typeof fetch, WebSocket: FakeSocket as unknown as typeof WebSocket, reconnectDelay: (attempt) => { attempts.push(attempt); return 0; } });
    await vi.waitFor(() => expect(FakeSocket.instances).toHaveLength(1));
    for (let index = 0; index < 3; index += 1) {
      const socket = FakeSocket.instances[index]!;
      socket.open();
      socket.close();
      vi.advanceTimersByTime(0);
    }
    expect(attempts).toEqual([0, 1, 2]);
    session.dispose();
  });

  it("shows offline instead of saving when the user types without a connection", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async () => new Response(JSON.stringify(bootstrapBody()), { status: 200 }));
    const session = new CareerEditorSession(recordId, { fetch: fetcher as typeof fetch, WebSocket: FakeSocket as unknown as typeof WebSocket, reconnectDelay: () => 60_000 });
    await vi.waitFor(() => expect(FakeSocket.instances).toHaveLength(1));
    text(session).insert(0, "오프라인 ");
    expect(session.getSnapshot().status).toBe("offline");
    session.dispose();
  });
});
