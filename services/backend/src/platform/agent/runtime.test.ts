import { describe, expect, it, vi } from "vitest";
const sdk = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@anthropic-ai/claude-agent-sdk", () => sdk);
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AiUsageEvent } from "../ai/usage-sink.js";
import { AGENT_ALLOWED_TOOLS, AgentToolRejection, ClaudeAgentRuntime, conversationForModel, type AgentEvent, type AgentInput } from "./runtime.js";
/** 실행이 SDK에 넘긴 MCP 서버에 실제 MCP 클라이언트로 붙는다 — 모델이 보는 도구 목록과 호출 경로 그대로. */
async function connectTools(overrides: Partial<AgentInput> = {}) {
  let server!: McpServer;
  sdk.query.mockImplementation(({ options }) => (async function* () { server = options.mcpServers.expresso.instance; yield { type: "result", is_error: false }; })());
  const emit = vi.fn(async (_event: AgentEvent) => undefined);
  await new ClaudeAgentRuntime().run({ messages: [], context: [], signal: new AbortController().signal, emit, ...base(), ...overrides });
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: "runtime-test", version: "1.0.0" });
  await client.connect(clientSide);
  return { client, emit };
}
const base = () => ({ userId: "00000000-0000-4000-8000-0000000000aa", records: { list: vi.fn(async () => ({ categories: [], records: [] })), read: vi.fn(async () => []) }, review: vi.fn(), draftRecord: vi.fn(), gapReview: vi.fn(), planDraft: vi.fn(), replanDraft: vi.fn(), readPlan: vi.fn(), propose: vi.fn(), page: { read: vi.fn(), edit: vi.fn() } });
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
    expect(sdk.query.mock.lastCall![0].options.allowedTools).toEqual(["mcp__expresso__propose_record_edit", "mcp__expresso__list_career_records", "mcp__expresso__read_career_records", "mcp__expresso__record_requirement_review", "mcp__expresso__propose_new_record", "mcp__expresso__record_gap_review", "mcp__expresso__propose_preparation_plan", "mcp__expresso__read_preparation_plan", "mcp__expresso__propose_replan", "mcp__expresso__read_page_element", "mcp__expresso__edit_page_element"]);
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

  it("모든 도구가 입력 스키마와 함께 MCP 도구 목록에 실린다", async () => {
    const { client } = await connectTools();
    const { tools } = await client.listTools();
    expect(tools.map(tool => `mcp__expresso__${tool.name}`).sort()).toEqual([...AGENT_ALLOWED_TOOLS].sort());
    for (const tool of tools) expect(tool.inputSchema.type).toBe("object");
  });
  it("도구는 같은 id로 실행 중을 먼저 알리고 완료로 바꾼다", async () => {
    const { client, emit } = await connectTools({ records: { list: vi.fn(async () => ({ categories: [], records: [{ id: "r", title: "결제 API", category: "프로젝트", status: "active", updatedAt: "2026-10-01" }] })), read: vi.fn(async () => []) } });
    const result = await client.callTool({ name: "list_career_records", arguments: {} });
    expect(result.isError).toBeFalsy();
    const events = emit.mock.calls.map(([event]) => event).filter(event => event.type === "tool").map(event => event.tool);
    expect(events.map(tool => [tool.name, tool.status, tool.summary])).toEqual([["기록 목록 확인", "running", "기록 목록을 불러오고 있습니다."], ["기록 목록 확인", "complete", "기록 1개를 확인했습니다."]]);
    expect(events[0]!.id).toBe(events[1]!.id);
  });
  it("모델이 도구 입력을 쓰기 시작하면 실행 중을 먼저 알리고, 처리기 결과를 같은 줄에 잇는다", async () => {
    const emit = vi.fn(async (_event: AgentEvent) => undefined);
    sdk.query.mockImplementation(({ options }) => (async function* () {
      yield { type: "stream_event", event: { type: "content_block_start", content_block: { type: "tool_use", id: "toolu_1", name: "mcp__expresso__list_career_records" } } };
      expect(emit.mock.calls.map(([event]) => event.type === "tool" && event.tool.status)).toEqual(["running"]);
      const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
      await (options.mcpServers.expresso.instance as McpServer).connect(serverSide);
      const client = new Client({ name: "runtime-test", version: "1.0.0" });
      await client.connect(clientSide);
      await client.callTool({ name: "list_career_records", arguments: {}, _meta: { "claudecode/toolUseId": "toolu_1" } });
      yield { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "[]" }] } };
      yield { type: "result", is_error: false };
    })());
    await new ClaudeAgentRuntime().run({ messages: [], context: [], signal: new AbortController().signal, emit, ...base() });
    const tools = emit.mock.calls.map(([event]) => event).filter(event => event.type === "tool").map(event => event.tool);
    expect(tools.map(tool => tool.status)).toEqual(["running", "complete"]);
    expect(new Set(tools.map(tool => tool.id)).size).toBe(1);
  });
  it("처리기까지 오지 못한 도구 호출은 결과가 오면 실패로 닫는다", async () => {
    const emit = vi.fn(async (_event: AgentEvent) => undefined);
    sdk.query.mockReturnValue((async function* () {
      yield { type: "stream_event", event: { type: "content_block_start", content_block: { type: "tool_use", id: "toolu_2", name: "mcp__expresso__record_requirement_review" } } };
      yield { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "toolu_2", is_error: true, content: "invalid arguments" }] } };
      yield { type: "result", is_error: false };
    })());
    await new ClaudeAgentRuntime().run({ messages: [], context: [], signal: new AbortController().signal, emit, ...base() });
    expect(emit.mock.calls.map(([event]) => event.type === "tool" && [event.tool.name, event.tool.status, event.tool.summary])).toEqual([["요건 대조", "running", "요건마다 근거를 찾고 있습니다."], ["요건 대조", "failed", "도구 입력이 맞지 않아 다시 씁니다."]]);
  });
  it("검증에 걸린 요건 대조는 카드 없이 실패로 닫고 어긋난 항목을 에이전트에게 돌려준다", async () => {
    const { client, emit } = await connectTools({ review: vi.fn(async () => { throw new AgentToolRejection(["1번 요건: 공고 인용이 원문에 없습니다."]); }) });
    const result = await client.callTool({ name: "record_requirement_review", arguments: { jobPostingId: "00000000-0000-4000-8000-000000000001", summary: "요약", items: [{ requirement: "Kafka", jobQuote: "Kafka 운영", kind: "must", assessment: "unconfirmed", explanation: "설명", recommendation: "질문", evidence: [] }] } });
    expect(result.isError).toBe(true);
    expect((result.content as { text: string }[])[0]!.text).toContain("공고 인용이 원문에 없습니다");
    const last = emit.mock.calls.at(-1)![0];
    expect(last).toMatchObject({ type: "tool", tool: { name: "요건 대조", status: "failed", summary: "어긋난 인용을 고쳐 다시 대조합니다." } });
    expect(last.type === "tool" && last.tool.review).toBeUndefined();
  });
  it("지면 요소 고침은 카드 결과를 남기고, 걸린 고침은 저장 없이 고칠 항목을 돌려준다", async () => {
    const pageEdit = { editId: "00000000-0000-4000-8000-000000000010", portfolioId: "00000000-0000-4000-8000-000000000011", key: "section-a", label: "경로 재설계", note: "요약을 줄였습니다.", changes: [{ label: "요약", before: "긴 요약", after: "짧은 요약" }], revision: 3, undone: false };
    const edit = vi.fn(async () => pageEdit);
    const { client, emit } = await connectTools({ page: { read: vi.fn(async () => ({ typeLabel: "사례", title: "경로 재설계", text: [] })), edit } });
    const args = { portfolioId: pageEdit.portfolioId, key: "section-a", note: "요약을 줄였습니다.", text: [{ path: "/sections/a/summary", value: "짧은 요약" }] };
    const read = await client.callTool({ name: "read_page_element", arguments: { portfolioId: pageEdit.portfolioId, key: "section-a" } });
    expect((read.content as { text: string }[])[0]!.text).toContain("경로 재설계");
    const result = await client.callTool({ name: "edit_page_element", arguments: args });
    expect(result.isError).toBeFalsy();
    expect(edit).toHaveBeenCalledWith(args);
    expect(emit.mock.calls.at(-1)![0]).toMatchObject({ type: "tool", tool: { name: "지면 요소 고침", status: "complete", summary: "경로 재설계 · 바뀐 곳 1", pageEdit } });
    edit.mockRejectedValueOnce(new AgentToolRejection(["/sections/a/summary: 출처에 없는 숫자가 있습니다(99)."]));
    const rejected = await client.callTool({ name: "edit_page_element", arguments: args });
    expect(rejected.isError).toBe(true);
    expect((rejected.content as { text: string }[])[0]!.text).toContain("출처에 없는 숫자");
    expect(emit.mock.calls.at(-1)![0]).toMatchObject({ type: "tool", tool: { name: "지면 요소 고침", status: "failed" } });
  });
  it("검증 밖의 오류는 실패로 닫고 다시 던진다", async () => {
    const { client, emit } = await connectTools({ records: { list: vi.fn(async () => { throw new Error("db down"); }), read: vi.fn(async () => []) } });
    const result = await client.callTool({ name: "list_career_records", arguments: {} });
    expect(result.isError).toBe(true);
    expect(emit.mock.calls.at(-1)![0]).toMatchObject({ type: "tool", tool: { name: "기록 목록 확인", status: "failed", summary: "실행하지 못했습니다." } });
  });
  it("허용한 도구가 빠진 채 시작하면 답을 내보내지 않고 실패한다", async () => {
    sdk.query.mockReturnValue((async function* () {
      yield { type: "system", subtype: "init", tools: AGENT_ALLOWED_TOOLS.slice(1) };
      yield { type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "{\"tool\":\"list_career_records\"}" } } };
    })());
    const emit = vi.fn();
    await expect(new ClaudeAgentRuntime().run({ messages: [], context: [], signal: new AbortController().signal, emit, ...base() })).rejects.toThrow("agent tools unavailable: mcp__expresso__propose_record_edit");
    expect(emit).not.toHaveBeenCalled();
  });
  it("모델에 넘기는 대화에는 도구의 이름 · 요약 · 요건 대조만 싣는다", () => {
    const review = { jobPostingId: "00000000-0000-4000-8000-000000000001", summary: "요약", createdAt: "2026-10-15T00:00:00.000Z", snapshot: { jobContentHash: "a".repeat(64), records: [] }, items: [{ requirement: "Kafka", jobQuote: "Kafka 운영", kind: "must" as const, assessment: "unconfirmed" as const, explanation: "설명", recommendation: "질문", evidence: [] }] };
    const [message] = conversationForModel([{ id: "00000000-0000-4000-8000-000000000002", role: "assistant", text: "정리했습니다", createdAt: "2026-10-15T00:00:00.000Z", tools: [{ id: "t", name: "요건 대조", status: "complete", summary: "요건 1개", review }] }]);
    expect(message).toEqual({ role: "assistant", text: "정리했습니다", tools: [{ name: "요건 대조", summary: "요건 1개", review: { jobPostingId: review.jobPostingId, summary: "요약", items: [{ requirement: "Kafka", kind: "must", assessment: "unconfirmed", recommendation: "질문", evidence: [] }] } }] });
    const draft = { draftId: "00000000-0000-4000-8000-000000000004", title: "새 기록", categoryId: null, bodyMd: "본문", sources: [{ messageId: "00000000-0000-4000-8000-000000000003", quote: "말" }], categories: [], status: "approved" as const, recordId: "00000000-0000-4000-8000-000000000005" };
    expect(conversationForModel([{ id: "00000000-0000-4000-8000-000000000006", role: "assistant", text: "", createdAt: "2026-10-15T00:00:00.000Z", tools: [{ id: "d", name: "새 기록 초안", status: "complete", summary: "새 기록", recordDraft: draft }] }])[0]!.tools).toEqual([{ name: "새 기록 초안", summary: "새 기록", recordDraft: { title: "새 기록", status: "approved", recordId: draft.recordId } }]);
    expect(conversationForModel([{ id: "00000000-0000-4000-8000-000000000003", role: "user", text: "질문", createdAt: "2026-10-15T00:00:00.000Z", tools: [] }])).toEqual([{ id: "00000000-0000-4000-8000-000000000003", role: "user", text: "질문" }]);
    // 다듬기 화면에서 보낸 말에는 고른 요소가 붙는다.
    const selection = { portfolioId: "00000000-0000-4000-8000-000000000011", key: "toc", label: "작업 목차" };
    expect(conversationForModel([{ id: "00000000-0000-4000-8000-000000000003", role: "user", text: "더 짧게", selection, createdAt: "2026-10-15T00:00:00.000Z", tools: [] }])[0]).toEqual({ id: "00000000-0000-4000-8000-000000000003", selection, role: "user", text: "더 짧게" });
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
