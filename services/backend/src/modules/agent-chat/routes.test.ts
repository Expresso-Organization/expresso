import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { registerAgentChatRoutes } from "./routes.js";
import type { AgentChatService } from "./service.js";
const user = "00000000-0000-4000-8000-000000000001";
const conversation = "00000000-0000-4000-8000-000000000002";
const apiKey = "sk-ant-test-personal-key-value";
const body = { requestId: conversation, text: "안녕" };

/** 키 저장소 대역과, 일반 계정으로 인증된 앱. */
function setup(options: { creditsExhausted?: boolean } = {}) {
  let stored: string | undefined;
  const credentials = { configured: async () => !!stored, save: async (_id: string, value: string) => { stored = value; }, read: async () => stored, remove: async () => { stored = undefined; } };
  const send = vi.fn(async () => ({}));
  const retry = vi.fn(async () => ({}));
  const app = Fastify();
  registerAgentChatRoutes(app, { credentials, enabled: true, consentRequired: async () => false, creditsExhausted: async () => options.creditsExhausted ?? false, send, retry, close: async () => {}, setRunFailureListener: () => {} } as unknown as AgentChatService, async req => { req.auth = { sessionId: "session", user: { id: user, email: "test@example.com", displayName: "test", planCode: "free", emailVerifiedAt: null, role: "user", impersonation: null }, owner: { userId: user, displayName: "test", role: "user" } }; });
  return { app, send, retry, stored: () => stored };
}

describe("에이전트 채팅 접근", () => {
  it("개인 키가 없는 일반 계정도 서버 인증으로 보내고 다시 보낸다", async () => {
    const { app, send, retry } = setup();
    const access = await app.inject({ method: "GET", url: "/v1/agent/access" });
    expect(access.json().data).toEqual({ enabled: true, consentRequired: false, apiKeyConfigured: false, creditsExhausted: false, model: "sonnet" });
    const response = await app.inject({ method: "POST", url: `/v1/agent/conversations/${conversation}/messages`, payload: body });
    expect(response.statusCode).toBe(202);
    expect(send).toHaveBeenLastCalledWith(user, conversation, body, undefined);
    const retried = await app.inject({ method: "POST", url: `/v1/agent/conversations/${conversation}/retry` });
    expect(retried.statusCode).toBe(202);
    expect(retry).toHaveBeenLastCalledWith(user, conversation, undefined);
    await app.close();
  });

  it("개인 키를 등록한 계정은 그 키로 보내고, 키를 지우면 서버 인증으로 돌아간다", async () => {
    const { app, send, retry, stored } = setup();
    const saved = await app.inject({ method: "PUT", url: "/v1/agent/credential", payload: { apiKey } });
    expect(saved.json()).toEqual({ data: { configured: true } });
    await app.inject({ method: "POST", url: `/v1/agent/conversations/${conversation}/messages`, payload: body });
    expect(send).toHaveBeenLastCalledWith(user, conversation, body, apiKey);
    await app.inject({ method: "POST", url: `/v1/agent/conversations/${conversation}/retry` });
    expect(retry).toHaveBeenLastCalledWith(user, conversation, apiKey);
    const removed = await app.inject({ method: "DELETE", url: "/v1/agent/credential" });
    expect(removed.json()).toEqual({ data: { configured: false } });
    expect(stored()).toBeUndefined();
    await app.inject({ method: "POST", url: `/v1/agent/conversations/${conversation}/messages`, payload: body });
    expect(send).toHaveBeenLastCalledWith(user, conversation, body, undefined);
    await app.close();
  });

  it("이번 달 크레딧을 다 쓴 계정은 접근 응답에 한도가 뜨고, 개인 키를 등록하면 뜨지 않는다", async () => {
    const { app } = setup({ creditsExhausted: true });
    expect((await app.inject({ method: "GET", url: "/v1/agent/access" })).json().data).toMatchObject({ apiKeyConfigured: false, creditsExhausted: true });
    await app.inject({ method: "PUT", url: "/v1/agent/credential", payload: { apiKey } });
    expect((await app.inject({ method: "GET", url: "/v1/agent/access" })).json().data).toMatchObject({ apiKeyConfigured: true, creditsExhausted: false });
    await app.close();
  });
});
