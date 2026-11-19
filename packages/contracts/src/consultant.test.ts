import { describe, expect, it } from "vitest";
import { AgentCommitmentInputSchema, AgentCommitmentUpdateInputSchema, AgentMemoryUpdateInputSchema, CommitmentCheckinAnswerSchema, ConsultantCheckinsSchema, ConsultantMemorySchema, ConversationDigestSchema, SetConsultantStageSchema, UpdateCommitmentSchema } from "./consultant.js";

const id = "00000000-0000-4000-8000-000000000001";
const at = "2026-11-20T00:00:00.000Z";

describe("컨설턴트의 기억", () => {
  it("아직 아무것도 모르는 사용자의 기억은 단계가 없고 조건과 대화가 비어 있다", () => {
    expect(ConsultantMemorySchema.safeParse({ stage: null, stageSource: null, stageUpdatedAt: null, preferences: [], outreach: null, commitments: [], recentConversations: [] }).success).toBe(true);
  });
  it("단계는 탐색 · 준비 · 지원 가운데 하나다", () => {
    expect(SetConsultantStageSchema.safeParse({ stage: "preparing" }).success).toBe(true);
    expect(SetConsultantStageSchema.safeParse({ stage: "hired" }).success).toBe(false);
  });
  it("조건은 30개까지, 최근 대화의 요지는 다섯 개까지다", () => {
    const preference = { id, kind: "avoid" as const, text: "야근이 잦은 곳", source: "chat" as const, createdAt: at };
    const digest = { conversationId: id, title: "준비 계획", updatedAt: at, said: ["계획을 세워 줘"], outcomes: [], lastAnswer: "" };
    const memory = (preferences: number, conversations: number) => ({ stage: "preparing", stageSource: "agent", stageUpdatedAt: at, preferences: Array.from({ length: preferences }, () => preference), outreach: true, commitments: [], recentConversations: Array.from({ length: conversations }, () => digest) });
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

describe("약속과 확인", () => {
  const commitment = { id, title: "해커톤 지원서 내기", detail: "", dueOn: "2026-11-27", status: "open" as const, awaiting: false, conversationId: id, createdAt: at };
  it("약속의 날짜는 날(YYYY-MM-DD)이다", () => {
    expect(AgentCommitmentInputSchema.safeParse({ title: "해커톤 지원서 내기", dueOn: "2026-11-27" }).success).toBe(true);
    expect(AgentCommitmentInputSchema.safeParse({ title: "해커톤 지원서 내기", dueOn: "다음 주 금요일" }).success).toBe(false);
    expect(AgentCommitmentInputSchema.safeParse({ title: "해커톤 지원서 내기", dueOn: "2026-11-27T09:00:00Z" }).success).toBe(false);
    expect(AgentCommitmentUpdateInputSchema.safeParse({ commitmentId: id, status: "done" }).success).toBe(true);
  });
  it("화면에서 고칠 때는 날짜나 거두기 가운데 하나가 있어야 한다", () => {
    expect(UpdateCommitmentSchema.safeParse({ dueOn: "2026-12-01" }).success).toBe(true);
    expect(UpdateCommitmentSchema.safeParse({ status: "dropped" }).success).toBe(true);
    expect(UpdateCommitmentSchema.safeParse({}).success).toBe(false);
  });
  it("확인의 답은 셋이고, 아직이라는 답에는 새 날짜가 따른다", () => {
    expect(CommitmentCheckinAnswerSchema.safeParse({ answer: "done" }).success).toBe(true);
    expect(CommitmentCheckinAnswerSchema.safeParse({ answer: "not_yet", dueOn: "2026-12-01" }).success).toBe(true);
    expect(CommitmentCheckinAnswerSchema.safeParse({ answer: "not_yet" }).success).toBe(false);
    expect(CommitmentCheckinAnswerSchema.safeParse({ answer: "dropped" }).success).toBe(true);
    expect(CommitmentCheckinAnswerSchema.safeParse({ answer: "later" }).success).toBe(false);
  });
  it("홈이 읽는 연락은 동의를 정했는지와 답을 기다리는 약속을 싣는다", () => {
    expect(ConsultantCheckinsSchema.safeParse({ outreach: null, today: "2026-11-20", commitments: [], quiet: false }).success).toBe(true);
    expect(ConsultantCheckinsSchema.safeParse({ outreach: true, today: "2026-11-20", commitments: [{ ...commitment, awaiting: true }], quiet: true }).success).toBe(true);
  });
});
