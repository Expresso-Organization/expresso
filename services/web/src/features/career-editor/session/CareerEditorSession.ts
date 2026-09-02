import {
  CareerDocumentBootstrapSchema,
  CareerSocketClientMessageSchema,
  CareerSocketServerMessageSchema,
  type CareerSocketServerMessage,
} from "@expresso/contracts";
import {
  createEmptyCareerDocument,
  type CareerDocument,
} from "@expresso/editor/document";
import {
  encodeDocumentAsYUpdate,
  encodeDocumentStateVector,
  reconstructYDocument,
} from "@expresso/editor/yjs";

const EMPTY_STATE_VECTOR = "";
type SessionStatus = "loading" | "saving" | "saved" | "offline" | "conflict";
export interface CareerEditorSnapshot {
  status: SessionStatus;
  documentVersion: number;
  lastAckSequence: number;
  proposal: { proposalId: string; baseDocumentVersion: number; status: "draft" | "streaming" | "ready" | "applied" | "rejected" | "cancelled" | "expired" | "conflicted"; progress: { phase: "preparing" | "generating" | "validating"; completed: number; total?: number | undefined } | null } | null;
}
export interface CareerEditorSessionOptions {
  fetch?: typeof globalThis.fetch;
  WebSocket?: typeof globalThis.WebSocket;
  reconnectDelay?: (attempt: number) => number;
}
type Listener = () => void;
type Pending = { clientSequence: number; updateBase64: string };

