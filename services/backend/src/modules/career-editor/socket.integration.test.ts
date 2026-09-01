import { randomUUID } from "node:crypto";

import websocket from "@fastify/websocket";
import { encodeDocumentAsYUpdate } from "@expresso/editor";
import { mongoCollections } from "@expresso/database";
import Fastify from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";

import { createMongoFixture } from "../../../test/support/mongodb.js";
import { IdentityService } from "../identity/index.js";
import { CareerDocumentService } from "./service.js";
import { registerCareerDocumentSocket } from "./socket.js";

function waitForMessage(socket: WebSocket, predicate: (message: Record<string, unknown>) => boolean) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const timeout = setTimeout(() => { cleanup(); reject(new Error("websocket message timeout")); }, 3_000);
    const onMessage = (data: WebSocket.RawData) => {
      const message = JSON.parse(data.toString()) as Record<string, unknown>;
      if (predicate(message)) { cleanup(); resolve(message); }
    };
    const cleanup = () => { clearTimeout(timeout); socket.off("message", onMessage); };
    socket.on("message", onMessage);
  });
}

function waitForClose(socket: WebSocket) {
  return new Promise<number>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("websocket close timeout")), 3_000);
    socket.once("close", (code) => { clearTimeout(timeout); resolve(code); });
  });
}

describe.skipIf(!(process.env.TEST_MONGODB_ADMIN_URL ?? process.env.TEST_MONGODB_URL))(
  "career document websocket with MongoDB",
  () => {
    let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
    let app: ReturnType<typeof Fastify>;
    let port: number;
    let recordId: string;
    let userId: string;
    let accessToken: string;
    let otherAccessToken: string;
    let sessionToken: string;
    let initialDocument: Awaited<ReturnType<CareerDocumentService["bootstrap"]>>["document"];
    const sockets: WebSocket[] = [];

    const connect = async (token: string, origin = "http://127.0.0.1:3000") => {
      const socket = new WebSocket(`ws://127.0.0.1:${port}/v1/career/records/${recordId}/session`, {
        headers: { Origin: origin, Cookie: `ex_session=${token}` },
      });
      sockets.push(socket);
      await new Promise<void>((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
      return socket;
    };

    const sync = async (socket: WebSocket, token: string, lastAckSequence = 0) => {
      const sessionId = randomUUID();
      const first = waitForMessage(socket, () => true);
      socket.send(JSON.stringify({
        type: "sync", protocolVersion: 1, recordId, sessionId, sessionToken: token,
        stateVectorBase64: "", lastAckSequence,
      }));
      const message = await first;
      if (message.type !== "ready") throw new Error(`sync failed: ${JSON.stringify(message)}`);
      return sessionId;
    };

    beforeAll(async () => {
      fixture = await createMongoFixture("career-socket");
      const identity = new IdentityService(fixture.resource);
      const first = await identity.signup({ email: `socket-${randomUUID()}@example.com`, password: "correct-horse-battery", displayName: "편집자" });
      const second = await identity.signup({ email: `socket-${randomUUID()}@example.com`, password: "correct-horse-battery", displayName: "다른 사용자" });
      userId = first.user.id;
      accessToken = first.session.accessToken;
      otherAccessToken = second.session.accessToken;
      recordId = randomUUID();
      const category = await mongoCollections(fixture.resource.db).careerCategories.findOne({ isSystem: true });
      await mongoCollections(fixture.resource.db).careerRecords.insertOne({
        _id: recordId, userId, categoryId: category!._id, title: "소켓 기록", status: "draft",
        origin: "manual", properties: {}, bodyMd: "# 소켓 기록", version: 1,
        updatedAt: new Date(), deletedAt: null,
      });
      const service = new CareerDocumentService(fixture.resource, "socket-integration-secret");
      const bootstrap = await service.bootstrap(userId, recordId);
      sessionToken = bootstrap.sessionToken;
      initialDocument = bootstrap.document;
      app = Fastify();
      await app.register(websocket);
      registerCareerDocumentSocket(app, {
        service,
        identityService: identity,
        signingSecret: "socket-integration-secret",
      });
      await app.listen({ host: "127.0.0.1", port: 0 });
      const address = app.server.address();
      if (!address || typeof address === "string") throw new Error("server address unavailable");
      port = address.port;
    }, 60_000);

    afterAll(async () => {
      for (const socket of sockets) socket.terminate();
      await app?.close();
      await fixture?.dispose();
    });

    it("persists before ack and broadcasts to the second client", async () => {
      const writer = await connect(accessToken);
      const observer = await connect(accessToken);
      const writerSession = await sync(writer, sessionToken);
      await sync(observer, sessionToken);
      const next = structuredClone(initialDocument);
      next.content[0]!.text = [{ text: "저장된 변경" }];
      const base = encodeDocumentAsYUpdate(initialDocument);
      const update = encodeDocumentAsYUpdate(next, [base]);
      const ack = waitForMessage(writer, (message) => message.type === "ack");
      const broadcast = waitForMessage(observer, (message) => message.type === "update");
      writer.send(JSON.stringify({
        type: "update", protocolVersion: 1, recordId, sessionId: writerSession,
        clientId: randomUUID(), clientSequence: 1, updateBase64: Buffer.from(update).toString("base64"),
      }));
      expect(await ack).toMatchObject({ type: "ack", sequence: 1, documentVersion: 1 });
      expect(await broadcast).toMatchObject({ type: "update", sequence: 1 });
      expect(await mongoCollections(fixture.resource.db).careerDocumentUpdates.countDocuments({ recordId, serverSequence: 1 })).toBe(1);
    });

    it("replays missing updates after reconnect", async () => {
      const reconnected = await connect(accessToken);
      const replay = waitForMessage(reconnected, (message) => message.type === "update");
      await sync(reconnected, sessionToken, 0);
      expect(await replay).toMatchObject({ type: "update", sequence: 1 });
    });

    it("rejects the wrong owner token and an untrusted origin", async () => {
      const foreign = await connect(otherAccessToken);
      const foreignClose = waitForClose(foreign);
      foreign.send(JSON.stringify({
        type: "sync", protocolVersion: 1, recordId, sessionId: randomUUID(), sessionToken,
        stateVectorBase64: "", lastAckSequence: 0,
      }));
      expect(await foreignClose).toBe(4401);
      const badOrigin = await connect(accessToken, "https://evil.example");
      expect(await waitForClose(badOrigin)).toBe(4403);
    });
  },
);
