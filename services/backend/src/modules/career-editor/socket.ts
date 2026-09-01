import { createHash } from "node:crypto";

import {
  CareerSocketClientMessageSchema,
  CareerSocketServerMessageSchema,
  UuidSchema,
  type CareerSocketServerMessage,
} from "@expresso/contracts";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { RawData, WebSocket } from "ws";

import type { IdentityApi } from "../identity/index.js";
import {
  InMemoryCareerDocumentSessionRegistry,
  type CareerDocumentSessionRegistry,
} from "./session-registry.js";
import type { CareerDocumentApi } from "./service.js";

const CLOSE = { auth: 4401, origin: 4403, protocol: 4400, size: 4409, conflict: 4410, rate: 4429 } as const;
const MAX_UPDATE = 1_048_576;
const MAX_FRAME = 1_398_400;
const EMPTY_SESSION_ID = "00000000-0000-0000-0000-000000000000";

export interface CareerSocketOptions {
  service: CareerDocumentApi;
  identityService: IdentityApi;
  signingSecret: string;
  allowedOrigin?: string;
  registry?: CareerDocumentSessionRegistry;
}

function cookieValue(header: string | undefined, name: string) {
  for (const part of header?.split(";") ?? []) {
    const separator = part.indexOf("=");
    if (separator >= 0 && part.slice(0, separator).trim() === name) {
      return part.slice(separator + 1).trim();
    }
  }
  return undefined;
}

function send(socket: WebSocket, message: CareerSocketServerMessage) {
  socket.send(JSON.stringify(CareerSocketServerMessageSchema.parse(message)));
}

export function registerCareerDocumentSocket(app: FastifyInstance, options: CareerSocketOptions) {
  const registry = options.registry ?? new InMemoryCareerDocumentSessionRegistry();
  options.service.setAiProposalPublisher((recordId, proposal) => registry.publish(recordId, {
    type: "proposal", protocolVersion: 1, recordId, sessionId: EMPTY_SESSION_ID,
    proposalId: proposal.proposalId, baseDocumentVersion: proposal.baseDocumentVersion,
    status: proposal.status, progress: proposal.progress,
  }));
  options.service.setAiUpdatePublisher((recordId, updateBase64, sequence) => registry.publish(recordId, {
    type: "update", protocolVersion: 1, recordId, sessionId: EMPTY_SESSION_ID,
    sequence, updateBase64, actor: "ai",
  }));
  app.get("/v1/career/records/:recordId/session", { websocket: true }, (socket, request) => {
    // 인증 조회 중 브라우저가 곧바로 보낸 첫 sync를 잃지 않게 먼저 큐를 연결합니다.
    const earlyMessages: RawData[] = [];
    const collectEarly = (raw: RawData) => { earlyMessages.push(raw); };
    socket.on("message", collectEarly);
    void handleSocket(socket, request, options, registry, earlyMessages, collectEarly);
  });
  return registry;
}