function encode(bytes: Uint8Array): string {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value);
}
function decode(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
function clientFrame(value: unknown): string {
  return JSON.stringify(CareerSocketClientMessageSchema.parse(value));
}
function uuid(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

export class CareerEditorSession {
  readonly recordId: string;
  readonly clientId = uuid();
  private readonly fetcher: typeof globalThis.fetch;
  private readonly Socket: typeof globalThis.WebSocket;
  private readonly delay: (attempt: number) => number;
  private listeners = new Set<Listener>();
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private reconnectAttempt = 0;
  private sessionId = uuid();
  private sessionToken = "";
  private updates: Uint8Array[] = [];
  private pending = new Map<number, Pending>();
  private acknowledgedServerSequences = new Set<number>();
  private nextSequence = 1;
  private snapshot: CareerEditorSnapshot = { status: "loading", documentVersion: 0, lastAckSequence: 0, proposal: null };
  private document: CareerDocument | null = null;

  constructor(recordId: string, options: CareerEditorSessionOptions = {}) {
    this.recordId = recordId;
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.Socket = options.WebSocket ?? globalThis.WebSocket;
    this.delay = options.reconnectDelay ?? ((attempt) => Math.min(250 * 2 ** attempt, 10_000));
    void this.bootstrap();
  }

  subscribe = (listener: Listener) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  getSnapshot = () => this.snapshot;
  getDocument = () => this.document;
  hasPendingUpdates = () => this.pending.size > 0;
  updateDocument = (next: CareerDocument) => {
    if (this.disposed) return;
    const parsed = CareerDocumentBootstrapSchema.shape.document.parse(next);
    const clientSequence = this.nextSequence++;
    const update = encodeDocumentAsYUpdate(parsed, this.updates, `${this.clientId}:${clientSequence}`);
    const updateBase64 = encode(update);
    this.updates.push(update);
    this.document = reconstructYDocument(this.updates);
    this.pending.set(clientSequence, { clientSequence, updateBase64 });
    this.setSnapshot({ status: "saving" });
    this.sendPending();
  };
  dispose() {
    this.disposed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.close();
    this.socket = null;
    this.listeners.clear();
  }

  private emit() { for (const listener of this.listeners) listener(); }
  private setSnapshot(patch: Partial<CareerEditorSnapshot>) { this.snapshot = { ...this.snapshot, ...patch }; this.emit(); }
  private async bootstrap() {
    try {
      const response = await this.fetcher(`/api/career/records/${encodeURIComponent(this.recordId)}/document`, { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error(`bootstrap failed: ${response.status}`);
      const bootstrap = CareerDocumentBootstrapSchema.parse(await response.json());
      this.sessionToken = bootstrap.sessionToken;
      this.document = bootstrap.document;
      this.updates = [encodeDocumentAsYUpdate(bootstrap.document)];
      this.snapshot = { ...this.snapshot, status: "offline", documentVersion: bootstrap.documentVersion };
      this.emit();
      this.connect();
    } catch {
      this.document ??= createEmptyCareerDocument();
      this.setSnapshot({ status: "offline" });
      this.scheduleReconnect();
    }
  }
  private connect() {
    if (this.disposed || !this.sessionToken) return;
    const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? globalThis.location?.origin ?? "http://127.0.0.1:4000";
    const url = new URL(`${base.replace(/^http/, "ws")}/v1/career/records/${encodeURIComponent(this.recordId)}/session`);
    const socket = new this.Socket(url.href);
    this.socket = socket;
    socket.onopen = () => {
      this.reconnectAttempt = 0;
      const stateVectorBase64 = this.document ? encode(encodeDocumentStateVector(this.document)) : EMPTY_STATE_VECTOR;
      const sync = clientFrame({ protocolVersion: 1, recordId: this.recordId, sessionId: this.sessionId, type: "sync", stateVectorBase64, lastAckSequence: this.snapshot.lastAckSequence });
      // 짧은 수명 세션 토큰은 첫 sync에만 붙이고, 쿠키나 저장소에는 남기지 않습니다.
      socket.send(sync.replace("}", `,"sessionToken":${JSON.stringify(this.sessionToken)}}`));
      this.sendPending();
    };
    socket.onmessage = (event) => this.receive(event.data);
    socket.onerror = () => socket.close();
    socket.onclose = () => { if (this.socket === socket) this.socket = null; if (!this.disposed) { this.setSnapshot({ status: "offline" }); this.scheduleReconnect(); } };
  }
  private receive(raw: unknown) {
    try {
      const message: CareerSocketServerMessage = CareerSocketServerMessageSchema.parse(typeof raw === "string" ? JSON.parse(raw) : raw);
      if (message.recordId !== this.recordId || message.sessionId !== this.sessionId) return;
      if (message.type === "ready") { this.snapshot = { ...this.snapshot, status: this.pending.size ? "saving" : "saved", documentVersion: message.documentVersion, lastAckSequence: Math.max(this.snapshot.lastAckSequence, message.sequence) }; this.emit(); return; }
      if (message.type === "update") { this.updates.push(decode(message.updateBase64)); this.document = reconstructYDocument(this.updates); this.setSnapshot({ documentVersion: Math.max(this.snapshot.documentVersion, message.sequence), lastAckSequence: Math.max(this.snapshot.lastAckSequence, message.sequence) }); return; }
      if (message.type === "ack") {
        // 서버 sequence가 같은 ack는 재연결 중 중복 도착할 수 있으므로 한 번만 pending을 줄입니다.
        if (!this.acknowledgedServerSequences.has(message.sequence)) {
          this.acknowledgedServerSequences.add(message.sequence);
          const first = this.pending.keys().next().value as number | undefined;
          if (first !== undefined) this.pending.delete(first);
        }
        this.snapshot = { ...this.snapshot, status: this.pending.size ? "saving" : "saved", documentVersion: message.documentVersion, lastAckSequence: Math.max(this.snapshot.lastAckSequence, message.sequence) };
        this.emit(); return;
      }
      if (message.type === "proposal") { this.setSnapshot({ proposal: { proposalId: message.proposalId, baseDocumentVersion: message.baseDocumentVersion, status: message.status, progress: message.progress } }); return; }
      if (message.type === "error") this.setSnapshot({ status: message.code === "VERSION_CONFLICT" ? "conflict" : "offline" });
    } catch { this.setSnapshot({ status: "conflict" }); }
  }
  private sendPending() {
    if (!this.socket || this.socket.readyState !== 1) return;
    for (const pending of this.pending.values()) this.socket.send(clientFrame({ protocolVersion: 1, recordId: this.recordId, sessionId: this.sessionId, type: "update", clientId: this.clientId, clientSequence: pending.clientSequence, updateBase64: pending.updateBase64 }));
  }
  private scheduleReconnect() {
    if (this.disposed || this.reconnectTimer) return;
    // 재연결 간격은 10초를 넘기지 않아 오프라인에서도 다시 시도합니다.
    const attempt = this.reconnectAttempt++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.sessionToken) this.connect();
      else void this.bootstrap();
    }, this.delay(attempt));
  }
}
