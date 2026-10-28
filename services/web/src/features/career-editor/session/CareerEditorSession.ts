import {
  CareerDocumentBootstrapSchema,
  CareerSocketClientMessageSchema,
  CareerSocketServerMessageSchema,
  type CareerSocketServerMessage,
} from "@expresso/contracts";
import type { CareerDocument } from "@expresso/editor/document";
import * as Y from "yjs";

const EMPTY_STATE_VECTOR = "";
// unavailable은 문서 bootstrap이 404이거나 BlockNote 문서가 아닌 상태입니다.
type SessionStatus = "loading" | "saving" | "saved" | "offline" | "conflict" | "unavailable";
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
/** 서버에서 받은 Yjs 업데이트의 출처 표시입니다. 이 출처의 변경은 다시 보내지 않습니다. */
const REMOTE_ORIGIN = Symbol("career-remote");
const BLOCKNOTE_BATCH_MS = 300;

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
  private pending = new Map<number, Pending>();
  private acknowledgedServerSequences = new Set<number>();
  private nextSequence = 1;
  private snapshot: CareerEditorSnapshot = { status: "loading", documentVersion: 0, lastAckSequence: 0, proposal: null };
  private document: CareerDocument | null = null;
  private yDocument: Y.Doc | null = null;
  private localYUpdates: Uint8Array[] = [];
  private batchTimer: ReturnType<typeof setTimeout> | null = null;

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
  hasPendingUpdates = () => this.pending.size > 0 || this.localYUpdates.length > 0;
  /** 서버 상태로 시작한 Y.Doc입니다. bootstrap 전에는 null입니다. */
  getYDocument = () => this.yDocument;
  /** 편집기가 본문을 바꿀 때 v1 모양 사본을 알립니다. 같은 기록을 보는 AI 비교 화면이 이 값을 읽습니다. */
  publishDocument = (next: CareerDocument) => {
    if (this.disposed) return;
    this.document = next;
    this.emit();
  };
  dispose() {
    this.disposed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.batchTimer) clearTimeout(this.batchTimer);
    this.yDocument?.destroy();
    this.socket?.close();
    this.socket = null;
    this.listeners.clear();
  }

  private emit() { for (const listener of this.listeners) listener(); }
  private setSnapshot(patch: Partial<CareerEditorSnapshot>) { this.snapshot = { ...this.snapshot, ...patch }; this.emit(); }
  private async bootstrap() {
    try {
      const response = await this.fetcher(`/api/career/records/${encodeURIComponent(this.recordId)}/document`, { credentials: "same-origin", cache: "no-store" });
      // 404는 다시 불러도 같으므로 재연결하지 않고 멈춥니다. 네트워크 오류와 5xx만 catch에서 재시도합니다.
      if (response.status === 404) { this.setSnapshot({ status: "unavailable" }); return; }
      if (!response.ok) throw new Error(`bootstrap failed: ${response.status}`);
      const bootstrap = CareerDocumentBootstrapSchema.parse(await response.json());
      // 서버는 모든 기록을 BlockNote로 엽니다. 그렇지 않은 응답은 이 클라이언트가 편집할 수 없습니다.
      if (bootstrap.editor !== "blocknote" || !bootstrap.stateBase64) { this.setSnapshot({ status: "unavailable" }); return; }
      this.sessionToken = bootstrap.sessionToken;
      this.document = bootstrap.document;
      this.startBlockNote(decode(bootstrap.stateBase64));
      // 받은 상태에 documentVersion까지의 업데이트가 이미 들어 있으므로 그 뒤만 요청합니다.
      this.snapshot = { ...this.snapshot, status: "offline", documentVersion: bootstrap.documentVersion, lastAckSequence: bootstrap.documentVersion };
      this.emit();
      this.connect();
    } catch {
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
      const stateVectorBase64 = this.yDocument ? encode(Y.encodeStateVector(this.yDocument)) : EMPTY_STATE_VECTOR;
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
      if (message.type === "update" && this.yDocument) {
        Y.applyUpdate(this.yDocument, decode(message.updateBase64), REMOTE_ORIGIN);
        this.setSnapshot({ documentVersion: Math.max(this.snapshot.documentVersion, message.sequence), lastAckSequence: Math.max(this.snapshot.lastAckSequence, message.sequence) });
        return;
      }
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
  private startBlockNote(state: Uint8Array) {
    const yDocument = new Y.Doc();
    Y.applyUpdate(yDocument, state, REMOTE_ORIGIN);
    yDocument.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin === REMOTE_ORIGIN || this.disposed || this.snapshot.status === "unavailable") return;
      this.localYUpdates.push(update);
      this.setSnapshot({ status: "saving" });
      // 키 입력마다 프레임을 만들지 않고 300ms 동안 모인 업데이트를 하나로 합쳐 보냅니다.
      this.batchTimer ??= setTimeout(() => this.flushBlockNote(), BLOCKNOTE_BATCH_MS);
    });
    this.yDocument = yDocument;
  }
  private flushBlockNote() {
    this.batchTimer = null;
    if (!this.localYUpdates.length) return;
    const merged = Y.mergeUpdates(this.localYUpdates);
    this.localYUpdates = [];
    const clientSequence = this.nextSequence++;
    this.pending.set(clientSequence, { clientSequence, updateBase64: encode(merged) });
    this.sendPending();
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
