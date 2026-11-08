import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { registerAgentChatRoutes } from "./routes.js";
import type { AgentChatService } from "./service.js";
const user = "00000000-0000-4000-8000-000000000001";
const conversation = "00000000-0000-4000-8000-000000000002";
const auth = { sessionId: "test", user: { id: user, email: "test@example.com", displayName: "test", planCode: "free", emailVerifiedAt: null, role: "user", impersonation: null }, owner: { userId: user, displayName: "test", role: "user" } } as const;
describe("Codex agent access", () => {
  it("allows authenticated Codex sends and retries without reading an Anthropic key", async () => {
    const app = Fastify();
    const read = vi.fn(async () => "should-not-be-read");
    const send = vi.fn(async () => ({})); const retry = vi.fn(async () => ({}));
    registerAgentChatRoutes(app, { provider: "codex", enabled: true, credentials: { configured: async () => false, read }, consentRequired: async () => false, send, retry, close: async () => {} } as unknown as AgentChatService, async req => { req.auth = auth; });
    try {
      const access = await app.inject({ method: "GET", url: "/v1/agent/access" });
      expect(access.json().data).toMatchObject({ serverCredentialAllowed: true, apiKeyConfigured: false });
      const payload = { requestId: conversation, text: "안녕" };
      expect((await app.inject({ method: "POST", url: `/v1/agent/conversations/${conversation}/messages`, payload })).statusCode).toBe(202);
      expect(send).toHaveBeenCalledWith(user, conversation, payload, undefined);
      expect((await app.inject({ method: "POST", url: `/v1/agent/conversations/${conversation}/retry` })).statusCode).toBe(202);
      expect(retry).toHaveBeenCalledWith(user, conversation, undefined);
      expect(read).not.toHaveBeenCalled();
    } finally { await app.close(); }
  });
  it("still requires authentication in Codex mode", async () => {
    const app = Fastify(); const send = vi.fn();
    registerAgentChatRoutes(app, { provider: "codex", enabled: true, send, close: async () => {} } as unknown as AgentChatService, async () => { throw Object.assign(new Error("auth required"), { statusCode: 401 }); });
    try {
      expect((await app.inject({ method: "POST", url: `/v1/agent/conversations/${conversation}/messages`, payload: { requestId: conversation, text: "안녕" } })).statusCode).toBe(401);
      expect(send).not.toHaveBeenCalled();
    } finally { await app.close(); }
  });
});
