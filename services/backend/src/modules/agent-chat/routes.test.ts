import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { registerAgentChatRoutes } from "./routes.js";
import type { AgentChatService } from "./service.js";
const user = "00000000-0000-4000-8000-000000000001";
const conversation = "00000000-0000-4000-8000-000000000002";
const apiKey = "sk-ant-test-personal-key-value";
describe("에이전트 인증 분리", () => {
  it.each([false, true])("개발 멤버 여부에 따라 서버 인증 사용을 제한한다: %s", async developer => {
    let stored: string | undefined;
    const credentials = { configured: async () => !!stored, save: async (_id: string, value: string) => { stored = value; }, read: async () => stored, remove: async () => { stored = undefined; } };
    const app = Fastify(); const send = vi.fn(async () => ({}));
    registerAgentChatRoutes(app, { credentials, enabled: true, consentRequired: async () => true, send, close: async () => {}, setRunFailureListener: () => {} } as unknown as AgentChatService, async req => { req.auth = { sessionId: "session", user: { id: user, email: "test@example.com", displayName: "test", planCode: "free", emailVerifiedAt: null, role: "user", impersonation: null }, owner: { userId: user, displayName: "test", role: "user" } }; }, developer ? [user] : []);
    const access = await app.inject({ method: "GET", url: "/v1/agent/access" });
    expect(access.json().data).toMatchObject({ serverCredentialAllowed: developer, consentRequired: true, model: "sonnet" });
    const body = { requestId: conversation, text: "안녕" };
    const response = await app.inject({ method: "POST", url: `/v1/agent/conversations/${conversation}/messages`, payload: body });
    expect(response.statusCode).toBe(developer ? 202 : 403);
    expect(send).toHaveBeenCalledTimes(developer ? 1 : 0);
    if (!developer) {
      const saved = await app.inject({ method: "PUT", url: "/v1/agent/credential", payload: { apiKey } });
      expect(saved.json()).toEqual({ data: { configured: true } });
      const keyed = await app.inject({ method: "POST", url: `/v1/agent/conversations/${conversation}/messages`, payload: body });
      expect(keyed.statusCode).toBe(202); expect(send).toHaveBeenLastCalledWith(user, conversation, body, apiKey);
    }
    const removed = await app.inject({ method: "DELETE", url: "/v1/agent/credential" });
    expect(removed.json()).toEqual({ data: { configured: false } });
    expect(stored).toBeUndefined();
    await app.close();
  });
  it("관리자가 대신 로그인한 더미 계정은 개인 키 없이 서버 인증을 쓴다", async () => {
    const admin = "00000000-0000-4000-8000-000000000003";
    const credentials = { configured: async () => false, save: async () => {}, read: async () => undefined, remove: async () => {} };
    const app = Fastify(); const send = vi.fn(async () => ({})); const retry = vi.fn(async () => ({}));
    registerAgentChatRoutes(app, { credentials, enabled: true, consentRequired: async () => false, send, retry, close: async () => {}, setRunFailureListener: () => {} } as unknown as AgentChatService, async req => { req.auth = { sessionId: "session", user: { id: user, email: "dummy@example.com", displayName: "dummy", planCode: "team", emailVerifiedAt: null, role: "user", impersonation: { adminUserId: admin, adminDisplayName: "admin", since: "2026-11-09T00:00:00.000Z" } }, owner: { userId: admin, displayName: "admin", role: "admin" } }; }, []);
    const access = await app.inject({ method: "GET", url: "/v1/agent/access" });
    expect(access.json().data).toMatchObject({ serverCredentialAllowed: true, apiKeyConfigured: false });
    const body = { requestId: conversation, text: "안녕" };
    const response = await app.inject({ method: "POST", url: `/v1/agent/conversations/${conversation}/messages`, payload: body });
    expect(response.statusCode).toBe(202);
    expect(send).toHaveBeenLastCalledWith(user, conversation, body, undefined);
    const retried = await app.inject({ method: "POST", url: `/v1/agent/conversations/${conversation}/retry` });
    expect(retried.statusCode).toBe(202);
    expect(retry).toHaveBeenLastCalledWith(user, conversation, undefined);
    await app.close();
  });
});
