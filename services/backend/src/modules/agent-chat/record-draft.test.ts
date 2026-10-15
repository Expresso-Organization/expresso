import { describe, expect, it } from "vitest";
import type { AgentMessage } from "@expresso/contracts";
import { buildDraft, draftIssues } from "./record-draft.js";

const userMessage = "00000000-0000-4000-8000-000000000001";
const answer = "00000000-0000-4000-8000-000000000002";
const category = "00000000-0000-4000-8000-000000000003";
const at = "2026-10-15T00:00:00.000Z";
const messages: AgentMessage[] = [
  { id: userMessage, role: "user", text: "인턴 때 EKS 위에\nAirflow를 올려서 운영해 봤어요.", tools: [], createdAt: at },
  { id: answer, role: "assistant", text: "어떤 결과가 있었나요?", tools: [], createdAt: at },
];
const input = (sources: { messageId: string; quote: string }[], categoryId?: string) => ({ title: "EKS 위 Airflow 운영", bodyMd: "## 행동\nAirflow 운영", sources, ...(categoryId ? { categoryId } : {}) });

describe("새 기록 초안 출처", () => {
  it("사용자 메시지 안의 인용은 공백 차이를 무시하고 받는다", () => {
    expect(draftIssues(input([{ messageId: userMessage, quote: "EKS 위에 Airflow를 올려서" }]), messages, new Set())).toEqual([]);
  });
  it("에이전트의 말이나 없는 인용 · 남의 카테고리는 출처가 될 수 없다", () => {
    const issues = draftIssues(input([{ messageId: answer, quote: "어떤 결과" }, { messageId: userMessage, quote: "Kubernetes 클러스터를 설계" }], category), messages, new Set());
    expect(issues).toHaveLength(3);
    expect(issues[0]).toContain("사용자 메시지가 아닙니다");
    expect(issues[1]).toContain("그 메시지에 없습니다");
    expect(issues[2]).toContain("카테고리");
  });
  it("저장형은 처리 전 상태와 카드의 카테고리 선택지를 담는다", () => {
    const draft = buildDraft(input([{ messageId: userMessage, quote: "Airflow" }]), "00000000-0000-4000-8000-000000000004", [{ id: category, name: "경험" }]);
    expect(draft).toMatchObject({ status: "ready", recordId: null, categoryId: null, categories: [{ id: category, name: "경험" }] });
  });
});
