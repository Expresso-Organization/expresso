import { describe, expect, it } from "vitest";
import { AgentMemoryUpdateInputSchema, ConsultantMemorySchema, ConversationDigestSchema, SetConsultantStageSchema } from "./consultant.js";

const id = "00000000-0000-4000-8000-000000000001";
const at = "2026-11-20T00:00:00.000Z";

describe("컨설턴트의 기억", () => {
  it("아직 아무것도 모르는 사용자의 기억은 단계가 없고 조건과 대화가 비어 있다", () => {
    expect(ConsultantMemorySchema.safeParse({ stage: null, stageSource: null, stageUpdatedAt: null, preferences: [], recentConversations: [] }).success).toBe(true);
  });
  it("단계는 탐색 · 준비 · 지원 가운데 하나다", () => {
    expect(SetConsultantStageSchema.safeParse({ stage: "preparing" }).success).toBe(true);
    expect(SetConsultantStageSchema.safeParse({ stage: "hired" }).success).toBe(false);
  });
  it("조건은 30개까지, 최근 대화의 요지는 다섯 개까지다", () => {
    const preference = { id, kind: "avoid" as const, text: "야근이 잦은 곳", source: "chat" as const, createdAt: at };
    const digest = { conversationId: id, title: "준비 계획", updatedAt: at, said: ["계획을 세워 줘"], outcomes: [], lastAnswer: "" };
    const memory = (preferences: number, conversations: number) => ({ stage: "preparing", stageSource: "agent", stageUpdatedAt: at, preferences: Array.from({ length: preferences }, () => preference), recentConversations: Array.from({ length: conversations }, () => digest) });
    expect(ConsultantMemorySchema.safeParse(memory(30, 5)).success).toBe(true);
    expect(ConsultantMemorySchema.safeParse(memory(31, 5)).success).toBe(false);
    expect(ConsultantMemorySchema.safeParse(memory(1, 6)).success).toBe(false);
    expect(ConversationDigestSchema.safeParse({ ...digest, said: ["a", "b", "c", "d"] }).success).toBe(false);
  });
  it("도구 입력의 조건 글은 200자까지다", () => {
    expect(AgentMemoryUpdateInputSchema.safeParse({ stage: "applying" }).success).toBe(true);
    expect(AgentMemoryUpdateInputSchema.safeParse({ remember: [{ kind: "prefer", text: "재택이 되는 곳" }], forget: [id] }).success).toBe(true);
    expect(AgentMemoryUpdateInputSchema.safeParse({ remember: [{ kind: "prefer", text: "가".repeat(201) }] }).success).toBe(false);
  });
});
