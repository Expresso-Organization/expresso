import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import type { ConsultantCommitment } from "@expresso/contracts";
import { ConsultantInputError } from "./commitments.js";
import { registerConsultantRoutes } from "./routes.js";

const user = "00000000-0000-4000-8000-000000000001";
const commitment: ConsultantCommitment = { id: "00000000-0000-4000-8000-000000000002", title: "해커톤 지원서 내기", detail: "", dueOn: "2026-11-19", status: "open", awaiting: true, conversationId: null, createdAt: "2026-11-12T00:00:00.000Z" };
const conversation = "00000000-0000-4000-8000-000000000003";
const profile = { stage: null, stageSource: null, stageUpdatedAt: null, preferences: [], outreach: null };
const checkins = { outreach: true, today: "2026-11-20", commitments: [commitment], quiet: false };

function setup(options: { proposals?: "ok" | "refused" | "none"; chat?: string | null } = {}) {
  const service = { profile: vi.fn(async () => profile), setStage: vi.fn(), removePreference: vi.fn(), setOutreach: vi.fn(async () => profile) };
  const commitments = {
    open: vi.fn(async () => [commitment]), get: vi.fn(async () => commitment), checkins: vi.fn(async () => checkins), dismissQuiet: vi.fn(async () => undefined),
    update: vi.fn(async (_user: string, _id: string, change: { dueOn?: string | undefined; status?: "done" | "dropped" | undefined }) => ({ ...commitment, ...(change.dueOn ? { dueOn: change.dueOn, awaiting: false } : {}), ...(change.status ? { status: change.status, awaiting: false } : {}) })),
    answer: vi.fn(async (_user: string, _id: string, answer: { answer: string; dueOn?: string }) => ({ changed: true, commitment: { ...commitment, awaiting: false, ...(answer.answer === "not_yet" ? { dueOn: answer.dueOn! } : { status: answer.answer as "done" | "dropped" }) } })),
  };
  const startCheckinChat = vi.fn(async () => options.chat === undefined ? conversation : options.chat);
  const proposals = options.proposals === "none" ? undefined : { enable: vi.fn(async () => { if (options.proposals === "refused") throw new Error("동의가 필요합니다."); }), disable: vi.fn(async () => undefined) };
  const app = Fastify();
  registerConsultantRoutes(app, { service, commitments, digests: async () => [], diagnosis: async () => null, startCheckinChat, proposals, authenticateRequest: async req => { req.auth = { sessionId: "session", user: { id: user, email: "test@example.com", displayName: "test", planCode: "free", emailVerifiedAt: null, role: "user", impersonation: null }, owner: { userId: user, displayName: "test", role: "user" } }; } });
  return { app, service, commitments, startCheckinChat, proposals };
}

