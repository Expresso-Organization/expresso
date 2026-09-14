import { describe, expect, it, vi } from "vitest";
const sdk = vi.hoisted(() => ({ query: vi.fn(), tool: vi.fn((name, description, schema, handler) => ({ name, description, schema, handler })), createSdkMcpServer: vi.fn(input => input) }));
vi.mock("@anthropic-ai/claude-agent-sdk", () => sdk);
import { ClaudeAgentRuntime, type AgentEvent } from "./runtime.js";
describe("Claude 채팅 실행 어댑터", () => {
  it("제품 도구만 노출하고 부분 텍스트만 한 번 전달한다", async () => {
    const events: AgentEvent[] = [];
    sdk.query.mockReturnValue((async function* () {
      yield { type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "안녕하세요" } } };
      yield { type: "assistant", message: { content: [{ type: "text", text: "안녕하세요" }] } };
      yield { type: "result", is_error: false };
    })());
    await new ClaudeAgentRuntime().run({ messages: [], context: [], signal: new AbortController().signal, emit: async event => { events.push(event); }, propose: vi.fn() });
    expect(events).toEqual([{ type: "text", text: "안녕하세요" }]);
    expect(sdk.query.mock.lastCall![0].options).toMatchObject({ tools: [], settingSources: [], strictMcpConfig: true, persistSession: false, permissionMode: "dontAsk" });
    expect(sdk.query.mock.lastCall![0].options.allowedTools).toEqual(["mcp__expresso__propose_record_edit"]);
  });
  it("중단 신호를 SDK에 전달한다", async () => {
    const controller = new AbortController(); let stopped = false;
    sdk.query.mockImplementation(({ options }) => (async function* () { controller.abort(); stopped = options.abortController.signal.aborted; yield { type: "result", is_error: false }; })());
    await expect(new ClaudeAgentRuntime().run({ messages: [], context: [], signal: controller.signal, emit: vi.fn(), propose: vi.fn() })).rejects.toThrow("cancelled");
    expect(stopped).toBe(true);
  });
});
