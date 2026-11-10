import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";

import { registerErrorHandler } from "../../api/error-handler.js";
import type { PageApi } from "./index.js";
import { registerPageRoutes } from "./routes.js";

const user = "00000000-0000-4000-8000-000000000001";
const portfolio = "00000000-0000-4000-8000-000000000002";
const record = "00000000-0000-4000-8000-000000000003";

/** 다듬기 화면의 경로가 인자를 서비스까지 그대로 넘기는지 봅니다. 서비스 동작은 구조화 지면 통합 테스트가 봅니다. */
describe("다듬기 경로", () => {
  function app() {
    const service = {
      owns: async () => true,
      addRecordSection: vi.fn(async () => ({ revision: 3 })),
      editorDesign: vi.fn(async () => ({ steps: [], colors: { text: "#000000", muted: "#555555", accent: "#2255ff" }, fonts: { display: "A", body: "B", mono: "C" } })),
      editableRender: vi.fn(async () => ({ revision: 2, html: "<main></main>", css: "" })),
    };
    const server = Fastify();
    registerErrorHandler(server);
    registerPageRoutes(server, {
      service: service as unknown as PageApi,
      authenticateRequest: async (request) => {
        request.auth = { sessionId: "session", user: { id: user, email: "test@example.com", displayName: "test", planCode: "free", emailVerifiedAt: null, role: "user", impersonation: null }, owner: { userId: user, displayName: "test", role: "user" } };
      },
    });
    return { server, service };
  }

  it("요소를 말로 고치는 옛 경로는 없다 — 다듬기 채팅은 에이전트 채팅이 맡는다", async () => {
    const { server } = app();
    const response = await server.inject({ method: "POST", url: `/v1/portfolios/${portfolio}/page/elements/quote-1/instruct`, payload: { expectedRevision: 2, instruction: "짧게" } });
    expect(response.statusCode).toBe(404);
    await server.close();
  });

  it("기록 추가 · 디자인 값 · 편집용 렌더를 연다", async () => {
    const { server, service } = app();
    const added = await server.inject({ method: "POST", url: `/v1/portfolios/${portfolio}/page/sections`, payload: { expectedRevision: 2, recordId: record } });
    expect(added.statusCode).toBe(201);
    expect(service.addRecordSection).toHaveBeenCalledWith(user, portfolio, { expectedRevision: 2, recordId: record }, null);
    expect((await server.inject({ method: "GET", url: `/v1/portfolios/${portfolio}/page/design` })).json().data.colors.accent).toBe("#2255ff");
    expect((await server.inject({ method: "GET", url: `/v1/portfolios/${portfolio}/page/editable` })).json()).toEqual({ data: { revision: 2, html: "<main></main>", css: "" } });
    await server.close();
  });
});
