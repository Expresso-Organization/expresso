import { describe, it, expect, vi } from "vitest";
const sdk = vi.hoisted(() => ({ query: vi.fn(), tool: vi.fn((name, description, schema, handler) => ({ name, description, schema, handler })), createSdkMcpServer: vi.fn(input => input) }));
vi.mock("@anthropic-ai/claude-agent-sdk", () => sdk);
import { refreshRecentRecords } from "./fresh-records.js";
import { ClaudeAgentRuntime, type AgentInput } from "./runtime.js";
import { CodexAgentRuntime } from "./codex-runtime.js";
import type { AiClient } from "../ai/client.js";
const id = "00000000-0000-4000-8000-000000000001";
function fixture() {
 const controller = new AbortController();
 const input = {
 userId: id, signal: controller.signal, context: [],
 messages: [{ id, role: "assistant", text: "404입니다.", createdAt: "2026-11-01T00:00:00Z", tools: [{ id, name: "검색", status: "complete", summary: "과거 검색", evidenceSearch: { hits: [{ recordId: id, quote: "404" }] } }] }],
 records: { read: vi.fn(async () => [{ id, title: "테스트", text: "가상 경험이다. 팀원이 구조를 정했고 나는 410을 반환했다.", truncated: false }]), list: vi.fn() },
 emit: vi.fn(async () => undefined), propose: vi.fn(), review: vi.fn(), draftRecord: vi.fn(), gapReview: vi.fn(), planDraft: vi.fn(), replanDraft: vi.fn(), readPlan: vi.fn(),
 } as unknown as AgentInput;
 return { input, controller };
}
describe("fresh record context", () => {
 it("reads current source every request instead of carrying over cached text", async () => {
 const {input}=fixture();
 expect((await refreshRecentRecords(input))?.records[0]?.text).toContain("410");
 vi.mocked(input.records.read).mockResolvedValue([{ id, title: "test", text: "418", truncated: false }]);
 expect((await refreshRecentRecords(input))?.records[0]?.text).toBe("418");
 expect(input.records.read).toHaveBeenCalledTimes(2);
 });
 it("represents deleted records as unavailable without old quotes", async () => {
 const {input}=fixture(); vi.mocked(input.records.read).mockResolvedValue([]);
 const result=await refreshRecentRecords(input);
 expect(result?.unavailableRecordIds).toEqual([id]); expect(result?.records).toEqual([]);
 expect(JSON.stringify(result)).not.toContain("404");
 });
 it("reads linked records when no search history exists and deduplicates IDs", async () => {
 const {input}=fixture(); input.messages=[]; input.context=[{kind:"record",id},{kind:"record",id}];
 await refreshRecentRecords(input); expect(input.records.read).toHaveBeenCalledWith([id]);
 });
 it("does not read arbitrary records without references", async () => {
 const {input}=fixture(); input.messages=[];
 expect(await refreshRecentRecords(input)).toBeNull(); expect(input.records.read).not.toHaveBeenCalled();
 });
 it("stops before reading or emitting after cancellation", async () => {
 const {input,controller}=fixture(); controller.abort();
 await expect(refreshRecentRecords(input)).rejects.toThrow("cancelled"); expect(input.records.read).not.toHaveBeenCalled();
 });
 it("does not expose a result when cancelled during a read", async () => {
 const {input,controller}=fixture(); vi.mocked(input.records.read).mockImplementation(async()=>{controller.abort();return [];});
 await expect(refreshRecentRecords(input)).rejects.toThrow("cancelled");expect(input.emit).not.toHaveBeenCalled();
 });
 it("passes 410 current source to Codex even when the model chooses no tool", async () => {
 const {input}=fixture(); const prompts:string[]=[];
 const ai:AiClient={async complete(spec,schema){prompts.push(spec.prompt);return {data:schema.parse({action:"answer",answer:"410입니다.",tool:null}),usage:{model:"test",inputTokens:0,outputTokens:0,cacheReadTokens:0,cacheCreationTokens:0,costUsd:null,durationMs:0}};}};
 await new CodexAgentRuntime(ai).run(input);
 expect(JSON.parse(prompts[0]!).currentRecords.records[0].text).toContain("410");
 expect(input.records.read).toHaveBeenCalledOnce();
 });
 it("passes refreshed source to Anthropic without changing the provider", async () => {
 const {input}=fixture();sdk.query.mockReturnValue((async function*(){yield {type:"result",is_error:false};})());
 await new ClaudeAgentRuntime().run(input);
 expect(JSON.parse(sdk.query.mock.lastCall![0].prompt).currentRecords.records[0].text).toContain("410");
 expect(sdk.query.mock.lastCall![0].options.model).toBe("sonnet");
 });
});
