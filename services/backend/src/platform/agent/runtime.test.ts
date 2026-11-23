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
const base = () => ({ userId: "00000000-0000-4000-8000-0000000000aa", records: { list: vi.fn(async () => ({ categories: [], records: [] })), read: vi.fn(async () => []) }, review: vi.fn(), saveRecord: vi.fn(), readLink: vi.fn(), recordCategories: [], askForm: vi.fn(), jobGoal: null, goalDraft: vi.fn(), gapReview: vi.fn(), planDraft: vi.fn(), replanDraft: vi.fn(), readPlan: vi.fn(), propose: vi.fn(), page: { read: vi.fn(), edit: vi.fn() }, askChoice: vi.fn(), memory: null, updateMemory: vi.fn(), makeCommitment: vi.fn(), updateCommitment: vi.fn(), goalDemand: vi.fn(), recordDiagnosis: vi.fn(), appendToRecord: vi.fn(), searchJobs: vi.fn(), searchActivities: vi.fn(), brews: [], startBrew: vi.fn(), startFreeBrew: vi.fn(), importPosting: vi.fn(), saveInterviewAnswer: vi.fn(), readRepository: vi.fn(), attachWorkMaterials: vi.fn(), proposeDesign: vi.fn(), reviseDesign: vi.fn(), portfolioNow: vi.fn(async () => null), suggestPortfolio: vi.fn() });
describe("Claude 채팅 실행 어댑터", () => {
  it("자연어 디자인 전환 도구가 제품 서비스의 결과를 카드로 전달한다", async () => {
    const brewId = "00000000-0000-4000-8000-000000000001";
    const brewDesign = { brewId, jobPostingId: null, designMessageId: null };
    const beginDesign = vi.fn(async () => brewDesign);
    const { client, emit } = await connectTools({ beginDesign });
    const result = await client.callTool({ name: "begin_design", arguments: { brewId } });
    expect(result.isError).not.toBe(true); expect(beginDesign).toHaveBeenCalledWith(brewId);
    expect(emit).toHaveBeenCalledWith({ type: "tool", tool: expect.objectContaining({ status: "complete", brewDesign }) });
    await client.close();
  });
  it("같은 검색은 원본 결과를 재사용하고 적용 조건을 모델에게 돌려준다", async () => {
    const searchJobs = vi.fn(async () => ({ title: "조건에 맞는 공고", items: [], total: 0, conditions: ["한국", "판교 우선"] }));
    const { client } = await connectTools({ searchJobs });
    const call = { name: "search_jobs", arguments: { families: ["데이터"], locations: ["판교", "강남"], limit: 5 } };
    const first = await client.callTool(call); await client.callTool(call);
    expect(searchJobs).toHaveBeenCalledTimes(1); expect(JSON.stringify(first)).toContain("판교 우선");
    await client.close();
  });

  it("글 덩어리가 새로 시작되면 앞의 글과 빈 줄로 띄운다. 도구 앞에 한 말이 마지막 답변과 붙지 않는다", async () => {
    const events: AgentEvent[] = [];
    const delta = (text: string) => ({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text } } });
    const start = (type: "text" | "tool_use") => ({ type: "stream_event", event: { type: "content_block_start", content_block: type === "text" ? { type } : { type, id: "toolu_sep", name: "mcp__expresso__list_career_records" } } });
    sdk.query.mockReturnValue((async function* () {
      yield start("text"); yield delta("바로 기록으로"); yield delta(" 저장하겠습니다.");
      yield start("tool_use");
      yield start("text"); yield delta(""); yield delta("새 기록으로 저장했습니다.");
      yield { type: "result", is_error: false };
    })());
    await new ClaudeAgentRuntime().run({ messages: [], context: [], signal: new AbortController().signal, emit: async event => { events.push(event); }, ...base() });
    expect(events.filter(event => event.type === "text").map(event => event.type === "text" ? event.text : "").join("")).toBe("바로 기록으로 저장하겠습니다.\n\n새 기록으로 저장했습니다.");
    // 지침이 자료의 이름과 도구 앞의 말, 목표 카드를 저장한 메시지를 다룬다.
    const prompt = sdk.query.mock.lastCall![0].options.systemPrompt as string;
    for (const phrase of ["자료의 이름(jobGoal", "도구를 부르기 전에 무엇을 하겠다거나", "「구직 목표를 저장했습니다.」이면"]) expect(prompt).toContain(phrase);
  });
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
    expect(sdk.query.mock.lastCall![0].options.allowedTools).toEqual(["mcp__expresso__propose_record_edit", "mcp__expresso__list_career_records", "mcp__expresso__read_career_records", "mcp__expresso__record_requirement_review", "mcp__expresso__save_record", "mcp__expresso__propose_job_goal_update", "mcp__expresso__record_gap_review", "mcp__expresso__propose_preparation_plan", "mcp__expresso__read_preparation_plan", "mcp__expresso__propose_replan", "mcp__expresso__read_page_element", "mcp__expresso__edit_page_element", "mcp__expresso__ask_choice", "mcp__expresso__ask_form", "mcp__expresso__update_memory", "mcp__expresso__make_commitment", "mcp__expresso__update_commitment", "mcp__expresso__read_goal_demand", "mcp__expresso__record_diagnosis", "mcp__expresso__append_to_record", "mcp__expresso__search_jobs", "mcp__expresso__search_activities", "mcp__expresso__show_table", "mcp__expresso__start_portfolio", "mcp__expresso__start_free_portfolio", "mcp__expresso__import_job_posting", "mcp__expresso__read_repository", "mcp__expresso__attach_work_materials", "mcp__expresso__save_interview_answer", "mcp__expresso__begin_design", "mcp__expresso__propose_design_options", "mcp__expresso__revise_design_screen", "mcp__expresso__read_link", "mcp__expresso__suggest_portfolio"]);
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
  it("작업물 붙이기는 붙인 것을 카드로 남기고, 붙이지 못한 까닭을 에이전트에게 돌려준다", async () => {
    const recordId = "00000000-0000-4000-8000-0000000000c1";
    const materials = { recordId, recordTitle: "상품 상세 전환", items: [{ kind: "site" as const, src: "/v1/media/00000000-0000-4000-8000-0000000000c2", url: "https://shop.example.com/", caption: "운영 중인 쇼핑몰" }] };
    const attachWorkMaterials = vi.fn(async () => ({ materials, issues: ["1번 사이트를 찍지 못했습니다"] }));
    const { client, emit } = await connectTools({ attachWorkMaterials });
    const result = await client.callTool({ name: "attach_work_materials", arguments: { recordId, items: [{ kind: "site", url: "https://shop.example.com", caption: "운영 중인 쇼핑몰" }, { kind: "site", url: "http://10.0.0.1", caption: "내부" }] } });
    expect(result.isError).toBeFalsy();
    const done = emit.mock.calls.map(([event]) => event).filter(event => event.type === "tool").map(event => event.tool).at(-1)!;
    expect(done).toMatchObject({ name: "작업물 붙이기", status: "complete", summary: "상품 상세 전환 · 1개", workMaterials: materials });
    expect(JSON.stringify(result.content)).toContain("1번 사이트를 찍지 못했습니다");
    // 레포 주소가 아닌 http(s) 밖의 주소는 스키마에서 걸린다.
    const bad = await client.callTool({ name: "attach_work_materials", arguments: { recordId, items: [{ kind: "site", url: "file:///etc/passwd", caption: "x" }] } });
    expect(bad.isError).toBe(true);
  });

  it("제작 시작은 카드에 실을 ID를 도구 결과로 남기고, 거절된 사유는 에이전트에게 돌려준다", async () => {
    const brewStart = { startId: "00000000-0000-4000-8000-0000000000b1", jobPostingId: "00000000-0000-4000-8000-0000000000b2", jobAnalysisId: "00000000-0000-4000-8000-0000000000b3", title: "프론트엔드 개발자", companyName: "가상 회사", brewId: null };
    const running = { status: "running" as const, stage: "extracting" as const, failure: null, requirements: null, brewId: null, step: null, announced: false };
    const startBrew = vi.fn(async () => ({ start: brewStart, state: running }));
    const { client, emit } = await connectTools({ startBrew });
    const result = await client.callTool({ name: "start_portfolio", arguments: { jobPostingId: brewStart.jobPostingId } });
    expect(result.isError).toBeFalsy();
    expect(startBrew).toHaveBeenCalledWith({ jobPostingId: brewStart.jobPostingId });
    const done = emit.mock.calls.map(([event]) => event).filter(event => event.type === "tool").map(event => event.tool).at(-1)!;
    expect(done).toMatchObject({ name: "포트폴리오 제작", status: "complete", summary: "가상 회사 · 프론트엔드 개발자", brewStart });
    // 분석이 도는 동안에는 결과를 돌려주지 않는다 — 모델이 결과를 지어내지 않게 한다.
    expect(JSON.stringify(result.content)).not.toContain("covered");
    // 앞서 분석해 둔 공고면 결과가 이미 있다. 그때만 결과를 돌려주어 그 답에서 알리게 한다.
    const ready = await connectTools({ startBrew: vi.fn(async () => ({ start: brewStart, state: { ...running, status: "done" as const, stage: "done" as const, requirements: { total: 6, covered: 1, partial: 5, missing: 0 }, announced: true } })) });
    const finished = await ready.client.callTool({ name: "start_portfolio", arguments: { jobPostingId: brewStart.jobPostingId } });
    expect(JSON.parse((finished.content as { text: string }[])[0]!.text)).toMatchObject({ analysis: "done", requirements: { total: 6, covered: 1, partial: 5, missing: 0 } });

    const refused = await connectTools({ startBrew: vi.fn(async () => { throw new AgentToolRejection(["대화에 연결된 공고가 아닙니다."]); }) });
    const rejected = await refused.client.callTool({ name: "start_portfolio", arguments: { jobPostingId: brewStart.jobPostingId } });
    expect(rejected.isError).toBe(true);
    expect(JSON.stringify(rejected.content)).toContain("대화에 연결된 공고가 아닙니다.");
    expect(refused.emit.mock.calls.map(([event]) => event).filter(event => event.type === "tool").at(-1)!.tool).toMatchObject({ status: "failed" });
  });
  it("공고 없이 · 공고 주소로 시작하는 도구는 같은 카드를 세우고, 공고 없는 제작에는 분석 결과를 돌려주지 않는다", async () => {
    const free = { startId: "00000000-0000-4000-8000-0000000000b1", jobPostingId: null, jobAnalysisId: "00000000-0000-4000-8000-0000000000b3", title: "사이드 프로젝트 모음", companyName: "", lengthPreset: "double" as const, brewId: "00000000-0000-4000-8000-0000000000b4" };
    const state = { status: "done" as const, stage: "done" as const, failure: null, requirements: { total: 0, covered: 0, partial: 0, missing: 0 }, brewId: free.brewId, step: "materials" as const, announced: true };
    const startFreeBrew = vi.fn(async () => ({ start: free, state }));
    const { client, emit } = await connectTools({ startFreeBrew });
    const result = await client.callTool({ name: "start_free_portfolio", arguments: { title: free.title, brief: "만든 것을 보여 주고 싶다", length: "double" } });
    expect(startFreeBrew).toHaveBeenCalledWith({ title: free.title, brief: "만든 것을 보여 주고 싶다", length: "double" });
    expect(JSON.parse((result.content as { text: string }[])[0]!.text)).toMatchObject({ started: true, withoutPosting: true });
    expect(JSON.stringify(result.content)).not.toContain("requirements");
    expect(emit.mock.calls.map(([event]) => event).filter(event => event.type === "tool").at(-1)!.tool).toMatchObject({ name: "포트폴리오 제작", summary: free.title, brewStart: free });

    const posted = { ...free, jobPostingId: "00000000-0000-4000-8000-0000000000b2", companyName: "가상 회사", title: "백엔드 개발자" };
    const importPosting = vi.fn(async () => ({ start: posted, state: { ...state, status: "queued" as const, stage: "queued" as const, requirements: null, brewId: null, step: null, announced: false } }));
    const imported = await connectTools({ importPosting });
    const accepted = await imported.client.callTool({ name: "import_job_posting", arguments: { url: "https://example.com/jobs/1" } });
    expect(importPosting).toHaveBeenCalledWith({ url: "https://example.com/jobs/1" });
    expect(JSON.parse((accepted.content as { text: string }[])[0]!.text)).toMatchObject({ analysis: "queued_or_running" });
  });
  it("인터뷰 답 저장은 질문을 요약으로 남기고, 거절된 사유는 에이전트에게 돌려준다", async () => {
    const answer = { brewId: "00000000-0000-4000-8000-0000000000b4", basis: 0, question: "장애를 어떻게 대응하셨나요?", messageIds: ["00000000-0000-4000-8000-0000000000c1"] };
    const saveInterviewAnswer = vi.fn(async () => ({ answered: 1, limit: 6 }));
    const { client, emit } = await connectTools({ saveInterviewAnswer });
    const result = await client.callTool({ name: "save_interview_answer", arguments: answer });
    expect(result.isError).toBeFalsy();
    expect(saveInterviewAnswer).toHaveBeenCalledWith(answer);
    expect(JSON.parse((result.content as { text: string }[])[0]!.text)).toMatchObject({ saved: true, answeredQuestions: 1, limit: 6 });
    expect(emit.mock.calls.map(([event]) => event).filter(event => event.type === "tool").at(-1)!.tool).toMatchObject({ name: "답 저장", status: "complete", summary: "인터뷰 답변을 커리어 기록으로 저장했습니다." });

    const refused = await connectTools({ saveInterviewAnswer: vi.fn(async () => { throw new AgentToolRejection(["디자인 단계로 넘어간 제작입니다."]); }) });
    const rejected = await refused.client.callTool({ name: "save_interview_answer", arguments: answer });
    expect(rejected.isError).toBe(true);
    expect(JSON.stringify(rejected.content)).toContain("디자인 단계로 넘어간 제작입니다.");
  });
  it("디자인 도구는 카드를 도구 결과로 남기고 기다리지 않고 돌아온다", async () => {
    const card = { brewId: "00000000-0000-4000-8000-0000000000d1", jobPostingId: "00000000-0000-4000-8000-0000000000b2", designMessageId: "00000000-0000-4000-8000-0000000000d2" };
    const proposeDesign = vi.fn(async () => card);
    const { client, emit } = await connectTools({ proposeDesign, reviseDesign: vi.fn(async () => { throw new AgentToolRejection(["아직 그린 첫 화면이 없습니다."]); }) });
    const proposed = await client.callTool({ name: "propose_design_options", arguments: { brewId: card.brewId, request: "더 따뜻하게", focus: "styles" } });
    expect(proposed.isError).toBeFalsy();
    expect(emit.mock.calls.map(([event]) => event).filter(event => event.type === "tool").at(-1)!.tool).toMatchObject({ name: "견본 다시 받기", status: "complete", brewDesign: card });
    const revised = await client.callTool({ name: "revise_design_screen", arguments: { brewId: card.brewId, instruction: "강조색을 초록으로", screen: "" } });
    expect(revised.isError).toBe(true);
    expect(JSON.stringify(revised.content)).toContain("아직 그린 첫 화면이 없습니다.");
  });
  it("이 대화에서 시작한 제작의 지금 상태를 프롬프트에 싣는다", async () => {
    sdk.query.mockReturnValue((async function* () { yield { type: "result", is_error: false }; })());
    const brews = [{ jobPostingId: "00000000-0000-4000-8000-0000000000b2", title: "프론트엔드 개발자", companyName: "가상 회사", status: "done" as const, stage: "done" as const, failure: null, requirements: { total: 6, covered: 3, partial: 2, missing: 1 }, brewId: null, step: null, announced: false, selectedRecords: null, materials: [], interview: null, design: null, generation: null }];
    await new ClaudeAgentRuntime().run({ messages: [], context: [], signal: new AbortController().signal, emit: vi.fn(), ...base(), brews });
    const asked = JSON.parse(sdk.query.mock.lastCall![0].prompt);
    expect(asked.brews).toEqual(brews);
    // 사용자의 말로 시작한 실행에는 계기가 없다.
    expect(asked).not.toHaveProperty("event");
    // 서버가 시작한 실행은 계기를 싣는다 — 새 사용자 메시지가 없으므로 무엇을 말할지는 이 값이 정한다.
    const event = { kind: "brew_analysis_done" as const, brewId: null, title: brews[0]!.title };
    await new ClaudeAgentRuntime().run({ messages: [], context: [], signal: new AbortController().signal, emit: vi.fn(), ...base(), brews, event });
    expect(JSON.parse(sdk.query.mock.lastCall![0].prompt).event).toEqual(event);
    // 서버가 시작한 실행에서는 도구를 쓰지 못한다 — 작업 흔적도 남기지 않는다.
    const list = vi.fn(async () => ({ categories: [], records: [] }));
    const quiet = await connectTools({ event, records: { list, read: vi.fn(async () => []) } });
    const refused = await quiet.client.callTool({ name: "list_career_records", arguments: {} });
    expect(refused.isError).toBe(true);
    expect(list).not.toHaveBeenCalled();
    expect(quiet.emit).not.toHaveBeenCalled();
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
  it("선택지 질문은 부품을 도구 결과에 싣고, 한 실행에서 부품을 하나만 낸다", async () => {
    const part = { kind: "choice" as const, partId: "00000000-0000-4000-8000-000000000010", prompt: "주당 몇 시간을 쓸 수 있나요?", multiple: false, options: [{ id: "o1", label: "5시간" }, { id: "o2", label: "10시간" }], answer: null };
    // 첫 호출은 글이 겹쳐 돌려보내진다. 돌려보낸 호출은 세지 않으므로 고쳐 부른 두 번째 호출이 부품을 낸다.
    const askChoice = vi.fn().mockRejectedValueOnce(new AgentToolRejection(["2번 선택지: 1번과 글이 같습니다."])).mockResolvedValue(part);
    const { client, emit } = await connectTools({ askChoice });
    const args = { prompt: part.prompt, multiple: false, options: [{ label: "5시간" }, { label: "10시간" }] };
    const rejected = await client.callTool({ name: "ask_choice", arguments: args });
    expect(rejected.isError).toBe(true);
    expect((rejected.content as { text: string }[])[0]!.text).toContain("1번과 글이 같습니다");
    expect(emit.mock.calls.at(-1)![0]).toMatchObject({ type: "tool", tool: { name: "선택지 질문", status: "failed" } });
    const shown = await client.callTool({ name: "ask_choice", arguments: args });
    expect(shown.isError).toBeFalsy();
    expect(emit.mock.calls.at(-1)![0]).toMatchObject({ type: "tool", tool: { name: "선택지 질문", status: "complete", summary: part.prompt, ui: part } });
    const again = await client.callTool({ name: "ask_choice", arguments: args });
    expect(again.isError).toBe(true);
    expect((again.content as { text: string }[])[0]!.text).toContain("이미 질문 부품을 냈습니다");
    expect(askChoice).toHaveBeenCalledTimes(2);
    // 부품을 낸 실행은 도구 뒤에서 멈춘다. 돌려보낸 호출 뒤에는 멈추지 않는다(위에서 askChoice가 한 번 거절됐다).
    const [hook, formHook] = sdk.query.mock.lastCall![0].options.hooks.PostToolUse;
    expect([hook.matcher, formHook.matcher]).toEqual(["mcp__expresso__ask_choice", "mcp__expresso__ask_form"]);
    expect(await hook.hooks[0]()).toMatchObject({ continue: false });
    // 모양이 틀린 입력(선택지 하나)은 처리기까지 오지 않는다.
    expect((await client.callTool({ name: "ask_choice", arguments: { ...args, options: [{ label: "하나" }] } })).isError).toBe(true);
    expect(askChoice).toHaveBeenCalledTimes(2);
  });
  it("모델에 넘기는 대화에 부품의 질문 · 선택지 글 · 고른 글과, 선택지로 한 답임을 싣는다", () => {
    const ui = { kind: "choice" as const, partId: "00000000-0000-4000-8000-000000000010", prompt: "주당 몇 시간을 쓸 수 있나요?", multiple: false, options: [{ id: "o1", label: "5시간" }, { id: "o2", label: "10시간" }], answer: { optionIds: ["o2"], messageId: "00000000-0000-4000-8000-000000000021" } };
    const [asked, answered] = conversationForModel([
      { id: "00000000-0000-4000-8000-000000000020", role: "assistant", text: "시간을 정하겠습니다.", createdAt: "2026-11-20T00:00:00.000Z", tools: [{ id: "c", name: "선택지 질문", status: "complete", summary: ui.prompt, ui }] },
      { id: "00000000-0000-4000-8000-000000000021", role: "user", text: "10시간", reply: { partId: ui.partId, optionIds: ["o2"] }, createdAt: "2026-11-20T00:00:01.000Z", tools: [] },
    ]);
    expect(asked!.tools).toEqual([{ name: "선택지 질문", summary: ui.prompt, ui: { kind: "choice", prompt: ui.prompt, multiple: false, options: ["5시간", "10시간"], answered: ["10시간"] } }]);
    expect(answered).toEqual({ id: "00000000-0000-4000-8000-000000000021", answeredByChoice: true, role: "user", text: "10시간" });
    expect(conversationForModel([{ id: "00000000-0000-4000-8000-000000000022", role: "assistant", text: "", createdAt: "2026-11-20T00:00:00.000Z", tools: [{ id: "c", name: "선택지 질문", status: "complete", summary: ui.prompt, ui: { ...ui, answer: null } }] }])[0]!.tools![0]).toMatchObject({ ui: { answered: null } });
  });
  it("기록 저장은 저장한 기록을 카드 결과로 남기고, 도구 호출마다 같은 키를 넘기며, 걸린 저장은 고칠 항목을 돌려준다", async () => {
    const saved = { recordId: "00000000-0000-4000-8000-000000000041", title: "EKS 위 Airflow 운영", categoryName: "경험", bodyMd: "## 행동\nAirflow를 올려 운영", sources: [{ messageId: "00000000-0000-4000-8000-000000000042", quote: "EKS 위에 Airflow를 올려서" }], undone: false };
    const saveRecord = vi.fn().mockRejectedValueOnce(new AgentToolRejection(["1번 출처: 인용이 그 메시지에 없습니다."])).mockResolvedValue(saved);
    const categories = [{ id: "00000000-0000-4000-8000-000000000043", name: "경험" }];
    const { client, emit } = await connectTools({ saveRecord, recordCategories: categories });
    expect(JSON.parse(sdk.query.mock.lastCall![0].prompt).recordCategories).toEqual(categories);
    const args = { title: saved.title, categoryId: categories[0]!.id, bodyMd: saved.bodyMd, sources: saved.sources };
    const rejected = await client.callTool({ name: "save_record", arguments: args });
    expect(rejected.isError).toBe(true);
    expect((rejected.content as { text: string }[])[0]!.text).toContain("인용이 그 메시지에 없습니다");
    const done = await client.callTool({ name: "save_record", arguments: args });
    expect(done.isError).toBeFalsy();
    expect(saveRecord).toHaveBeenLastCalledWith(args, expect.any(String));
    expect(emit.mock.calls.at(-1)![0]).toMatchObject({ type: "tool", tool: { name: "기록 저장", status: "complete", summary: saved.title, savedRecord: saved } });
    expect(JSON.parse((done.content as { text: string }[])[0]!.text)).toMatchObject({ saved: true, recordId: saved.recordId });
    const { tools } = await client.listTools();
    expect(tools.map(tool => tool.name)).not.toContain("propose_new_record");
    // 모델에 넘기는 대화에는 저장한 기록의 제목 · id · 되돌림 여부만 싣는다.
    expect(conversationForModel([{ id: "00000000-0000-4000-8000-000000000044", role: "assistant", text: "", createdAt: "2026-11-20T00:00:00.000Z", tools: [{ id: "s", name: "기록 저장", status: "complete", summary: saved.title, savedRecord: { ...saved, undone: true } }] }])[0]!.tools).toEqual([{ name: "기록 저장", summary: saved.title, savedRecord: { title: saved.title, recordId: saved.recordId, undone: true } }]);
  });
  it("포트폴리오 제안은 서버가 정한 선택지를 부품으로 싣고 실행을 멈추며, 권할 때가 아니면 까닭을 돌려준다", async () => {
    const part = { kind: "choice" as const, partId: "00000000-0000-4000-8000-000000000051", prompt: "기록이 3건 모였습니다. 이 기록으로 포트폴리오를 만들어 볼까요?", multiple: false, options: [{ id: "o1", label: "지금 만들어 볼게요" }, { id: "o2", label: "나중에 할게요" }], answer: null };
    const suggestPortfolio = vi.fn().mockRejectedValueOnce(new AgentToolRejection(["최근에 이미 제안했습니다. 다시 제안하지 말고 답변을 이어 가십시오."])).mockResolvedValue(part);
    const { client, emit } = await connectTools({ suggestPortfolio });
    const rejected = await client.callTool({ name: "suggest_portfolio", arguments: {} });
    expect(rejected.isError).toBe(true);
    expect((rejected.content as { text: string }[])[0]!.text).toContain("최근에 이미 제안했습니다");
    expect(emit.mock.calls.at(-1)![0]).toMatchObject({ type: "tool", tool: { name: "포트폴리오 제안", status: "failed", summary: "지금은 권할 때가 아닙니다." } });
    // 돌려보낸 호출 뒤에는 실행이 멈추지 않는다 — 모델이 하던 답을 이어 간다.
    const hooks = sdk.query.mock.lastCall![0].options.hooks.PostToolUse as { matcher: string; hooks: (() => Promise<unknown>)[] }[];
    const hook = hooks.find(item => item.matcher === "mcp__expresso__suggest_portfolio")!;
    expect(await hook.hooks[0]!()).toEqual({});
    const shown = await client.callTool({ name: "suggest_portfolio", arguments: {} });
    expect(shown.isError).toBeFalsy();
    expect(emit.mock.calls.at(-1)![0]).toMatchObject({ type: "tool", tool: { name: "포트폴리오 제안", status: "complete", summary: part.prompt, ui: part } });
    expect(JSON.parse((shown.content as { text: string }[])[0]!.text)).toMatchObject({ shown: true, options: ["지금 만들어 볼게요", "나중에 할게요"] });
    expect(await hook.hooks[0]!()).toMatchObject({ continue: false });
    // 제안도 질문 부품이다. 같은 답변에서 선택지를 또 내지 못한다.
    const choice = await client.callTool({ name: "ask_choice", arguments: { prompt: "질문", multiple: false, options: [{ label: "예" }, { label: "아니오" }] } });
    expect(choice.isError).toBe(true);
    expect((choice.content as { text: string }[])[0]!.text).toContain("이미 질문 부품을 냈습니다");
    expect((await client.callTool({ name: "suggest_portfolio", arguments: {} })).isError).toBe(true);
    expect(suggestPortfolio).toHaveBeenCalledTimes(2);
  });
  it("기록을 저장한 직후에 포트폴리오를 권할 때인지 다시 보고, 권할 때면 링크 질문 대신 제안을 내게 한다", async () => {
    const saved = { recordId: "00000000-0000-4000-8000-000000000052", title: "사내 배포 자동화", categoryName: "경험", bodyMd: "## 행동\n배포를 자동화", sources: [{ messageId: "00000000-0000-4000-8000-000000000053", quote: "배포를 자동화했어요" }], undone: false };
    const args = { title: saved.title, categoryId: "00000000-0000-4000-8000-000000000054", bodyMd: saved.bodyMd, sources: saved.sources };
    const read = async (portfolioNow: () => Promise<{ records: number; suggest: boolean } | null>) => {
      const { client } = await connectTools({ saveRecord: vi.fn().mockResolvedValue(saved), portfolioNow });
      return JSON.parse(((await client.callTool({ name: "save_record", arguments: args })).content as { text: string }[])[0]!.text) as { saved: boolean; portfolio?: unknown; note: string };
    };
    const due = await read(async () => ({ records: 3, suggest: true }));
    expect(due).toMatchObject({ saved: true, portfolio: { records: 3, suggest: true } });
    expect(due.note).toContain("suggest_portfolio");
    expect(due.note).not.toContain("링크가 없으면");
    const early = await read(async () => ({ records: 2, suggest: false }));
    expect(early).toMatchObject({ saved: true, portfolio: { records: 2, suggest: false } });
    expect(early.note).toContain("링크가 없으면");
    expect(early.note).not.toContain("suggest_portfolio");
    // 판단을 읽지 못해도 저장은 끝난 일이다. 권하지 않는 쪽으로 답한다.
    const failed = await read(async () => { throw new Error("mongo down"); });
    expect(failed.saved).toBe(true);
    expect(failed.portfolio).toBeUndefined();
    expect(failed.note).toContain("링크가 없으면");
  });
  it("포트폴리오 제안의 지침은 서버의 판단과 두 답의 글을 가리킨다", async () => {
    await connectTools();
    const prompt = sdk.query.mock.lastCall![0].options.systemPrompt as string;
    for (const text of ["memory.portfolio", "suggest_portfolio", "「지금 만들어 볼게요」", "「나중에 할게요」", "suggest가 false이면"]) expect(prompt).toContain(text);
  });
  it("입력 칸 묶음도 부품으로 싣고 실행을 멈추며, 한 실행의 질문 부품은 선택지와 합쳐 하나다", async () => {
    const part = { kind: "form" as const, partId: "00000000-0000-4000-8000-000000000051", prompt: "기간과 인원을 알려 주세요.", fields: [{ id: "f1", label: "기간", optional: false }, { id: "f2", label: "팀 인원", optional: true }], answer: null };
    const askForm = vi.fn(async () => part);
    const askChoice = vi.fn();
    const { client, emit } = await connectTools({ askForm, askChoice });
    const shown = await client.callTool({ name: "ask_form", arguments: { prompt: part.prompt, fields: [{ label: "기간" }, { label: "팀 인원", optional: true }] } });
    expect(shown.isError).toBeFalsy();
    expect(emit.mock.calls.at(-1)![0]).toMatchObject({ type: "tool", tool: { name: "입력 칸 질문", status: "complete", ui: part } });
    expect(await sdk.query.mock.lastCall![0].options.hooks.PostToolUse[1].hooks[0]()).toMatchObject({ continue: false });
    const second = await client.callTool({ name: "ask_choice", arguments: { prompt: "질문", multiple: false, options: [{ label: "예" }, { label: "아니오" }] } });
    expect(second.isError).toBe(true);
    expect(askChoice).not.toHaveBeenCalled();
    const answered = { ...part, answer: { values: [{ id: "f1", text: "3개월" }], messageId: "00000000-0000-4000-8000-000000000052" } };
    expect(conversationForModel([{ id: "00000000-0000-4000-8000-000000000053", role: "assistant", text: "", createdAt: "2026-11-20T00:00:00.000Z", tools: [{ id: "f", name: "입력 칸 질문", status: "complete", summary: part.prompt, ui: answered }] }])[0]!.tools).toEqual([{ name: "입력 칸 질문", summary: part.prompt, ui: { kind: "form", prompt: part.prompt, fields: ["기간", "팀 인원"], answered: { 기간: "3개월" } } }]);
  });
  it("새 블록만 더한 제안은 적용됐다고, 그 밖의 제안은 승인이 필요하다고 에이전트에게 돌려준다", async () => {
    const proposal = (status: string) => ({ proposalId: "00000000-0000-4000-8000-000000000061", recordId: "00000000-0000-4000-8000-000000000062", summary: "결과를 더했습니다", status, commands: [], propertyChanges: [] });
    const propose = vi.fn().mockResolvedValueOnce(proposal("applied")).mockResolvedValueOnce(proposal("ready"));
    const { client } = await connectTools({ propose });
    const draft = { summary: "결과를 더했습니다", commands: [], propertyChanges: [] };
    const first = await client.callTool({ name: "propose_record_edit", arguments: { recordId: "00000000-0000-4000-8000-000000000062", draft } });
    expect(JSON.parse((first.content as { text: string }[])[0]!.text)).toMatchObject({ status: "applied", applied: true, requiresUserApproval: false });
    const second = await client.callTool({ name: "propose_record_edit", arguments: { recordId: "00000000-0000-4000-8000-000000000062", draft } });
    expect(JSON.parse((second.content as { text: string }[])[0]!.text)).toMatchObject({ status: "ready", applied: false, requiresUserApproval: true });
  });
  it("부품을 내지 않은 실행은 선택지 도구 뒤에서 멈추지 않는다", async () => {
    await connectTools({ askChoice: vi.fn().mockRejectedValue(new AgentToolRejection(["글이 같습니다."])) });
    const hook = sdk.query.mock.lastCall![0].options.hooks.PostToolUse[0].hooks[0];
    expect(await hook()).toEqual({});
  });
  it("기억을 프롬프트에 자료로 싣고, 기억 갱신은 요약만 남기며 빈 입력은 돌려보낸다", async () => {
    const memory = { stage: "preparing" as const, checkins: true, preferences: [{ id: "00000000-0000-4000-8000-000000000031", kind: "avoid" as const, text: "야근이 잦은 곳" }], today: "2026-11-20", commitments: [{ id: "00000000-0000-4000-8000-000000000032", title: "해커톤 지원서 내기", dueOn: "2026-11-19", overdue: true }], diagnosis: { assessedOn: "2026-11-18", work: "백엔드 개발자", sampleSize: 66, gaps: ["Kafka"], unconfirmed: ["Kubernetes"], partial: [], confirmed: 3, stale: null }, portfolio: { records: 3, suggest: true }, recentConversations: [{ title: "준비 계획", date: "2026-11-19", said: ["계획을 세워 줘"], outcomes: ["준비 계획 승인: 백엔드 준비 (주 10시간 · 8주)"], lastAnswer: "계획을 저장했습니다." }] };
    const updateMemory = vi.fn(async () => ({ summary: "단계: 지원 · 조건 1개 기억", memory: { ...memory, stage: "applying" as const } }));
    const { client, emit } = await connectTools({ memory, updateMemory });
    expect(JSON.parse(sdk.query.mock.lastCall![0].prompt)).toMatchObject({ memory });
    // 약속한 날에 먼저 묻는지는 기억이 알려 준다. 묻지 않는 사용자에게 묻겠다고 말하지 않게 지침이 그 값을 가리킨다.
    expect(sdk.query.mock.lastCall![0].options.systemPrompt).toEqual(expect.stringContaining("memory.checkins가 false이면"));
    const saved = await client.callTool({ name: "update_memory", arguments: { stage: "applying", remember: [{ kind: "prefer", text: "재택이 되는 곳" }] } });
    expect(saved.isError).toBeFalsy();
    expect(updateMemory).toHaveBeenCalledWith({ stage: "applying", remember: [{ kind: "prefer", text: "재택이 되는 곳" }] });
    const last = emit.mock.calls.at(-1)![0];
    expect(last).toMatchObject({ type: "tool", tool: { name: "기억 갱신", status: "complete", summary: "단계: 지원 · 조건 1개 기억" } });
    expect(JSON.parse((saved.content as { text: string }[])[0]!.text)).toMatchObject({ saved: true, memory: { stage: "applying" } });
    const empty = await client.callTool({ name: "update_memory", arguments: {} });
    expect(empty.isError).toBe(true);
    expect(updateMemory).toHaveBeenCalledTimes(1);
  });
  it("약속을 저장하면 약속 카드 결과를 남기고, 약속을 닫거나 옮기면 요약만 남긴다", async () => {
    const commitment = { id: "00000000-0000-4000-8000-000000000071", title: "해커톤 지원서 내기", detail: "", dueOn: "2026-11-27", status: "open" as const, awaiting: false, conversationId: null, createdAt: "2026-11-20T00:00:00.000Z" };
    const makeCommitment = vi.fn().mockRejectedValueOnce(new AgentToolRejection(["dueOn이 오늘(2026-11-20)보다 앞입니다."])).mockResolvedValue(commitment);
    const updateCommitment = vi.fn(async () => ({ ...commitment, status: "done" as const }));
    const { client, emit } = await connectTools({ makeCommitment, updateCommitment });
    const rejected = await client.callTool({ name: "make_commitment", arguments: { title: commitment.title, dueOn: "2026-11-19" } });
    expect(rejected.isError).toBe(true);
    expect((rejected.content as { text: string }[])[0]!.text).toContain("오늘(2026-11-20)보다 앞");
    const made = await client.callTool({ name: "make_commitment", arguments: { title: commitment.title, dueOn: "2026-11-27" } });
    expect(made.isError).toBeFalsy();
    expect(emit.mock.calls.at(-1)![0]).toMatchObject({ type: "tool", tool: { name: "약속", status: "complete", summary: "해커톤 지원서 내기 · 2026-11-27", commitment } });
    // 날짜는 날(YYYY-MM-DD)만 받는다. 모양이 틀리면 처리기까지 오지 않는다.
    expect((await client.callTool({ name: "make_commitment", arguments: { title: commitment.title, dueOn: "다음 주 금요일" } })).isError).toBe(true);
    expect(makeCommitment).toHaveBeenCalledTimes(2);
    const done = await client.callTool({ name: "update_commitment", arguments: { commitmentId: commitment.id, status: "done" } });
    expect(done.isError).toBeFalsy();
    const last = emit.mock.calls.at(-1)![0];
    expect(last).toMatchObject({ type: "tool", tool: { name: "약속 갱신", status: "complete", summary: "해커톤 지원서 내기 · 했음" } });
    expect(last.type === "tool" && last.tool.commitment).toBeUndefined();
    expect((await client.callTool({ name: "update_commitment", arguments: { commitmentId: commitment.id } })).isError).toBe(true);
    expect(updateCommitment).toHaveBeenCalledTimes(1);
    expect(conversationForModel([{ id: "00000000-0000-4000-8000-000000000072", role: "assistant", text: "", createdAt: "2026-11-20T00:00:00.000Z", tools: [{ id: "c", name: "약속", status: "complete", summary: "약속", commitment }] }])[0]!.tools).toEqual([{ name: "약속", summary: "약속", commitment: { id: commitment.id, title: commitment.title, dueOn: commitment.dueOn } }]);
  });
  it("요건 집계는 경력 연차를 참고로 돌려준다 — 미확인으로 주면 모델이 미확인의 수에 넣어 말한다", async () => {
    const row = (id: string, kind: "technology" | "career", label: string) => ({ id, kind, label, count: 10, status: "unconfirmed" as const, evidence: [], note: "" });
    const diagnosis = { work: "데이터 분석가", family: "데이터", basis: "family" as const, focus: null, level: null, sampleSize: 52, companyCount: 18, interestedCount: 0, small: false, summary: "", items: [row("technology:sql", "technology", "SQL"), row("career:5-7", "career", "경력 5~7년 이상")], demandAt: "2026-11-20T00:00:00.000Z", assessedAt: null, stale: null };
    const { client } = await connectTools({ goalDemand: vi.fn().mockResolvedValue(diagnosis) });
    const read = await client.callTool({ name: "read_goal_demand", arguments: {} });
    expect((JSON.parse((read.content as { text: string }[])[0]!.text) as { items: { id: string; status: string }[] }).items.map(({ id, status }) => ({ id, status }))).toEqual([{ id: "technology:sql", status: "unconfirmed" }, { id: "career:5-7", status: "reference" }]);
  });
  it("요건 집계는 표본과 항목을 모델에 돌려주고, 진단을 저장하면 진단 카드 결과를 남긴다. 돌려보낸 사유는 모델에 그대로 전한다", async () => {
    const item = (id: string, label: string, count: number, status: "confirmed" | "partial" | "unconfirmed" | "gap" = "unconfirmed") => ({ id, kind: "technology" as const, label, count, status, evidence: [], note: "" });
    const diagnosis = { work: "백엔드 개발자", family: "백엔드", basis: "family" as const, focus: null, level: null, sampleSize: 66, companyCount: 15, interestedCount: 1, small: false, summary: "", items: [item("technology:java", "Java", 45), item("technology:kafka", "Kafka", 39)], demandAt: "2026-11-20T00:00:00.000Z", assessedAt: null, stale: null };
    const goalDemand = vi.fn().mockRejectedValueOnce(new AgentToolRejection(["구직 목표의 하고 싶은 일이 비어 있습니다."])).mockResolvedValue(diagnosis);
    const assessed = { ...diagnosis, summary: "백엔드 공고 66건 기준", assessedAt: "2026-11-20T00:01:00.000Z", items: [{ ...item("technology:java", "Java", 45, "confirmed"), evidence: [{ recordId: "00000000-0000-4000-8000-000000000081", quote: "Java로 결제 API를 만들었다", recordTitle: "결제 서버" }] }, item("technology:kafka", "Kafka", 39)] };
    const recordDiagnosis = vi.fn().mockRejectedValueOnce(new AgentToolRejection(["항목 technology:kafka(Kafka): gap은 사용자가 해 본 적이 없다고 답한 뒤에만 씁니다."])).mockResolvedValue(assessed);
    const { client, emit } = await connectTools({ goalDemand, recordDiagnosis });
    const empty = await client.callTool({ name: "read_goal_demand", arguments: {} });
    expect(empty.isError).toBe(true);
    expect((empty.content as { text: string }[])[0]!.text).toContain("구직 목표의 하고 싶은 일이 비어 있습니다.");
    const read = await client.callTool({ name: "read_goal_demand", arguments: {} });
    expect(read.isError).toBeFalsy();
    const payload = JSON.parse((read.content as { text: string }[])[0]!.text) as { sample: { sampleSize: number; companyCount: number }; items: { id: string; count: number; status: string }[] };
    expect(payload.sample).toMatchObject({ family: "백엔드", sampleSize: 66, companyCount: 15, small: false });
    expect(payload.items).toEqual([{ id: "technology:java", kind: "technology", label: "Java", count: 45, status: "unconfirmed" }, { id: "technology:kafka", kind: "technology", label: "Kafka", count: 39, status: "unconfirmed" }]);
    expect(emit.mock.calls.at(-1)![0]).toMatchObject({ type: "tool", tool: { name: "목표 요건 집계", status: "complete", summary: "백엔드 공고 66건 · 요건 2개" } });
    const input = { summary: "백엔드 공고 66건 기준", items: [{ itemId: "technology:java", status: "confirmed", evidence: [{ recordId: "00000000-0000-4000-8000-000000000081", quote: "Java로 결제 API를 만들었다" }] }] };
    const rejected = await client.callTool({ name: "record_diagnosis", arguments: { summary: "요약", items: [{ itemId: "technology:kafka", status: "gap" }] } });
    expect(rejected.isError).toBe(true);
    expect((rejected.content as { text: string }[])[0]!.text).toContain("gap은 사용자가 해 본 적이 없다고 답한 뒤에만");
    const saved = await client.callTool({ name: "record_diagnosis", arguments: input });
    expect(saved.isError).toBeFalsy();
    // 적지 않은 근거 · 메모는 빈 값으로 채워 넘긴다.
    expect(recordDiagnosis).toHaveBeenLastCalledWith({ summary: input.summary, items: [{ ...input.items[0], note: "" }] });
    expect(emit.mock.calls.at(-1)![0]).toMatchObject({ type: "tool", tool: { name: "목표 진단", status: "complete", summary: "확인 1 · 일부 0 · 미확인 1 · 부족 0", diagnosis: assessed } });
    // 모델이 수를 직접 세지 않게 카드와 같은 수를 돌려준다.
    expect(JSON.parse((saved.content as { text: string }[])[0]!.text)).toMatchObject({ saved: true, counts: { confirmed: 1, partial: 0, unconfirmed: 1, gap: 0 }, unconfirmed: ["Kafka"], gaps: [] });
    // 상태가 사전에 없는 값이면 처리기까지 오지 않는다.
    expect((await client.callTool({ name: "record_diagnosis", arguments: { summary: "요약", items: [{ itemId: "technology:java", status: "done" }] } })).isError).toBe(true);
    expect(recordDiagnosis).toHaveBeenCalledTimes(2);
    expect(conversationForModel([{ id: "00000000-0000-4000-8000-000000000082", role: "assistant", text: "", createdAt: "2026-11-20T00:00:00.000Z", tools: [{ id: "d", name: "목표 진단", status: "complete", summary: "확인 1", diagnosis: assessed }] }])[0]!.tools).toEqual([{ name: "목표 진단", summary: "확인 1", diagnosis: { sampleSize: 66, counts: { confirmed: 1, partial: 0, unconfirmed: 1, gap: 0 }, items: [{ id: "technology:java", label: "Java", count: 45, status: "confirmed" }, { id: "technology:kafka", label: "Kafka", count: 39, status: "unconfirmed" }] } }]);
    // 경력 연차는 기록과 대조하지 않는 참고 항목이다. 모델에는 reference로 싣고 수에 넣지 않는다 — 미확인으로 실으면 답변이 카드보다 하나 많게 말한다.
    const withCareer = { ...assessed, items: [...assessed.items, { id: "career:5-7", kind: "career" as const, label: "경력 5~7년 이상", count: 21, status: "unconfirmed" as const, evidence: [], note: "" }] };
    const shown = conversationForModel([{ id: "00000000-0000-4000-8000-000000000083", role: "assistant", text: "", createdAt: "2026-11-20T00:00:00.000Z", tools: [{ id: "d2", name: "목표 진단", status: "complete", summary: "확인 1", diagnosis: withCareer }] }])[0]!.tools![0] as { diagnosis: { counts: Record<string, number>; items: { id: string; status: string }[] } };
    expect(shown.diagnosis.counts).toEqual({ confirmed: 1, partial: 0, unconfirmed: 1, gap: 0 });
    expect(shown.diagnosis.items.at(-1)).toMatchObject({ id: "career:5-7", status: "reference" });
  });
  it("공고 · 활동 찾기는 목록을 카드 결과로 남기고 모델에는 줄의 요점만 돌려준다. 한 실행의 찾기는 네 번까지다", async () => {
    const item = { kind: "job" as const, id: "00000000-0000-4000-8000-000000000091", title: "백엔드 엔지니어", sub: "당근", meta: ["서울", "신입 가능"], daysLeft: 12, href: "/jobs/00000000-0000-4000-8000-000000000091", external: false };
    const searchJobs = vi.fn(async () => ({ title: "백엔드 · 신입 공고", items: [item], total: 9 }));
    const searchActivities = vi.fn(async () => ({ title: "접수 중인 해커톤", items: [], total: 0 }));
    const { client, emit } = await connectTools({ searchJobs, searchActivities });
    const found = await client.callTool({ name: "search_jobs", arguments: { family: "백엔드", experience: 0 } });
    expect(found.isError).toBeFalsy();
    // 적지 않은 건수는 기본값으로 채워 넘긴다.
    expect(searchJobs).toHaveBeenLastCalledWith({ family: "백엔드", experience: 0, limit: 5 });
    expect(emit.mock.calls.at(-1)![0]).toMatchObject({ type: "tool", tool: { name: "공고 찾기", status: "complete", summary: "백엔드 · 신입 공고 · 1건 (전체 9건)", list: { title: "백엔드 · 신입 공고", items: [item], total: 9 } } });
    const reply = JSON.parse((found.content as { text: string }[])[0]!.text) as { total: number; items: Record<string, unknown>[] };
    expect(reply.items).toEqual([{ id: item.id, title: item.title, sub: item.sub, meta: item.meta, daysLeft: 12 }]);
    const none = await client.callTool({ name: "search_activities", arguments: { kind: "hackathon", query: "데이터" } });
    expect(emit.mock.calls.at(-1)![0]).toMatchObject({ type: "tool", tool: { name: "활동 찾기", summary: "접수 중인 해커톤 · 찾은 것 없음" } });
    expect((none.content as { text: string }[])[0]!.text).toContain("찾은 것이 없습니다");
    // 건수가 범위를 벗어나거나 종류가 사전에 없으면 처리기까지 오지 않는다.
    expect((await client.callTool({ name: "search_jobs", arguments: { limit: 20 } })).isError).toBe(true);
    expect((await client.callTool({ name: "search_activities", arguments: { kind: "bootcamp" } })).isError).toBe(true);
    await client.callTool({ name: "search_jobs", arguments: {} });
    await client.callTool({ name: "search_jobs", arguments: {} });
    const fifth = await client.callTool({ name: "search_jobs", arguments: {} });
    expect(fifth.isError).toBe(true);
    expect((fifth.content as { text: string }[])[0]!.text).toContain("이미 네 번 찾았습니다");
    expect(searchJobs).toHaveBeenCalledTimes(2);
    expect(conversationForModel([{ id: "00000000-0000-4000-8000-000000000092", role: "assistant", text: "", createdAt: "2026-11-20T00:00:00.000Z", tools: [{ id: "l", name: "공고 찾기", status: "complete", summary: "1건", list: { title: "공고", items: [item], total: 1 } }] }])[0]!.tools).toEqual([{ name: "공고 찾기", summary: "1건", list: [{ kind: "job", id: item.id, title: item.title, sub: item.sub, meta: item.meta, daysLeft: 12 }] }]);
  });
  it("비교 표는 열과 줄을 카드 결과로 남기고, 칸 수가 열 수와 다르면 돌려보낸다", async () => {
    const { client, emit } = await connectTools();
    const table = { title: "두 공고 견주기", columns: ["공고", "경력", "기술"], rows: [["당근 백엔드", "신입 가능", "Kotlin · Kafka"], ["토스 서버", "3년 이상", "Java · Spring"]] };
    const shown = await client.callTool({ name: "show_table", arguments: table });
    expect(shown.isError).toBeFalsy();
    expect(emit.mock.calls.at(-1)![0]).toMatchObject({ type: "tool", tool: { name: "비교 표", status: "complete", summary: "두 공고 견주기 · 2줄", table } });
    const uneven = await client.callTool({ name: "show_table", arguments: { ...table, rows: [["당근 백엔드", "신입 가능"]] } });
    expect(uneven.isError).toBe(true);
    expect((uneven.content as { text: string }[])[0]!.text).toContain("1번 줄의 칸이 2개입니다");
    expect((await client.callTool({ name: "show_table", arguments: { ...table, columns: ["공고"] } })).isError).toBe(true);
  });
  it("링크 읽기는 본문을 모델에게만 돌려주고 요약에는 제목과 주소만 남기며, 한 실행에 세 번까지 읽는다", async () => {
    const page = { url: "https://github.com/me/moa", title: "me/moa: 모아 가계부", description: null, text: "모아는 Next.js로 만든 가계부입니다.", truncated: false };
    const readLink = vi.fn(async () => page);
    const { client, emit } = await connectTools({ readLink });
    const read = await client.callTool({ name: "read_link", arguments: { url: "https://github.com/me/moa" } });
    expect(read.isError).toBeFalsy();
    expect(readLink).toHaveBeenLastCalledWith("https://github.com/me/moa");
    expect(JSON.parse((read.content as { text: string }[])[0]!.text)).toMatchObject({ url: page.url, text: page.text });
    const shown = emit.mock.calls.at(-1)![0];
    expect(shown).toMatchObject({ type: "tool", tool: { name: "링크 읽기", status: "complete", summary: "me/moa: 모아 가계부 · github.com" } });
    expect(JSON.stringify(shown)).not.toContain("가계부입니다");
    readLink.mockRejectedValueOnce(new AgentToolRejection(["글 페이지가 아닙니다(application/pdf)."]));
    const pdf = await client.callTool({ name: "read_link", arguments: { url: "https://example.com/a.pdf" } });
    expect(pdf.isError).toBe(true);
    expect((pdf.content as { text: string }[])[0]!.text).toContain("application/pdf");
    expect((await client.callTool({ name: "read_link", arguments: { url: "https://github.com/me/moa" } })).isError).toBeFalsy();
    const fourth = await client.callTool({ name: "read_link", arguments: { url: "https://github.com/me/moa" } });
    expect((fourth.content as { text: string }[])[0]!.text).toContain("이미 링크를 세 번 읽었습니다");
    expect(readLink).toHaveBeenCalledTimes(3);
  });
  it("기억을 쓸 수 없는 환경에서는 memory를 null로 싣는다", async () => {
    await connectTools();
    expect(JSON.parse(sdk.query.mock.lastCall![0].prompt).memory).toBeNull();
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
    // 목표 변경은 바뀌는 칸과 처리 상태만 싣는다 — 다음 턴이 저장됐는지, 거절됐는지 알 수 있게.
    expect(conversationForModel([{ id: "00000000-0000-4000-8000-000000000007", role: "assistant", text: "", createdAt: "2026-10-15T00:00:00.000Z", tools: [{ id: "g", name: "구직 목표 변경", status: "complete", summary: "바뀌는 칸 1", goalDraft: { draftId: "00000000-0000-4000-8000-000000000008", work: "백엔드 개발", place: null, timing: null, previous: { work: "프론트엔드 개발", place: "", timing: "" }, status: "rejected" } }] }])[0]!.tools).toEqual([{ name: "구직 목표 변경", summary: "바뀌는 칸 1", goalDraft: { work: "백엔드 개발", place: null, timing: null, status: "rejected" } }]);
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
  it("개인 키로 돈 실행은 사용량을 남기지 않는다", async () => {
    sdk.query.mockReturnValue((async function* () { yield { type: "result", is_error: false, duration_ms: 10, modelUsage: { "claude-sonnet-5": { inputTokens: 1, outputTokens: 1, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, costUSD: 0 } } }; })());
    const record = vi.fn(async (_event: AiUsageEvent) => undefined);
    await new ClaudeAgentRuntime(undefined, { record }).run({ apiKey: "sk-ant-test-personal-key-value", messages: [], context: [], signal: new AbortController().signal, emit: vi.fn(), ...base() });
    expect(record).not.toHaveBeenCalled();
  });
  it("실패한 실행은 사용량을 남기지 않는다", async () => {
    sdk.query.mockReturnValue((async function* () { yield { type: "result", is_error: true, duration_ms: 10, modelUsage: { "claude-sonnet-5": { inputTokens: 1, outputTokens: 1, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, costUSD: 0 } } }; })());
    const record = vi.fn(async (_event: AiUsageEvent) => undefined);
    await expect(new ClaudeAgentRuntime(undefined, { record }).run({ messages: [], context: [], signal: new AbortController().signal, emit: vi.fn(), ...base() })).rejects.toThrow("agent execution failed");
    expect(record).not.toHaveBeenCalled();
  });
});
