// @vitest-environment jsdom
import { beforeEach, expect, it } from "vitest";

import { putAgentHandoff, takeAgentHandoff } from "./agent-handoff";

const JOB = { kind: "job" as const, id: "0b0e4a0e-6f39-4d5e-9c1a-0d6f3a1b2c3d" };

beforeEach(() => sessionStorage.clear());

it("넘긴 말과 자료를 한 번 꺼내 쓰면 지워진다", () => {
  putAgentHandoff({ text: "요건을 비교해 줘", contexts: [JOB] });
  expect(takeAgentHandoff()).toEqual({ text: "요건을 비교해 줘", contexts: [JOB] });
  expect(takeAgentHandoff()).toBeNull();
});

it("넘긴 것이 없으면 null이다", () => {
  expect(takeAgentHandoff()).toBeNull();
});

it("자료 모양이 틀리면 말만 넘긴다", () => {
  sessionStorage.setItem("ex-agent-handoff", JSON.stringify({ text: "안녕", contexts: [{ kind: "file", id: "x" }] }));
  expect(takeAgentHandoff()).toEqual({ text: "안녕", contexts: [] });
});

it("말이 비어 있거나 읽을 수 없는 값이면 버린다", () => {
  sessionStorage.setItem("ex-agent-handoff", JSON.stringify({ text: "  ", contexts: [] }));
  expect(takeAgentHandoff()).toBeNull();
  sessionStorage.setItem("ex-agent-handoff", "{깨진 값");
  expect(takeAgentHandoff()).toBeNull();
});
