import { describe, expect, it } from "vitest";
import type { AgentMessage } from "@expresso/contracts";
import { buildChoice, checkReply, choiceIssues } from "./ui-parts.js";

const partId = "00000000-0000-4000-8000-000000000010";
const input = { prompt: "주당 몇 시간을 쓸 수 있나요?", multiple: false, options: [{ label: "5시간" }, { label: "10시간", description: "평일 저녁마다" }, { label: "15시간" }] };
const at = "2026-11-20T00:00:00.000Z";
const user = (id: string, text = "계획을 세워 줘"): AgentMessage => ({ id, role: "user", text, tools: [], createdAt: at });
const asking = (id: string, multiple = false, answered = false): AgentMessage => ({
  id, role: "assistant", text: "먼저 시간을 정하겠습니다.", createdAt: at,
  tools: [
    { id: "t0", name: "기록 목록 확인", status: "complete", summary: "기록 3개" },
    { id: "t1", name: "선택지 질문", status: "complete", summary: input.prompt, ui: { ...buildChoice({ ...input, multiple }, partId), answer: answered ? { optionIds: ["o1"], messageId: "00000000-0000-4000-8000-000000000099" } : null } },
  ],
});

describe("선택지 부품 만들기", () => {
  it("선택지에 순서대로 id를 붙이고 답은 비워 둔다", () => {
    const part = buildChoice(input, partId);
    expect(part.options.map(option => option.id)).toEqual(["o1", "o2", "o3"]);
    expect(part.options[1]).toEqual({ id: "o2", label: "10시간", description: "평일 저녁마다" });
    expect(part.options[0]).not.toHaveProperty("description");
    expect(part.answer).toBeNull();
  });
  it("글이 같은 선택지는 어긋난 항목으로 돌려준다", () => {
    expect(choiceIssues(input)).toEqual([]);
    const issues = choiceIssues({ ...input, options: [{ label: "5시간" }, { label: " 5시간 " }] });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("2번 선택지");
  });
});

describe("부품에 한 답 확인", () => {
  const messages = [user("00000000-0000-4000-8000-000000000001"), asking("00000000-0000-4000-8000-000000000002")];
  it("마지막 답변의 답 없는 부품이면 지나가고, 남길 글은 고른 선택지의 글이다", () => {
    expect(checkReply(messages, { partId, optionIds: ["o2"] })).toEqual({ ok: true, messageIndex: 1, toolIndex: 1, text: "10시간" });
  });
  it("여럿을 고르면 질문에 적힌 순서로 잇는다", () => {
    const multi = [messages[0]!, asking("00000000-0000-4000-8000-000000000002", true)];
    expect(checkReply(multi, { partId, optionIds: ["o3", "o1"] })).toMatchObject({ ok: true, text: "5시간, 15시간" });
  });
  it("지난 답변의 부품, 이미 답한 부품, 없는 선택지, 하나만 고르는 질문에 둘은 받지 않는다", () => {
    const later = [...messages, user("00000000-0000-4000-8000-000000000003", "다른 얘기"), { ...asking("00000000-0000-4000-8000-000000000004"), tools: [] }];
    expect(checkReply(later, { partId, optionIds: ["o1"] }).ok).toBe(false);
    expect(checkReply([messages[0]!, asking("00000000-0000-4000-8000-000000000002", false, true)], { partId, optionIds: ["o1"] })).toEqual({ ok: false, message: "이미 답한 질문입니다." });
    expect(checkReply(messages, { partId, optionIds: ["o9"] }).ok).toBe(false);
    expect(checkReply(messages, { partId, optionIds: ["o1", "o2"] }).ok).toBe(false);
    expect(checkReply(messages, { partId, optionIds: ["o1", "o1"] }).ok).toBe(false);
    expect(checkReply(messages, { partId: "00000000-0000-4000-8000-0000000000aa", optionIds: ["o1"] }).ok).toBe(false);
  });
});
