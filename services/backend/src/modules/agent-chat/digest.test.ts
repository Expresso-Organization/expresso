import { describe, expect, it } from "vitest";
import type { AgentMessage, AgentToolResult } from "@expresso/contracts";
import { digestConversation } from "./digest.js";

const at = "2026-11-19T10:00:00.000Z";
let n = 0;
const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
const user = (text: string, extra: Partial<AgentMessage> = {}): AgentMessage => ({ id: id(), role: "user", text, tools: [], createdAt: at, ...extra });
const assistant = (text: string, tools: AgentToolResult[] = []): AgentMessage => ({ id: id(), role: "assistant", text, tools, createdAt: at });
const tool = (name: string, detail: Partial<AgentToolResult> = {}, status: AgentToolResult["status"] = "complete"): AgentToolResult => ({ id: id(), name, status, summary: "요약", ...detail });
const conversation = (messages: AgentMessage[]) => ({ id: id(), title: "준비 계획을 세우고 싶어요", updatedAt: at, messages });
const settings = { weeklyHours: 10, weeks: 8, startDate: "2026-11-23" };

describe("지난 대화의 요지", () => {
  it("사용자가 한 말은 처음 두 마디와 마지막 한 마디를 싣고, 선택지로 한 답은 결과 줄에만 남긴다", () => {
    const partId = id(); const answerId = id();
    const ui = { kind: "choice" as const, partId, prompt: "주당 몇 시간을 쓸 수 있나요?", multiple: false, options: [{ id: "o1", label: "5시간" }, { id: "o2", label: "10시간" }], answer: { optionIds: ["o2"], messageId: answerId } };
    const digest = digestConversation(conversation([
      user("준비 계획을 세우고 싶어요"), assistant("시간을 정하겠습니다.", [tool("선택지 질문", { ui })]),
      user("10시간", { id: answerId, reply: { partId, optionIds: ["o2"] } }), assistant("알겠습니다."),
      user("기간은 8주로 할게요"), assistant("8주로 잡겠습니다."), user("시작은 다음 주 월요일이요"), assistant("11월 23일부터 시작하는 계획을 만들었습니다."),
    ]));
    expect(digest.said).toEqual(["준비 계획을 세우고 싶어요", "기간은 8주로 할게요", "시작은 다음 주 월요일이요"]);
    expect(digest.outcomes).toEqual(["주당 몇 시간을 쓸 수 있나요? → 10시간"]);
    expect(digest.lastAnswer).toBe("11월 23일부터 시작하는 계획을 만들었습니다.");
    expect(digest.title).toBe("준비 계획을 세우고 싶어요");
  });
  it("승인한 것만 결과로 남긴다 — 저장한 기록, 바꾼 목표, 승인한 계획, 되돌리지 않은 지면 고침", () => {
    const draft = { draftId: id(), categoryId: null, bodyMd: "본문", sources: [], categories: [] };
    const goal = { draftId: id(), work: "백엔드 개발", place: null, timing: null, previous: null };
    const plan = { draftId: id(), jobPostingId: id(), title: "백엔드 준비", summary: "요약", settings, tasks: [] };
    const edit = { editId: id(), portfolioId: id(), key: "hero", label: "첫 화면 제목", note: "줄였습니다", changes: [], revision: 2 };
    const outcomes = digestConversation(conversation([user("정리해 줘"), assistant("정리했습니다.", [
      tool("새 기록 초안", { recordDraft: { ...draft, title: "EKS 위 Airflow 운영", status: "approved", recordId: id() } }),
      tool("새 기록 초안", { recordDraft: { ...draft, title: "거절한 초안", status: "rejected", recordId: null } }),
      tool("새 기록 초안", { recordDraft: { ...draft, title: "아직 보지 않은 초안", status: "ready", recordId: null } }),
      tool("구직 목표 변경", { goalDraft: { ...goal, status: "approved" } }),
      tool("구직 목표 변경", { goalDraft: { ...goal, work: "데이터 엔지니어", status: "rejected" } }),
      tool("준비 계획 초안", { planDraft: { ...plan, status: "approved", planId: id() } as AgentToolResult["planDraft"] }),
      tool("지면 요소 고침", { pageEdit: { ...edit, undone: false } }),
      tool("지면 요소 고침", { pageEdit: { ...edit, label: "되돌린 고침", undone: true } }),
      tool("요건 대조", {}, "failed"),
    ])])).outcomes;
    expect(outcomes).toEqual([
      "커리어 기록 저장: EKS 위 Airflow 운영",
      "구직 목표 변경: 하고 싶은 일 → 백엔드 개발",
      "준비 계획 승인: 백엔드 준비 (주 10시간 · 8주)",
      "포트폴리오 지면 고침: 첫 화면 제목",
    ]);
  });
  it("잡은 약속은 제목과 날짜로 남긴다", () => {
    const commitment = { id: id(), title: "해커톤 지원서 내기", detail: "", dueOn: "2026-11-27", status: "open" as const, awaiting: false, conversationId: null, createdAt: at };
    const digest = digestConversation(conversation([user("해커톤에 나가 볼게요"), assistant("금요일까지 지원서를 내기로 했습니다.", [tool("약속", { commitment }), tool("약속 갱신")])]));
    expect(digest.outcomes).toEqual(["약속: 해커톤 지원서 내기 (2026-11-27까지)"]);
  });
  it("목표 진단은 표본과 상태별 수로 남긴다. 수는 진단 카드와 같다 — 일부는 따로 세고 경력 연차는 세지 않는다", () => {
    const item = (label: string, status: "confirmed" | "partial" | "unconfirmed" | "gap", kind: "technology" | "career" = "technology") => ({ id: `${kind}:${label}`, kind, label, count: 10, status, evidence: [], note: "" });
    const diagnosis = { work: "백엔드 개발자", family: "백엔드", basis: "family" as const, focus: null, level: null, sampleSize: 66, companyCount: 15, interestedCount: 0, small: false, summary: "요약", items: [item("Java", "confirmed"), item("Spring", "partial"), item("Kafka", "unconfirmed"), item("경력 5~7년 이상", "unconfirmed", "career"), item("Kubernetes", "gap")], demandAt: at, assessedAt: at, stale: null };
    const digest = digestConversation(conversation([user("제 목표에 비해 뭐가 부족한가요?"), assistant("진단했습니다.", [tool("목표 요건 집계"), tool("목표 진단", { diagnosis })])]));
    expect(digest.outcomes).toEqual(["목표 진단: 공고 66건 기준 · 확인 1 · 일부 1 · 미확인 1 · 부족 1"]);
  });
  it("긴 말은 자르고, 결과는 최근 여덟 개만 싣는다", () => {
    const many = Array.from({ length: 10 }, (_, index) => tool("지면 요소 고침", { pageEdit: { editId: id(), portfolioId: id(), key: "hero", label: `고침 ${index + 1}`, note: "", changes: [], revision: index + 1, undone: false } }));
    const digest = digestConversation(conversation([user("가".repeat(500)), assistant("나".repeat(500), many)]));
    expect(digest.said[0]).toHaveLength(200);
    expect(digest.lastAnswer).toHaveLength(300);
    expect(digest.outcomes).toHaveLength(8);
    expect(digest.outcomes[0]).toBe("포트폴리오 지면 고침: 고침 3");
  });
});
