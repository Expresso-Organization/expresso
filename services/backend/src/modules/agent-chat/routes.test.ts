import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { registerAgentChatRoutes } from "./routes.js";
import type { AgentChatService } from "./service.js";
const user = "00000000-0000-4000-8000-000000000001";
const conversation = "00000000-0000-4000-8000-000000000002";
const apiKey = "sk-ant-test-personal-key-value";
describe("에이전트 인증 분리", () => {
  it.each([false, true])("개발 멤버 여부에 따라 서버 인증 사용을 제한한다: %s", async developer => {
    const app = Fastify(); const send = vi.fn(async () => ({}));
    registerAgentChatRoutes(app, { enabled: true, consentRequired: async () => true, send, close: async () => {} } as unknown as AgentChatService, async req => { req.auth = { sessionId: "session", user: { id: user, email: "test@example.com", displayName: "test", planCode: "free" } }; }, developer ? [user] : []);
    const access = await app.inject({ method: "GET", url: "/v1/agent/access" });
    expect(access.json().data).toMatchObject({ serverCredentialAllowed: developer, consentRequired: true, model: "sonnet" });
    const body = { requestId: conversation, text: "안녕" };
    const response = await app.inject({ method: "POST", url: `/v1/agent/conversations/${conversation}/messages`, payload: body });
    expect(response.statusCode).toBe(developer ? 202 : 403);
    expect(send).toHaveBeenCalledTimes(developer ? 1 : 0);
    if (!developer) {
      const keyed = await app.inject({ method: "POST", url: `/v1/agent/conversations/${conversation}/messages`, payload: { ...body, apiKey } });
      expect(keyed.statusCode).toBe(202); expect(send).toHaveBeenLastCalledWith(user, conversation, { ...body, apiKey });
    }
    await app.close();
  });
});
