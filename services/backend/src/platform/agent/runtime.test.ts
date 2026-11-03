import { describe, expect, it, vi } from "vitest";
const sdk = vi.hoisted(() => ({ query: vi.fn(), tool: vi.fn((name, description, schema, handler) => ({ name, description, schema, handler })), createSdkMcpServer: vi.fn(input => input) }));
vi.mock("@anthropic-ai/claude-agent-sdk", () => sdk);
import type { AiUsageEvent } from "../ai/usage-sink.js";
import { AgentToolRejection, ClaudeAgentRuntime, conversationForModel, type AgentEvent } from "./runtime.js";
const base = () => ({ userId: "00000000-0000-4000-8000-0000000000aa", records: { list: vi.fn(async () => ({ categories: [], records: [] })), read: vi.fn(async () => []) }, review: vi.fn(), draftRecord: vi.fn(), gapReview: vi.fn(), planDraft: vi.fn(), replanDraft: vi.fn(), readPlan: vi.fn(), propose: vi.fn() });
describe("Claude 채팅 실행 어댑터", () => {
  it("제품 도구만 노출하고 부분 텍스트만 한 번 전달한다", async () => {
    const events: AgentEvent[] = [];
    sdk.query.mockReturnValue((async function* () {
      yield { type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "안녕하세요" } } };
      yield { type: "assistant", message: { content: [{ type: "text", text: "안녕하세요" }] } };
      yield { type: "result", is_error: false };
    })());
    await new ClaudeAgentRuntime().run({ messages: [], context: [], signal: new AbortController().signal, emit: async event => { events.push(event); }, ...base() });
    expect(events).toEqual([{ type: "text", text: "안녕하세요" }]);
    expect(sdk.query.mock.lastCall![0].options).toMatchObject({ tools: [], settingSources: [], strictMcpConfig: true, persistSession: false, permissionMode: "dontAsk" });
    expect(sdk.query.mock.lastCall![0].options.allowedTools).toEqual(["mcp__expresso__propose_record_edit", "mcp__expresso__list_career_records", "mcp__expresso__read_career_records", "mcp__expresso__record_requirement_review", "mcp__expresso__propose_new_record", "mcp__expresso__record_gap_review", "mcp__expresso__propose_preparation_plan", "mcp__expresso__read_preparation_plan", "mcp__expresso__propose_replan"]);
  });
  it("중단 신호를 SDK에 전달한다", async () => {
    const controller = new AbortController(); let stopped = false;
    sdk.query.mockImplementation(({ options }) => (async function* () { controller.abort(); stopped = options.abortController.signal.aborted; yield { type: "result", is_error: false }; })());
    await expect(new ClaudeAgentRuntime().run({ messages: [], context: [], signal: controller.signal, emit: vi.fn(), ...base() })).rejects.toThrow("cancelled");
    expect(stopped).toBe(true);
  });
  it("개인 키는 서버 인증 환경과 분리하고 모델은 Sonnet으로 고정한다", async () => {
    sdk.query.mockReturnValue((async function* () { yield { type: "result", is_error: false }; })());
    await new ClaudeAgentRuntime("opus").run({ apiKey: "sk-ant-test-personal-key-value", messages: [], context: [], signal: new AbortController().signal, emit: vi.fn(), ...base() });
    const options = sdk.query.mock.lastCall![0].options;
    expect(options.model).toBe("sonnet");
    expect(options.env.ANTHROPIC_API_KEY).toBe("sk-ant-test-personal-key-value");
    expect(options.env.HOME).toContain("expresso-agent-");
    expect(options.env.CLAUDE_CONFIG_DIR).toBe(options.env.HOME);
    expect(options.env.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined();
    expect(options.env.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
    expect(sdk.query.mock.lastCall![0].prompt).not.toContain("sk-ant-");
  });

  it("검증에 걸린 요건 대조는 카드 없이 어긋난 항목을 에이전트에게 돌려준다", async () => {
    let handler!: (input: unknown) => Promise<{ content: { text: string }[]; isError?: boolean }>;
    sdk.query.mockImplementation(({ options }) => (async function* () {
      handler = options.mcpServers.expresso.tools.find((item: { name: string }) => item.name === "record_requirement_review").handler;
      yield { type: "result", is_error: false };
    })());
    const emit = vi.fn(); const input = { ...base(), review: vi.fn(async () => { throw new AgentToolRejection(["1번 요건: 공고 인용이 원문에 없습니다."]); }) };
    await new ClaudeAgentRuntime().run({ messages: [], context: [], signal: new AbortController().signal, emit, ...input });
    const result = await handler({ jobPostingId: "00000000-0000-4000-8000-000000000001", summary: "요약", items: [] });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("공고 인용이 원문에 없습니다");
    expect(emit).not.toHaveBeenCalled();
  });
  it("모델에 넘기는 대화에는 도구의 이름 · 요약 · 요건 대조만 싣는다", () => {
    const review = { jobPostingId: "00000000-0000-4000-8000-000000000001", summary: "요약", createdAt: "2026-10-15T00:00:00.000Z", snapshot: { jobContentHash: "a".repeat(64), records: [] }, items: [{ requirement: "Kafka", jobQuote: "Kafka 운영", kind: "must" as const, assessment: "unconfirmed" as const, explanation: "설명", recommendation: "질문", evidence: [] }] };
    const [message] = conversationForModel([{ id: "00000000-0000-4000-8000-000000000002", role: "assistant", text: "정리했습니다", createdAt: "2026-10-15T00:00:00.000Z", tools: [{ id: "t", name: "요건 대조", status: "complete", summary: "요건 1개", review }] }]);
    expect(message).toEqual({ role: "assistant", text: "정리했습니다", tools: [{ name: "요건 대조", summary: "요건 1개", review: { jobPostingId: review.jobPostingId, summary: "요약", items: [{ requirement: "Kafka", kind: "must", assessment: "unconfirmed", recommendation: "질문", evidence: [] }] } }] });
    const draft = { draftId: "00000000-0000-4000-8000-000000000004", title: "새 기록", categoryId: null, bodyMd: "본문", sources: [{ messageId: "00000000-0000-4000-8000-000000000003", quote: "말" }], categories: [], status: "approved" as const, recordId: "00000000-0000-4000-8000-000000000005" };
    expect(conversationForModel([{ id: "00000000-0000-4000-8000-000000000006", role: "assistant", text: "", createdAt: "2026-10-15T00:00:00.000Z", tools: [{ id: "d", name: "새 기록 초안", status: "complete", summary: "새 기록", recordDraft: draft }] }])[0]!.tools).toEqual([{ name: "새 기록 초안", summary: "새 기록", recordDraft: { title: "새 기록", status: "approved", recordId: draft.recordId } }]);
    expect(conversationForModel([{ id: "00000000-0000-4000-8000-000000000003", role: "user", text: "질문", createdAt: "2026-10-15T00:00:00.000Z", tools: [] }])).toEqual([{ id: "00000000-0000-4000-8000-000000000003", role: "user", text: "질문" }]);
  });
  it("성공한 실행의 사용량을 모델마다 한 줄씩 사용자 몫으로 남긴다", async () => {
    sdk.query.mockReturnValue((async function* () {
      yield { type: "result", is_error: false, duration_ms: 4_200, modelUsage: {
        "claude-haiku-5-5": { inputTokens: 10, outputTokens: 20, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, costUSD: 0.001 },
        "claude-sonnet-5": { inputTokens: 12, outputTokens: 900, cacheReadInputTokens: 3_000, cacheCreationInputTokens: 4_000, costUSD: 0.05 },
      } };
    })());
    const record = vi.fn(async (_event: AiUsageEvent) => undefined);
    await new ClaudeAgentRuntime(undefined, { record }).run({ messages: [], context: [], signal: new AbortController().signal, emit: vi.fn(), ...base() });
    expect(record.mock.calls.map(([event]) => event)).toEqual([
      { userId: "00000000-0000-4000-8000-0000000000aa", contract: "agent_chat", model: "claude-sonnet-5", inputTokens: 12, outputTokens: 900, cacheReadTokens: 3_000, cacheCreationTokens: 4_000, costUsd: 0.05, durationMs: 4_200 },
      { userId: "00000000-0000-4000-8000-0000000000aa", contract: "agent_chat", model: "claude-haiku-5-5", inputTokens: 10, outputTokens: 20, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0.001, durationMs: 0 },
    ]);
  });
  it("실패한 실행은 사용량을 남기지 않는다", async () => {
    sdk.query.mockReturnValue((async function* () { yield { type: "result", is_error: true, duration_ms: 10, modelUsage: { "claude-sonnet-5": { inputTokens: 1, outputTokens: 1, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, costUSD: 0 } } }; })());
    const record = vi.fn(async (_event: AiUsageEvent) => undefined);
    await expect(new ClaudeAgentRuntime(undefined, { record }).run({ messages: [], context: [], signal: new AbortController().signal, emit: vi.fn(), ...base() })).rejects.toThrow("agent execution failed");
    expect(record).not.toHaveBeenCalled();
  });
});
