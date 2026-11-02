import { describe, expect, it, vi } from "vitest";
import { CodexAgentRuntime } from "./codex-runtime.js";
import { AgentToolRejection, type AgentInput } from "./runtime.js";
import type { AiClient, AiCallSpec } from "../ai/client.js";
import { z } from "zod";

function fixture(responses: unknown[]) {
  const calls: AiCallSpec[] = [];
  const ai: AiClient = { async complete<T>(spec: AiCallSpec, schema: z.ZodType<T>) {
    calls.push(spec);
    return { data: schema.parse(responses.shift()), usage: { model: "test", inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: null, durationMs: 1 } };
  } };
  const controller = new AbortController();
  const input: AgentInput = {
    userId: "00000000-0000-4000-8000-000000000001", messages: [], context: [], signal: controller.signal,
    emit: vi.fn(async () => undefined),
    propose: vi.fn(), records: { list: vi.fn(async () => ({ categories: [], records: [] })), read: vi.fn(async () => []) },
    review: vi.fn(), draftRecord: vi.fn(), gapReview: vi.fn(), planDraft: vi.fn(), replanDraft: vi.fn(), readPlan: vi.fn(),
  };
  return { ai, calls, controller, input };
}
const answer = { action: "answer", answer: "확인했습니다.", tool: null };
const tool = (name: string, args: unknown) => ({ action: "tool", answer: "", tool: { name, argumentsJson: JSON.stringify(args) } });

describe("Codex development agent runtime", () => {
  it("answers without Anthropic credentials and uses the dedicated AI contract", async () => {
    const f = fixture([answer]);
    await new CodexAgentRuntime(f.ai).run(f.input);
    expect(f.calls[0]?.contract).toBe("agent_chat_codex");
    expect(f.input.emit).toHaveBeenCalledWith({ type: "text", text: "확인했습니다." });
    expect(f.input.propose).not.toHaveBeenCalled();
  });
  it("uses existing owned record readers and sends the tool result to the next turn", async () => {
    const f = fixture([tool("list_career_records", {}), tool("read_career_records", { ids: [fId] }), answer]);
    await new CodexAgentRuntime(f.ai).run(f.input);
    expect(f.input.records.list).toHaveBeenCalledOnce();
    expect(f.input.records.read).toHaveBeenCalledWith([fId]);
    expect(JSON.parse(f.calls[1]!.prompt).toolResults[0]).toMatchObject({ name: "list_career_records", ok: true });
  });
  it("does not perform a tool call after the AI call is cancelled", async () => {
    const f = fixture([]);
    const ai: AiClient = { async complete<T>(_spec: AiCallSpec, schema: z.ZodType<T>) {
      f.controller.abort();
      return { data: schema.parse(tool("list_career_records", {})), usage: { model: "test", inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: null, durationMs: 0 } };
    } };
    await expect(new CodexAgentRuntime(ai).run(f.input)).rejects.toThrow("cancelled");
    expect(f.input.records.list).not.toHaveBeenCalled();
    expect(f.input.emit).not.toHaveBeenCalled();
  });
  it("rejects fabricated tool arguments before any domain callback", async () => {
    const f = fixture([tool("read_career_records", { ids: ["invented-id"] }), answer]);
    await new CodexAgentRuntime(f.ai).run(f.input);
    expect(f.input.records.read).not.toHaveBeenCalled();
    expect(JSON.parse(f.calls[1]!.prompt).toolResults[0].ok).toBe(false);
  });
  it("exposes validated review cards through the existing service callback", async () => {
    const args = { jobPostingId: fId, summary: "요건 대조", items: [{ requirement: "Node.js", jobQuote: "Node.js", kind: "must", assessment: "unconfirmed", explanation: "확인 필요", recommendation: "경험 확인", evidence: [] }] };
    const f = fixture([tool("record_requirement_review", args), answer]);
    const result = { ...args, createdAt: "2026-10-29T00:00:00.000Z", snapshot: { jobContentHash: "a".repeat(64), records: [] } };
    vi.mocked(f.input.review).mockResolvedValue(result as never);
    await new CodexAgentRuntime(f.ai).run(f.input);
    expect(f.input.review).toHaveBeenCalledWith(args);
    expect(f.input.emit).toHaveBeenCalledWith(expect.objectContaining({ type: "tool", tool: expect.objectContaining({ review: result, status: "complete" }) }));
  });
  it("returns domain validation issues to the model without claiming a successful write", async () => {
    const args = { jobPostingId: fId, summary: "대조", items: [] };
    const f = fixture([tool("record_requirement_review", args), answer]);
    vi.mocked(f.input.review).mockRejectedValue(new AgentToolRejection(["인용문을 확인하세요."]));
    await new CodexAgentRuntime(f.ai).run(f.input);
    expect(JSON.parse(f.calls[1]!.prompt).toolResults[0].ok).toBe(false);
  });
  it("bounds tool loops", async () => {
    const f = fixture(Array.from({ length: 11 }, () => tool("list_career_records", {})));
    await expect(new CodexAgentRuntime(f.ai).run(f.input)).rejects.toThrow("limit");
    expect(f.input.records.list).toHaveBeenCalledTimes(10);
  });
  it("fails before model invocation when already cancelled", async () => {
    const f = fixture([answer]); f.controller.abort();
    await expect(new CodexAgentRuntime(f.ai).run(f.input)).rejects.toThrow("cancelled");
    expect(f.calls).toHaveLength(0);
  });
});
const fId = "00000000-0000-4000-8000-000000000002";
