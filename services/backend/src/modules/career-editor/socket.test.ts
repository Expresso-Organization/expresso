import { createHmac, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CareerSocketClientMessageSchema, CareerSocketServerMessageSchema } from "@expresso/contracts";
import { InMemoryCareerDocumentSessionRegistry } from "./session-registry.js";
import { CareerDocumentService } from "./service.js";

describe("career document session registry", () => {
  it("publishes only to joined record sessions and cleans up exactly", () => {
    const registry = new InMemoryCareerDocumentSessionRegistry();
    const recordId = randomUUID();
    const received: unknown[][] = [[], []];
    const sessionA = randomUUID(); const sessionB = randomUUID();
    const leaveA = registry.join({ sessionId: sessionA, userId: "u", recordId, send: (m) => received[0]!.push(m) });
    const leaveB = registry.join({ sessionId: sessionB, userId: "u", recordId, send: (m) => received[1]!.push(m) });
    const message = { type: "awareness" as const, protocolVersion: 1 as const, recordId, sessionId: randomUUID(), actor: "user" as const, payload: { cursor: 1 } };
    registry.publish(recordId, CareerSocketServerMessageSchema.parse(message));
    expect(received[0]).toHaveLength(1);
    expect(received[1]).toHaveLength(1);
    expect(received[0]?.[0]).toMatchObject({ sessionId: sessionA });
    expect(received[1]?.[0]).toMatchObject({ sessionId: sessionB });
    leaveA();
    expect(registry.count("u", recordId)).toBe(1);
    leaveB();
    expect(registry.count("u", recordId)).toBe(0);
  });

  it("accepts awareness as a non-durable server message", () => {
    expect(CareerSocketServerMessageSchema.parse({
      type: "awareness", protocolVersion: 1, recordId: randomUUID(), sessionId: randomUUID(), actor: "ai", payload: { thinking: true },
    }).type).toBe("awareness");
  });

  it("binds the short-lived session token to its owner and record", () => {
    const secret = "socket-test-signing-secret";
    const service = new CareerDocumentService({} as never, secret);
    const userId = randomUUID();
    const recordId = randomUUID();
    const token = (expiresAt: number) => {
      const body = `${userId}.${recordId}.${expiresAt}`;
      return `${body}.${createHmac("sha256", secret).update(body).digest("hex")}`;
    };
    expect(service.verifySessionToken(userId, recordId, token(Date.now() + 60_000))).toBe(true);
    expect(service.verifySessionToken(userId, randomUUID(), token(Date.now() + 60_000))).toBe(false);
    expect(service.verifySessionToken(userId, recordId, token(Date.now() - 1))).toBe(false);
  });

  it("rejects oversized encoded updates at the contract boundary", () => {
    expect(() => CareerSocketClientMessageSchema.parse({
      type: "update",
      protocolVersion: 1,
      recordId: randomUUID(),
      sessionId: randomUUID(),
      clientId: randomUUID(),
      clientSequence: 1,
      updateBase64: "A".repeat(1_398_105),
    })).toThrow();
  });
});