async function handleSocket(
  socket: WebSocket,
  request: FastifyRequest,
  options: CareerSocketOptions,
  registry: CareerDocumentSessionRegistry,
  earlyMessages: RawData[],
  collectEarly: (raw: RawData) => void,
) {
  const recordId = UuidSchema.parse((request.params as { recordId: string }).recordId);
  let sessionId: string | undefined;
  const closeEarly = (code: number, reason: string) => {
    socket.off("message", collectEarly);
    socket.close(code, reason);
  };
  if (request.headers.origin !== (options.allowedOrigin ?? "http://127.0.0.1:3000")) {
    closeEarly(CLOSE.origin, "origin rejected");
    return;
  }
  const accessToken = cookieValue(request.headers.cookie, "ex_session");
  const principal = accessToken ? await options.identityService.verifyAccessToken(accessToken) : null;
  if (!principal) {
    closeEarly(CLOSE.auth, "authentication required");
    return;
  }

  let joined: (() => void) | undefined;
  let alive = true;
  let updatesInSecond = 0;
  let secondStartedAt = Date.now();
  let minuteStartedAt = Date.now();
  let bytesInMinute = 0;
  const heartbeat = setInterval(() => {
    if (!alive) { socket.close(CLOSE.auth, "heartbeat timeout"); return; }
    alive = false;
    socket.ping();
  }, 15_000);
  socket.on("pong", () => { alive = true; });
  socket.on("close", () => { clearInterval(heartbeat); joined?.(); });

  const fail = (code: number, message: string) => {
    const errorCode = code === CLOSE.auth ? "AUTH"
      : code === CLOSE.origin ? "ORIGIN"
      : code === CLOSE.size ? "SIZE"
      : code === CLOSE.rate ? "RATE_LIMIT"
      : code === CLOSE.conflict ? "VERSION_CONFLICT"
      : "PROTOCOL";
    send(socket, {
      type: "error", protocolVersion: 1, recordId,
      sessionId: sessionId ?? EMPTY_SESSION_ID, code: errorCode, message,
    });
    socket.close(code, message);
  };

  const processMessage = async (raw: RawData) => {
    try {
      const frame = Buffer.isBuffer(raw) ? raw : Buffer.from(raw.toString());
      if (frame.length > MAX_FRAME) { fail(CLOSE.size, "message envelope is too large"); return; }
      if (Date.now() - minuteStartedAt >= 60_000) { bytesInMinute = 0; minuteStartedAt = Date.now(); }
      bytesInMinute += frame.length;
      if (bytesInMinute > 5 * 1024 * 1024) { fail(CLOSE.rate, "bandwidth limit exceeded"); return; }

      const envelope = JSON.parse(frame.toString()) as Record<string, unknown>;
      const sessionToken = typeof envelope.sessionToken === "string" ? envelope.sessionToken : undefined;
      delete envelope.sessionToken;
      const message = CareerSocketClientMessageSchema.parse(envelope);
      sessionId ??= message.sessionId;
      if (message.sessionId !== sessionId || message.recordId !== recordId) {
        fail(CLOSE.protocol, "session envelope mismatch"); return;
      }
      if (message.type === "sync") {
        if (joined) { fail(CLOSE.protocol, "sync already completed"); return; }
        if (!sessionToken || !options.service.verifySessionToken(principal.user.id, recordId, sessionToken)) {
          fail(CLOSE.auth, "invalid session token"); return;
        }
        if (registry.count(principal.user.id, recordId) >= 3) {
          fail(CLOSE.rate, "too many sessions"); return;
        }
        joined = registry.join({
          sessionId, userId: principal.user.id, recordId,
          send: (value) => send(socket, value),
        });
        const bootstrap = await options.service.bootstrap(principal.user.id, recordId);
        send(socket, {
          type: "ready", protocolVersion: 1, recordId, sessionId,
          sequence: bootstrap.documentVersion, documentVersion: bootstrap.documentVersion,
        });
        for (const update of await options.service.updatesSince(
          principal.user.id, recordId, message.lastAckSequence,
        )) {
          send(socket, {
            type: "update", protocolVersion: 1, recordId, sessionId,
            sequence: update.serverSequence, updateBase64: update.updateBase64, actor: update.actor,
          });
        }
        return;
      }
      if (!joined) { fail(CLOSE.protocol, "sync is required first"); return; }
      if (message.type === "update") {
        if (Date.now() - secondStartedAt >= 1_000) { updatesInSecond = 0; secondStartedAt = Date.now(); }
        updatesInSecond += 1;
        if (updatesInSecond > 30) { fail(CLOSE.rate, "update rate exceeded"); return; }
        const updateBytes = Buffer.from(message.updateBase64, "base64");
        if (updateBytes.length > MAX_UPDATE) { fail(CLOSE.size, "document update exceeds 1MB"); return; }
        const acknowledgement = await options.service.appendUpdate(principal.user.id, {
          recordId,
          clientId: message.clientId,
          clientSequence: message.clientSequence,
          updateBase64: message.updateBase64,
          checksum: createHash("sha256").update(updateBytes).digest("hex"),
        });
        registry.publish(recordId, {
          type: "update", protocolVersion: 1, recordId, sessionId,
          sequence: acknowledgement.serverSequence, updateBase64: message.updateBase64, actor: "user",
        }, sessionId);
        send(socket, {
          type: "ack", protocolVersion: 1, recordId, sessionId,
          sequence: acknowledgement.serverSequence,
          documentVersion: acknowledgement.documentVersion,
        });
      } else if (message.type === "awareness") {
        registry.publish(recordId, {
          type: "awareness", protocolVersion: 1, recordId, sessionId,
          actor: message.actor, payload: message.payload,
        }, sessionId);
      }
    } catch (error) {
      const status = error && typeof error === "object" && "statusCode" in error
        ? Number((error as { statusCode: number }).statusCode)
        : 0;
      fail(
        status === 409 ? CLOSE.conflict : status === 413 ? CLOSE.size : CLOSE.protocol,
        error instanceof Error ? error.message.slice(0, 500) : "invalid message",
      );
    }
  };

  let processing = Promise.resolve();
  const enqueue = (raw: RawData) => { processing = processing.then(() => processMessage(raw)); };
  socket.off("message", collectEarly);
  socket.on("message", enqueue);
  for (const raw of earlyMessages) enqueue(raw);
}
