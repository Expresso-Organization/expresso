import { describe, expect, it } from "vitest";
import type { DesignChat } from "@expresso/contracts";

import { threadOf, userText, workingLabel } from "./thread";

const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const stamp = "2026-11-19T00:00:00.000Z";
const tokens = { background: "#ffffff", text: "#111111", accent: "#d6336c", font: "sans" as const, density: "comfortable" as const };
const direction = { id: id(1), name: "측정판", words: "밝은 회색에 파랑", tokens, composition: "document" as const };
const base: DesignChat = {
  id: id(9), brewId: id(8), snippets: [], selectedSnippetId: null, version: 3, updatedAt: stamp,
  run: { id: id(7), requestId: id(7), status: "complete", error: null, startedAt: stamp },
  messages: [{ id: id(2), role: "assistant", text: "어떤 분위기로 보여 드릴까요?", status: "complete", card: { kind: "directions", directions: [direction] }, createdAt: stamp }],
};

describe("디자인 대화를 스레드 메시지로 옮기기", () => {
  it("카드는 도구 호출 한 건으로 싣고, 같은 ID로 카드를 찾게 한다", () => {
    const { messages, cards } = threadOf(base);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ id: id(2), role: "assistant", content: [{ type: "text", text: "어떤 분위기로 보여 드릴까요?" }, { type: "tool-call", toolCallId: id(2), toolName: "directions", result: {} }] });
    expect(cards[id(2)]).toEqual({ kind: "directions", directions: [direction] });
    expect(threadOf(null)).toEqual({ messages: [], cards: {}, users: {} });
  });

  it("카드를 눌러 한 일은 사용자의 말로 적고, 대상은 따로 찾을 수 있게 둔다", () => {
    const draw = { id: id(3), role: "user" as const, action: "draw" as const, text: "", subjects: [{ kind: "direction" as const, id: id(1), name: "측정판" }], createdAt: stamp };
    expect(userText(draw)).toBe("이 방향으로 첫 화면을 보여 주세요.");
    expect(userText({ ...draw, subjects: [draw.subjects[0]!, { ...draw.subjects[0]!, id: id(4) }] })).toBe("모두 첫 화면으로 보여 주세요.");
    expect(userText({ ...draw, action: "draw_catalog" })).toBe("이 디자인으로 첫 화면을 보여 주세요.");
    expect(userText({ ...draw, action: "say", text: "더 밝게" })).toBe("더 밝게");
    const { messages, users } = threadOf({ ...base, messages: [...base.messages, draw] });
    expect(messages[1]).toMatchObject({ role: "user", content: [{ type: "text", text: "이 방향으로 첫 화면을 보여 주세요." }] });
    expect(users[id(3)]?.subjects[0]?.name).toBe("측정판");
  });

  it("만드는 중인 답은 결과 없는 도구 호출이고, 무엇을 하는 중인지 적는다", () => {
    const running: DesignChat = { ...base, run: { ...base.run!, status: "running" }, messages: [{ id: id(2), role: "assistant", text: "", status: "running", card: null, createdAt: stamp }] };
    expect(threadOf(running).messages[0]).toMatchObject({ content: [] });
    expect(workingLabel(running)).toBe("자료를 읽는 중");
    const drawing: DesignChat = {
      ...running,
      messages: [...base.messages, { id: id(3), role: "user", action: "draw", text: "", subjects: [], createdAt: stamp }, { id: id(4), role: "assistant", text: "", status: "running", card: { kind: "screens", items: [{ id: id(5), name: "측정판", words: "", tokens, composition: "document", status: "drawing", snippetId: null }] }, createdAt: stamp }],
    };
    expect(workingLabel(drawing)).toBe("첫 화면을 그리는 중");
    expect(threadOf(drawing).messages[2]).toMatchObject({ content: [{ type: "tool-call", toolCallId: id(4), toolName: "screens" }] });
    expect(threadOf(drawing).messages[2]!.content[0]).not.toHaveProperty("result");
    const replying: DesignChat = { ...drawing, messages: [...drawing.messages.slice(0, 2), { id: id(4), role: "assistant", text: "", status: "running", card: null, createdAt: stamp }] };
    expect(workingLabel(replying)).toBe("답을 쓰는 중");
    expect(workingLabel(base)).toBeNull();
  });

  it("카드 없이 실패한 답에는 다시 시도할 수 있는 카드를 둔다", () => {
    const failed: DesignChat = { ...base, run: { ...base.run!, status: "interrupted", error: "답을 만드는 중에 연결이 끊겼습니다. 다시 시도해 주세요." }, messages: [{ id: id(2), role: "assistant", text: "", status: "failed", card: null, createdAt: stamp }] };
    expect(threadOf(failed).cards[id(2)]).toEqual({ kind: "failed", error: "답을 만드는 중에 연결이 끊겼습니다. 다시 시도해 주세요." });
    // 카드가 있는 답의 실패는 카드가 장마다 보인다.
    const partial: DesignChat = { ...base, messages: [{ id: id(2), role: "assistant", text: "", status: "failed", card: { kind: "screens", items: [{ id: id(5), name: "측정판", words: "", tokens, composition: "document", status: "failed", snippetId: null }] }, createdAt: stamp }] };
    expect(threadOf(partial).cards[id(2)]).toMatchObject({ kind: "screens" });
  });
});
