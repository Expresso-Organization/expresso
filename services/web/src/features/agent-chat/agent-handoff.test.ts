// @vitest-environment jsdom
import { beforeEach, expect, it } from "vitest";

import { peekAgentHandoff, putAgentHandoff, takeAgentHandoff } from "./agent-handoff";

const JOB = { kind: "job" as const, id: "0b0e4a0e-6f39-4d5e-9c1a-0d6f3a1b2c3d" };

beforeEach(() => { sessionStorage.clear(); takeAgentHandoff(); });

it("넘긴 말과 자료를 한 번 꺼내 쓰면 지워진다", () => {
  putAgentHandoff({ text: "요건을 비교해 줘", contexts: [JOB] });
  expect(takeAgentHandoff()).toEqual({ text: "요건을 비교해 줘", contexts: [JOB], deliver: true });
  expect(takeAgentHandoff()).toBeNull();
});

it("넘긴 것이 없으면 null이다", () => {
  expect(takeAgentHandoff()).toBeNull();
});

it("자료 모양이 틀리면 말만 넘긴다", () => {
  sessionStorage.setItem("ex-agent-handoff", JSON.stringify({ text: "안녕", contexts: [{ kind: "file", id: "x" }] }));
  expect(takeAgentHandoff()).toEqual({ text: "안녕", contexts: [], deliver: true });
});

it("말이 비어 있거나 읽을 수 없는 값이면 버린다", () => {
  sessionStorage.setItem("ex-agent-handoff", JSON.stringify({ text: "  ", contexts: [] }));
  expect(takeAgentHandoff()).toBeNull();
  sessionStorage.setItem("ex-agent-handoff", "{깨진 값");
  expect(takeAgentHandoff()).toBeNull();
});

it("대화 화면의 첫 렌더는 넘긴 말을 지우지 않고 본다", () => {
  putAgentHandoff({ text: "이번 주 할 일", contexts: [] });
  expect(peekAgentHandoff()).toEqual({ text: "이번 주 할 일", contexts: [] });
  expect(peekAgentHandoff()).not.toBeNull();
  takeAgentHandoff();
  expect(peekAgentHandoff()).toBeNull();
});

it("새로고침한 문서에는 볼 말이 없다 — 저장소에만 남은 말은 첫 렌더에 그리지 않는다", () => {
  sessionStorage.setItem("ex-agent-handoff", JSON.stringify({ text: "안녕", contexts: [] }));
  expect(peekAgentHandoff()).toBeNull();
  expect(takeAgentHandoff()?.text).toBe("안녕");
});

it("홈이 보낼 수 없다고 안 말은 그 표시를 함께 넘긴다", () => {
  putAgentHandoff({ text: "안녕", contexts: [], deliver: false });
  expect(takeAgentHandoff()).toEqual({ text: "안녕", contexts: [], deliver: false });
});
