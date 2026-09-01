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
  onclose: (() => void) | null = null;
  sent: string[] = [];
  constructor(_url: string) { FakeSocket.instances.push(this); }
  send(value: string) { this.sent.push(value); }
  close() { this.readyState = 3; this.onclose?.(); }
  open() { this.readyState = 1; this.onopen?.(); }
  receive(value: unknown) { this.onmessage?.({ data: JSON.stringify(value) }); }
}

afterEach(() => { FakeSocket.instances = []; vi.restoreAllMocks(); vi.useRealTimers(); });
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

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
    expect(first.sent.filter((frame) => JSON.parse(frame).type === "update")).toHaveLength(1);
    first.close();
    await flush();
    const second = FakeSocket.instances[1]!;
    second.open();
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
