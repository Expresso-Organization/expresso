import { describe, expect, it } from "vitest";

import { partialSink } from "./claude-code.js";

/**
 * JSONL 한 줄에서 무엇을 골라내는가.
 *
 * 여기 쓰는 줄들은 **실제로 관찰된 모양 그대로**다(2026-08-14, claude-code
 * 2.1.228). 지어낸 모양으로 재면 CLI가 조금만 달라져도 테스트만 통과한다.
 *
 * 이 파싱이 조용히 틀어지면 화면은 그냥 아무것도 안 보여 준다 — 실제로 한 번
 * 그랬고, 그때 서버 로그에는 아무 흔적이 없었다.
 */
const line = (event: unknown) => JSON.stringify({ type: "stream_event", event });

/**
 * 생각은 **분량으로만** 온다.
 *
 * 2026-08-14 실측(sonnet): `thinking_delta` 35개가 전부 `thinking: ""`였고,
 * 쌓인 분량은 이 `system` 이벤트로 따로 왔다. 그래서 화면에 보여 줄 글은 없고,
 * 「구상하는 중」과 「멈춤」을 가르는 신호만 있다.
 */
const tokens = (estimated: number) => JSON.stringify({
  type: "system", subtype: "thinking_tokens",
  estimated_tokens: estimated, estimated_tokens_delta: estimated,
});
/** 내용이 빈 채로 오는 그 줄. 여기에 기대면 아무것도 못 받는다. */
const EMPTY_THINKING = JSON.stringify({
  type: "stream_event",
  event: {
    type: "content_block_delta", index: 0,
    delta: { type: "thinking_delta", thinking: "", estimated_tokens: 50 },
  },
});
const OUT_START = line({
  type: "content_block_start",
  index: 1,
  content_block: { type: "tool_use", id: "toolu_x", name: "StructuredOutput", input: {} },
});
const out = (text: string) => line({
  type: "content_block_delta",
  index: 1,
  delta: { type: "input_json_delta", partial_json: text },
});

function collect(lines: string[]) {
  const thoughts: number[] = [];
  const partials: string[] = [];
  const sink = partialSink({
    onThinking: (tokens) => thoughts.push(tokens),
    onPartial: (text) => partials.push(text),
  });
  for (const item of lines) sink(item);
  return { thoughts, partials };
}

describe("claude-code 조각 고르기", () => {
  it("생각 분량과 결과 조각을 각자 제 자리로 보낸다", () => {
    const { thoughts, partials } = collect([
      tokens(50), EMPTY_THINKING, tokens(120),
      OUT_START, out('{"html":"<p>'), out('안녕</p>"}'),
    ]);
    expect(thoughts).toEqual([50, 120]);
    expect(partials.join("")).toBe('{"html":"<p>안녕</p>"}');
  });

  it("우리 것이 아닌 도구의 조각은 안 받는다", () => {
    const { partials } = collect([
      line({
        type: "content_block_start", index: 0,
        content_block: { type: "tool_use", id: "t", name: "Write", input: {} },
      }),
      line({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"file_path"' } }),
    ]);
    expect(partials).toEqual([]);
  });

  it("결과 블록이 닫히면 그 번호의 조각을 더 안 받는다", () => {
    // 번호는 메시지마다 0부터 다시 매겨진다. 닫고 놓지 않으면 남의 조각을 담는다.
    const { partials } = collect([
      OUT_START, out('{"a":1}'), line({ type: "content_block_stop", index: 1 }),
      line({ type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: "쓰레기" } }),
    ]);
    expect(partials.join("")).toBe('{"a":1}');
  });

  it("JSON이 아닌 줄과 모르는 이벤트는 지나간다", () => {
    const { thoughts, partials } = collect(["경고: 무언가", "", '{"type":"system","subtype":"init"}']);
    expect(thoughts).toEqual([]);
    expect(partials).toEqual([]);
  });
});