describe("컨설턴트의 약속과 연락", () => {
  it("기억에는 먼저 연락하기 설정과 열린 약속이 함께 실린다", async () => {
    const { app } = setup();
    expect((await app.inject({ method: "GET", url: "/v1/consultant/memory" })).json().data).toEqual({ ...profile, commitments: [commitment], diagnosis: null, recentConversations: [] });
    expect((await app.inject({ method: "GET", url: "/v1/consultant/checkins" })).json().data).toEqual(checkins);
    expect((await app.inject({ method: "GET", url: `/v1/consultant/commitments/${commitment.id}` })).json().data).toEqual(commitment);
    await app.close();
  });
  it("「했어요」는 약속을 닫고 그 일을 묻는 대화를 열어 그 id를 돌려준다. 채팅을 쓸 수 없으면 대화 없이 닫기만 한다", async () => {
    const { app, commitments, startCheckinChat } = setup();
    const done = await app.inject({ method: "POST", url: `/v1/consultant/commitments/${commitment.id}/checkin`, payload: { answer: "done" } });
    expect(done.json().data).toEqual({ commitment: { ...commitment, status: "done", awaiting: false }, conversationId: conversation });
    expect(commitments.answer).toHaveBeenLastCalledWith(user, commitment.id, { answer: "done" });
    expect(startCheckinChat).toHaveBeenCalledWith(user, expect.objectContaining({ id: commitment.id, status: "done" }));
    await app.close();
    // 이미 닫힌 약속에 「했어요」가 다시 오면(다시 누름 · 지난 카드) 대화를 다시 열지 않는다.
    const repeated = setup();
    repeated.commitments.answer.mockResolvedValue({ changed: false, commitment: { ...commitment, status: "done", awaiting: false } });
    expect((await repeated.app.inject({ method: "POST", url: `/v1/consultant/commitments/${commitment.id}/checkin`, payload: { answer: "done" } })).json().data).toEqual({ commitment: { ...commitment, status: "done", awaiting: false }, conversationId: null });
    expect(repeated.startCheckinChat).not.toHaveBeenCalled();
    await repeated.app.close();
    const offline = setup({ chat: null });
    expect((await offline.app.inject({ method: "POST", url: `/v1/consultant/commitments/${commitment.id}/checkin`, payload: { answer: "done" } })).json().data.conversationId).toBeNull();
    await offline.app.close();
  });
  it("「아직이에요」와 「안 하기로 했어요」는 대화를 열지 않는다. 날짜 없는 미루기와 모르는 답은 받지 않는다", async () => {
    const { app, commitments, startCheckinChat } = setup();
    const later = await app.inject({ method: "POST", url: `/v1/consultant/commitments/${commitment.id}/checkin`, payload: { answer: "not_yet", dueOn: "2026-11-27" } });
    expect(later.json().data).toEqual({ commitment: { ...commitment, dueOn: "2026-11-27", awaiting: false }, conversationId: null });
    const dropped = await app.inject({ method: "POST", url: `/v1/consultant/commitments/${commitment.id}/checkin`, payload: { answer: "dropped" } });
    expect(dropped.json().data.commitment.status).toBe("dropped");
    expect(startCheckinChat).not.toHaveBeenCalled();
    for (const payload of [{ answer: "not_yet" }, { answer: "not_yet", dueOn: "다음 주" }, { answer: "maybe" }, {}]) expect((await app.inject({ method: "POST", url: `/v1/consultant/commitments/${commitment.id}/checkin`, payload })).statusCode, JSON.stringify(payload)).toBe(400);
    expect((await app.inject({ method: "POST", url: "/v1/consultant/commitments/not-an-id/checkin", payload: { answer: "done" } })).statusCode).toBe(400);
    expect(commitments.answer).toHaveBeenCalledTimes(2);
    await app.close();
  });
  it("약속 카드는 날짜를 바꾸거나 거둘 수 있고, 「했음」으로 닫는 일은 확인 답으로만 한다", async () => {
    const { app, commitments } = setup();
    expect((await app.inject({ method: "PATCH", url: `/v1/consultant/commitments/${commitment.id}`, payload: { dueOn: "2026-12-01" } })).json().data.dueOn).toBe("2026-12-01");
    expect((await app.inject({ method: "PATCH", url: `/v1/consultant/commitments/${commitment.id}`, payload: { status: "dropped" } })).json().data.status).toBe("dropped");
    for (const payload of [{ status: "done" }, {}, { dueOn: "2026-12-01", title: "다른 일" }]) expect((await app.inject({ method: "PATCH", url: `/v1/consultant/commitments/${commitment.id}`, payload })).statusCode, JSON.stringify(payload)).toBe(400);
    expect(commitments.update).toHaveBeenCalledTimes(2);
    commitments.update.mockRejectedValueOnce(new ConsultantInputError("오늘(2026-11-20)이나 그 뒤의 날짜로 정해 주세요."));
    expect((await app.inject({ method: "PATCH", url: `/v1/consultant/commitments/${commitment.id}`, payload: { dueOn: "2020-01-01" } })).statusCode).toBe(409);
    await app.close();
  });
  it("먼저 연락하기를 켜면 능동 제안도 함께 켜고, 끄면 함께 끈다. 제안을 켜지 못해도 약속 확인은 켠다", async () => {
    const on = setup();
    expect((await on.app.inject({ method: "PUT", url: "/v1/consultant/outreach", payload: { enabled: true } })).json()).toEqual({ data: { enabled: true, proposals: true } });
    expect(on.service.setOutreach).toHaveBeenLastCalledWith(user, true);
    expect((await on.app.inject({ method: "PUT", url: "/v1/consultant/outreach", payload: { enabled: false } })).json()).toEqual({ data: { enabled: false, proposals: false } });
    expect(on.proposals!.disable).toHaveBeenCalledWith(user);
    expect((await on.app.inject({ method: "PUT", url: "/v1/consultant/outreach", payload: { enabled: "yes" } })).statusCode).toBe(400);
    await on.app.close();
    const refused = setup({ proposals: "refused" });
    expect((await refused.app.inject({ method: "PUT", url: "/v1/consultant/outreach", payload: { enabled: true } })).json()).toEqual({ data: { enabled: true, proposals: false } });
    expect(refused.service.setOutreach).toHaveBeenCalledWith(user, true);
    await refused.app.close();
    // 제안을 이미 켠 사용자에게 약속 확인만 물었을 때는 제안을 건드리지 않는다.
    const alone = setup();
    expect((await alone.app.inject({ method: "PUT", url: "/v1/consultant/outreach", payload: { enabled: false, proposals: false } })).json()).toEqual({ data: { enabled: false, proposals: false } });
    expect(alone.proposals!.disable).not.toHaveBeenCalled();
    expect(alone.service.setOutreach).toHaveBeenCalledWith(user, false);
    await alone.app.close();
    const none = setup({ proposals: "none" });
    expect((await none.app.inject({ method: "PUT", url: "/v1/consultant/outreach", payload: { enabled: true } })).json()).toEqual({ data: { enabled: true, proposals: false } });
    await none.app.close();
  });
  it("대화가 없어 건넨 연락은 닫으면 사라진다", async () => {
    const { app, commitments } = setup();
    expect((await app.inject({ method: "POST", url: "/v1/consultant/quiet/dismiss" })).statusCode).toBe(200);
    expect(commitments.dismissQuiet).toHaveBeenCalledWith(user);
    await app.close();
  });
});
