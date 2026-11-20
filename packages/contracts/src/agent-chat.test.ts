import { describe, expect, it } from "vitest";
import { AgentChoiceInputSchema, AgentChoicePartSchema, AgentToolResultSchema, AgentMessageSchema, AgentPageElementEditInputSchema, SendAgentMessageSchema, UpdateTaskProgressSchema, PlanProposalInputSchema, PreparationTaskSchema, GapReviewDraftSchema, GapReviewSchema, AgentRecordDraftDecisionSchema, AgentRecordDraftInputSchema, RequirementReviewDraftSchema } from "./agent-chat.js";

const jobPostingId = "00000000-0000-4000-8000-000000000001";
const recordId = "00000000-0000-4000-8000-000000000002";
const item = (assessment: "strong" | "partial" | "unconfirmed", evidence: { recordId: string; quote: string }[]) => ({
  requirement: "Kafka 기반 스트리밍 경험", jobQuote: "Kafka 기반 실시간 파이프라인", kind: "must" as const,
  assessment, explanation: "설명", recommendation: "", evidence,
});

describe("요건 대조 초안", () => {
  it("강함 · 일부는 근거가 있어야 하고 미확인은 근거가 없어야 한다", () => {
    const quote = [{ recordId, quote: "Kafka로 주문 이벤트를 집계" }];
    expect(RequirementReviewDraftSchema.safeParse({ jobPostingId, summary: "요약", items: [item("strong", quote), item("unconfirmed", [])] }).success).toBe(true);
    expect(RequirementReviewDraftSchema.safeParse({ jobPostingId, summary: "요약", items: [item("partial", [])] }).success).toBe(false);
    expect(RequirementReviewDraftSchema.safeParse({ jobPostingId, summary: "요약", items: [item("unconfirmed", quote)] }).success).toBe(false);
  });
  it("요건은 1개 이상 12개 이하다", () => {
    expect(RequirementReviewDraftSchema.safeParse({ jobPostingId, summary: "요약", items: [] }).success).toBe(false);
    expect(RequirementReviewDraftSchema.safeParse({ jobPostingId, summary: "요약", items: Array.from({ length: 13 }, () => item("unconfirmed", [])) }).success).toBe(false);
  });
});

describe("새 기록 초안", () => {
  it("출처 발언이 1개 이상 있어야 한다", () => {
    const base = { title: "EKS 위 Airflow 운영", bodyMd: "## 상황\n인턴", sources: [{ messageId: recordId, quote: "EKS 위에 Airflow" }] };
    expect(AgentRecordDraftInputSchema.safeParse(base).success).toBe(true);
    expect(AgentRecordDraftInputSchema.safeParse({ ...base, sources: [] }).success).toBe(false);
  });
  it("승인에는 제목 · 본문 · 카테고리가 필요하고 거절에는 없다", () => {
    expect(AgentRecordDraftDecisionSchema.safeParse({ action: "approve", title: "제목", bodyMd: "본문" }).success).toBe(false);
    expect(AgentRecordDraftDecisionSchema.safeParse({ action: "approve", title: "제목", bodyMd: "본문", categoryId: recordId }).success).toBe(true);
    expect(AgentRecordDraftDecisionSchema.safeParse({ action: "reject" }).success).toBe(true);
  });
});

describe("보완점 정리", () => {
  it("요건 번호는 대조의 요건 수(최대 12) 안이다", () => {
    const item = { requirementIndex: 0, type: "skill" as const, status: "needs_confirmation" as const, priority: "high" as const, explanation: "설명", suggestedAction: "확인", evidence: [] };
    expect(GapReviewDraftSchema.safeParse({ summary: "요약", items: [item] }).success).toBe(true);
    expect(GapReviewDraftSchema.safeParse({ summary: "요약", items: [{ ...item, requirementIndex: 12 }] }).success).toBe(false);
  });
  it("근거 기록 스냅샷이 없는 예전 보완점도 읽는다", () => {
    const gap = { jobPostingId: recordId, summary: "요약", createdAt: "2026-10-15T00:00:00.000Z", items: [{ id: recordId, requirementIndex: 0, requirement: "요건", jobQuote: "인용", type: "skill", status: "needs_confirmation", priority: "high", explanation: "설명", suggestedAction: "확인", evidence: [] }] };
    expect(GapReviewSchema.safeParse(gap).success).toBe(true);
    expect(GapReviewSchema.safeParse({ ...gap, snapshot: { records: [{ recordId, textHash: "a".repeat(64) }] } }).success).toBe(true);
    expect(GapReviewSchema.safeParse({ ...gap, snapshot: { records: [{ recordId, textHash: "짧음" }] } }).success).toBe(false);
  });
});

describe("준비 계획", () => {
  const settings = { weeklyHours: 5, weeks: 4, startDate: "2026-10-19" };
  it("같은 보완점을 두 번 고를 수 없고, 기간은 12주까지다", () => {
    expect(PlanProposalInputSchema.safeParse({ title: "계획", summary: "요약", gapIndexes: [0, 1], settings }).success).toBe(true);
    expect(PlanProposalInputSchema.safeParse({ title: "계획", summary: "요약", gapIndexes: [0, 0], settings }).success).toBe(false);
    expect(PlanProposalInputSchema.safeParse({ title: "계획", summary: "요약", gapIndexes: [0], settings: { ...settings, weeks: 13 } }).success).toBe(false);
  });
  it("결과 링크는 http(s)만 받는다", () => {
    const task = { id: recordId, gapId: recordId, requirement: "요건", kind: "learn", week: 1, date: "2026-10-19", minutes: 60, title: "실습", action: "구현", deliverable: "예제", status: "completed", note: "", outcome: "", spentMinutes: 0, updatedAt: "2026-10-15T00:00:00.000Z" };
    expect(PreparationTaskSchema.safeParse({ ...task, outcomeUrl: "https://example.com/result" }).success).toBe(true);
    expect(PreparationTaskSchema.safeParse({ ...task, outcomeUrl: "javascript:alert(1)" }).success).toBe(false);
  });
});

