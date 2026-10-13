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
    registerAgentChatRoutes(app, { credentials, enabled: true, consentRequired: async () => true, send, close: async () => {} } as unknown as AgentChatService, async req => { req.auth = { sessionId: "session", user: { id: user, email: "test@example.com", displayName: "test", planCode: "free" } }; }, developer ? [user] : []);
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
});

describe("Codex 키 분리", () => {
  it("개인 Anthropic 키를 조회하지 않고 서버에서 선택한 Codex 실행부를 사용한다", async () => {
    const credentials = { configured: vi.fn(), read: vi.fn() };
    const send = vi.fn(async () => ({}));
    const app = Fastify();
    registerAgentChatRoutes(app, { credentials, enabled: true, requiresApiKey: false, provider: "codex", model: "codex", consentRequired: async () => false, send, close: async () => {} } as unknown as AgentChatService, async req => {
      req.auth = { sessionId: "session", user: { id: user, email: "test@example.com", displayName: "test", planCode: "free" } };
    });
    const access = await app.inject({ method: "GET", url: "/v1/agent/access" });
    expect(access.json().data).toMatchObject({ provider: "codex", model: "codex", apiKeyRequired: false, serverCredentialAllowed: false });
    const body = { requestId: conversation, text: "안녕" };
    const response = await app.inject({ method: "POST", url: `/v1/agent/conversations/${conversation}/messages`, payload: body });
    expect(response.statusCode).toBe(202);
    expect(send).toHaveBeenCalledWith(user, conversation, body, undefined);
    expect(credentials.read).not.toHaveBeenCalled();
    expect(credentials.configured).not.toHaveBeenCalled();
    await app.close();
  });
});
