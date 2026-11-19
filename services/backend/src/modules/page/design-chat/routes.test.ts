import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";

import { registerErrorHandler } from "../../../api/error-handler.js";
import { registerDesignChatRoutes } from "./routes.js";
import { DesignChatError, type DesignChatService } from "./service.js";

const user = "00000000-0000-4000-8000-000000000001";
const brew = "00000000-0000-4000-8000-000000000002";
const request = "00000000-0000-4000-8000-000000000003";

function app(service: Partial<Record<keyof DesignChatService, unknown>> | null) {
  const server = Fastify();
  registerErrorHandler(server);
  registerDesignChatRoutes(server, {
    service: service as unknown as DesignChatService | null,
    authenticateRequest: async (incoming) => {
      incoming.auth = { sessionId: "session", user: { id: user, email: "test@example.com", displayName: "test", planCode: "free", emailVerifiedAt: null, role: "user", impersonation: null }, owner: { userId: user, displayName: "test" } } as never;
    },
  });
  return server;
}

describe("디자인 대화 경로", () => {
  it("AI가 꺼진 서버에서는 503을 낸다 — 화면은 그것을 보고 카탈로그 화면을 연다", async () => {
    const server = app(null);
    expect((await server.inject({ method: "GET", url: `/v1/brews/${brew}/design-chat` })).statusCode).toBe(503);
    expect((await server.inject({ method: "POST", url: `/v1/brews/${brew}/design-chat/open`, payload: { requestId: request } })).statusCode).toBe(503);
    await server.close();
  });

  it("읽기에는 판을, 답을 만드는 요청에는 본문을 넘기고 202로 바로 답한다", async () => {
    const chat = { id: request, version: 3 };
    const service = {
      get: vi.fn(async () => ({ chat: null, unchanged: true })),
      open: vi.fn(async () => chat),
      send: vi.fn(async () => chat),
      retry: vi.fn(async () => chat),
      select: vi.fn(async () => chat),
      close: vi.fn(async () => undefined),
    };
    const server = app(service);
    expect((await server.inject({ method: "GET", url: `/v1/brews/${brew}/design-chat?since=3` })).json()).toEqual({ data: { chat: null, unchanged: true } });
    expect(service.get).toHaveBeenCalledWith(user, brew, 3);
    expect((await server.inject({ method: "POST", url: `/v1/brews/${brew}/design-chat/open`, payload: { requestId: request } })).statusCode).toBe(202);
    const sent = await server.inject({ method: "POST", url: `/v1/brews/${brew}/design-chat/messages`, payload: { action: "draw", requestId: request, directionIds: [request] } });
    expect(sent.statusCode).toBe(202);
    expect(service.send).toHaveBeenCalledWith(user, brew, { action: "draw", requestId: request, directionIds: [request] });
    expect((await server.inject({ method: "POST", url: `/v1/brews/${brew}/design-chat/messages`, payload: { action: "say", requestId: request, text: " " } })).statusCode).toBe(400);
    expect((await server.inject({ method: "POST", url: `/v1/brews/${brew}/design-chat/selection`, payload: { snippetId: null } })).statusCode).toBe(200);
    expect(service.select).toHaveBeenCalledWith(user, brew, null);
    await server.close();
    // 서버가 내려갈 때 돌리던 답을 끊긴 것으로 적는다.
    expect(service.close).toHaveBeenCalled();
  });

  it("서비스가 사용자에게 쓴 문장을 그대로 내보낸다", async () => {
    const server = app({ close: async () => undefined, send: async () => { throw new DesignChatError(409, "design chat is running", "답을 만드는 중입니다. 끝난 뒤에 보내 주세요."); } });
    const response = await server.inject({ method: "POST", url: `/v1/brews/${brew}/design-chat/messages`, payload: { action: "say", requestId: request, text: "더 밝게" } });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.message).toBe("답을 만드는 중입니다. 끝난 뒤에 보내 주세요.");
    await server.close();
  });
});