describe("작업 진행 기록", () => {
  const base = { expectedVersion: 1, status: "completed" as const, note: "", outcome: "", outcomeUrl: "", spentMinutes: 30 };
  it("완료는 결과 설명이나 http(s) 링크가 있어야 한다", () => {
    expect(UpdateTaskProgressSchema.safeParse(base).success).toBe(false);
    expect(UpdateTaskProgressSchema.safeParse({ ...base, outcome: "예제 실행 확인" }).success).toBe(true);
    expect(UpdateTaskProgressSchema.safeParse({ ...base, outcomeUrl: "https://example.com/result" }).success).toBe(true);
    expect(UpdateTaskProgressSchema.safeParse({ ...base, outcomeUrl: "javascript:alert(1)" }).success).toBe(false);
  });
  it("진행 중에는 결과가 없어도 되고, 사용 시간은 음수가 될 수 없다", () => {
    expect(UpdateTaskProgressSchema.safeParse({ ...base, status: "in_progress" }).success).toBe(true);
    expect(UpdateTaskProgressSchema.safeParse({ ...base, status: "in_progress", spentMinutes: -1 }).success).toBe(false);
  });
});

describe("다듬기 화면의 요소 고침", () => {
  const selection = { portfolioId: jobPostingId, key: "section-a", label: "작업 목차" };
  it("보내는 말과 저장한 말에 고른 요소를 싣고, 요소 키 모양을 검사한다", () => {
    expect(SendAgentMessageSchema.parse({ requestId: recordId, text: "더 짧게", selection }).selection).toEqual(selection);
    expect(SendAgentMessageSchema.safeParse({ requestId: recordId, text: "더 짧게", selection: { ...selection, key: "bad.key" } }).success).toBe(false);
    expect(AgentMessageSchema.safeParse({ id: recordId, role: "user", text: "더 짧게", tools: [], selection, createdAt: "2026-11-10T00:00:00.000Z" }).success).toBe(true);
  });
  it("고침 입력은 모양만 검사하고 선택지는 서버가 본다", () => {
    expect(AgentPageElementEditInputSchema.safeParse({ portfolioId: jobPostingId, key: "section-a", note: "줄였습니다.", props: [{ name: "scale", value: "아무 값" }] }).success).toBe(true);
    expect(AgentPageElementEditInputSchema.safeParse({ portfolioId: jobPostingId, key: "section-a", note: "" }).success).toBe(false);
  });
});

describe("대화 속 화면의 부품", () => {
  const partId = "00000000-0000-4000-8000-000000000010";
  const messageId = "00000000-0000-4000-8000-000000000011";
  const options = (count: number) => Array.from({ length: count }, (_, index) => ({ id: `o${index + 1}`, label: `선택지 ${index + 1}` }));
  const part = (count = 2) => ({ kind: "choice" as const, partId, prompt: "주당 몇 시간을 쓸 수 있나요?", multiple: false, options: options(count), answer: null });
  it("선택지는 2개 이상 8개 이하다", () => {
    expect(AgentChoicePartSchema.safeParse(part(2)).success).toBe(true);
    expect(AgentChoicePartSchema.safeParse(part(8)).success).toBe(true);
    expect(AgentChoicePartSchema.safeParse(part(1)).success).toBe(false);
    expect(AgentChoicePartSchema.safeParse(part(9)).success).toBe(false);
    expect(AgentChoiceInputSchema.safeParse({ prompt: "질문", multiple: false, options: [{ label: "하나" }] }).success).toBe(false);
  });
  it("도구 결과는 부품을 싣고, 답한 부품은 고른 선택지와 답한 메시지를 적는다", () => {
    const tool = { id: "t1", name: "선택지 질문", status: "complete" as const, summary: "질문" };
    expect(AgentToolResultSchema.safeParse({ ...tool, ui: part() }).success).toBe(true);
    expect(AgentToolResultSchema.safeParse({ ...tool, ui: { ...part(), answer: { optionIds: ["o1"], messageId } } }).success).toBe(true);
    expect(AgentToolResultSchema.safeParse({ ...tool, ui: { ...part(), kind: "unknown" } }).success).toBe(false);
  });
  it("부품에 답할 때는 글이 없어도 보낼 수 있고, 글도 답도 없으면 보낼 수 없다", () => {
    const requestId = messageId;
    expect(SendAgentMessageSchema.safeParse({ requestId, reply: { partId, optionIds: ["o1"] } }).success).toBe(true);
    expect(SendAgentMessageSchema.parse({ requestId, reply: { partId, optionIds: ["o1"] } }).text).toBe("");
    expect(SendAgentMessageSchema.safeParse({ requestId, text: "안녕하세요" }).success).toBe(true);
    expect(SendAgentMessageSchema.safeParse({ requestId }).success).toBe(false);
    expect(SendAgentMessageSchema.safeParse({ requestId, text: "   " }).success).toBe(false);
    expect(SendAgentMessageSchema.safeParse({ requestId, reply: { partId, optionIds: [] } }).success).toBe(false);
  });
  it("저장된 사용자 메시지는 부품에 한 답을 싣는다", () => {
    expect(AgentMessageSchema.safeParse({ id: messageId, role: "user", text: "선택지 1", tools: [], reply: { partId, optionIds: ["o1"] }, createdAt: "2026-11-20T00:00:00.000Z" }).success).toBe(true);
  });
});
