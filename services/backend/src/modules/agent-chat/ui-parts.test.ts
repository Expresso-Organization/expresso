import { describe, expect, it } from "vitest";
import type { AgentMessage } from "@expresso/contracts";
import { buildChoice, buildForm, checkReply, choiceIssues, formIssues } from "./ui-parts.js";

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
    expect(checkReply(messages, { partId, optionIds: ["o2"] })).toEqual({ ok: true, messageIndex: 1, toolIndex: 1, text: "10시간", answer: { optionIds: ["o2"] } });
  });
  it("여럿을 고르면 질문에 적힌 순서로 잇는다", () => {
    const multi = [messages[0]!, asking("00000000-0000-4000-8000-000000000002", true)];
    expect(checkReply(multi, { partId, optionIds: ["o3", "o1"] })).toMatchObject({ ok: true, text: "5시간, 15시간", answer: { optionIds: ["o1", "o3"] } });
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

describe("입력 칸 묶음", () => {
  const formInput = { prompt: "기간과 규모를 알려 주세요.", fields: [{ label: "기간", placeholder: "예: 3개월" }, { label: "팀 인원" }, { label: "처리량", optional: true }] };
  const asked = (answered = false): AgentMessage => ({
    id: "00000000-0000-4000-8000-000000000002", role: "assistant", text: "", createdAt: at,
    tools: [{ id: "t1", name: "입력 칸 질문", status: "complete", summary: formInput.prompt, ui: { ...buildForm(formInput, partId), answer: answered ? { values: [{ id: "f1", text: "3개월" }], messageId: "00000000-0000-4000-8000-000000000099" } : null } }],
  });
  const messages = [user("00000000-0000-4000-8000-000000000001"), asked()];
  it("칸에 순서대로 id를 붙이고, 적지 않은 optional은 필수로 본다", () => {
    const part = buildForm(formInput, partId);
    expect(part.fields).toEqual([{ id: "f1", label: "기간", placeholder: "예: 3개월", optional: false }, { id: "f2", label: "팀 인원", optional: false }, { id: "f3", label: "처리량", optional: true }]);
    expect(part.answer).toBeNull();
  });
  it("이름이 같은 칸과, 모든 칸이 선택인 묶음은 어긋난 항목으로 돌려준다", () => {
    expect(formIssues(formInput)).toEqual([]);
    expect(formIssues({ prompt: "질문", fields: [{ label: "기간" }, { label: "기간" }] })[0]).toContain("2번 칸");
    expect(formIssues({ prompt: "질문", fields: [{ label: "기간", optional: true }] })[0]).toContain("optional");
  });
  it("필수 칸이 채워지면 지나가고, 남길 글은 칸 이름과 값을 줄마다 적은 것이다. 빈 선택 칸은 적지 않는다", () => {
    expect(checkReply(messages, { partId, values: [{ id: "f2", text: "4명" }, { id: "f1", text: " 3개월 " }, { id: "f3", text: "" }] })).toEqual({
      ok: true, messageIndex: 1, toolIndex: 0, text: "기간: 3개월\n팀 인원: 4명", answer: { values: [{ id: "f1", text: "3개월" }, { id: "f2", text: "4명" }] },
    });
  });
  it("빈 필수 칸, 없는 칸, 선택지로 한 답, 이미 답한 묶음은 받지 않는다", () => {
    expect(checkReply(messages, { partId, values: [{ id: "f1", text: "3개월" }] })).toEqual({ ok: false, message: "「팀 인원」 칸을 적어 주세요." });
    expect(checkReply(messages, { partId, values: [{ id: "f9", text: "값" }] }).ok).toBe(false);
    expect(checkReply(messages, { partId, optionIds: ["o1"] })).toEqual({ ok: false, message: "칸에 적어 답하는 질문입니다." });
    expect(checkReply([messages[0]!, asked(true)], { partId, values: [{ id: "f1", text: "3개월" }, { id: "f2", text: "4명" }] })).toEqual({ ok: false, message: "이미 답한 질문입니다." });
  });
  it("날짜 칸은 날짜 칸으로 내보내고, 날짜가 아닌 값은 받지 않는다", () => {
    const dated = { prompt: "언제까지 할까요?", fields: [{ label: "날짜", type: "date" as const }, { label: "메모", optional: true }] };
    const part = buildForm(dated, partId);
    expect(part.fields).toEqual([{ id: "f1", label: "날짜", optional: false, type: "date" }, { id: "f2", label: "메모", optional: true }]);
    const asking: AgentMessage[] = [user("00000000-0000-4000-8000-000000000001"), { id: "00000000-0000-4000-8000-000000000002", role: "assistant", text: "", createdAt: at, tools: [{ id: "t1", name: "입력 칸 질문", status: "complete", summary: dated.prompt, ui: part }] }];
    expect(checkReply(asking, { partId, values: [{ id: "f1", text: "2026-11-27" }] })).toMatchObject({ ok: true, text: "날짜: 2026-11-27" });
    for (const text of ["다음 주 금요일", "2026-13-01", "2026-02-30", "26-11-27"]) expect(checkReply(asking, { partId, values: [{ id: "f1", text }] }), text).toEqual({ ok: false, message: "「날짜」 칸에는 날짜를 골라 주세요." });
  });
  it("선택지 부품에 값으로 답하면 받지 않는다", () => {
    const choice = [user("00000000-0000-4000-8000-000000000001"), asking("00000000-0000-4000-8000-000000000002")];
    expect(checkReply(choice, { partId, values: [{ id: "f1", text: "값" }] })).toEqual({ ok: false, message: "선택지에서 골라 답하는 질문입니다." });
  });
});
