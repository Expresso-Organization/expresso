import { expect, it, vi } from "vitest";
import { runAgentWithPolicy, assertAgentOperation } from "./execution-policy.js";
import type { AgentInput, AgentRuntime } from "./runtime.js";
function fixture() {
  const controller = new AbortController(), report = vi.fn(), authorize = vi.fn(async () => {});
  const input: AgentInput = { userId: "owner", messages: [], context: [], signal: controller.signal, emit: vi.fn(async () => {}),
    records: { list: vi.fn(async () => ({ categories: [], records: [] })), read: vi.fn(async () => []) },
    propose: vi.fn(), review: vi.fn(), draftRecord: vi.fn(), gapReview: vi.fn(), planDraft: vi.fn(), replanDraft: vi.fn(), readPlan: vi.fn() };
  return { input, controller, report, authorize };
}
it.each(["apply", "deploy", "save_record", "__proto__", "constructor"])("확정 도구 %s를 허용하지 않는다", name => { expect(() => assertAgentOperation(name)).toThrow(); });
it("동의 거절은 실행 전에 막는다", async () => {
  const f = fixture(), run = vi.fn(); f.authorize.mockRejectedValue(new Error("consent"));
  await expect(runAgentWithPolicy({ run }, f.input, f)).rejects.toThrow("consent"); expect(run).not.toHaveBeenCalled();
});
it("도구 한도에 도달하면 두 번째 읽기를 실행하지 않는다", async () => {
  const f = fixture(); const runtime: AgentRuntime = { run: async input => { await input.records.list(); await input.records.list(); } };
  await expect(runAgentWithPolicy(runtime, f.input, { ...f, limits: { maxToolCalls: 1 } })).rejects.toMatchObject({ code: "TOOL_BUDGET" });
  expect(f.input.records.list).toHaveBeenCalledOnce();
});
it("동의 철회 후 후속 도구를 차단한다", async () => {
  const f = fixture(); let revoked = false;
  const runtime: AgentRuntime = { run: async input => { await input.records.list(); revoked = true; await input.readPlan("plan"); } };
  await expect(runAgentWithPolicy(runtime, f.input, { ...f, authorize: async () => { if (revoked) throw new Error("revoked"); } })).rejects.toThrow("revoked");
  expect(f.input.readPlan).not.toHaveBeenCalled();
});
it("실패한 도구 시도도 한도에 포함한다", async () => {
  const f = fixture(); vi.mocked(f.input.records.list).mockRejectedValue(new Error("offline"));
  const runtime: AgentRuntime = { run: async input => { await input.records.list().catch(() => {}); await input.records.list(); } };
  await expect(runAgentWithPolicy(runtime, f.input, { ...f, limits: { maxToolCalls: 1 } })).rejects.toMatchObject({ code: "TOOL_BUDGET" });
  expect(f.input.records.list).toHaveBeenCalledOnce();
});
it.each(["model", "input", "cost"])("%s 예산을 초과하면 중단한다", async kind => {
  const f = fixture();
  const runtime: AgentRuntime = { run: async input => {
    await input.execution!.model(kind === "input" ? 1001 : 1);
    if (kind === "cost") input.execution!.usage(2);
    else await input.execution!.model(1);
  } };
  await expect(runAgentWithPolicy(runtime, f.input, { ...f, limits: { maxModelCalls: 1, maxInputChars: 1000 } })).rejects.toThrow();
});
it("예산과 로그는 요청별로 분리되고 원문·사용자 ID를 기록하지 않는다", async () => {
  const f = fixture(), runtime: AgentRuntime = { run: async input => { await input.execution!.model(10); input.execution!.usage(null); await input.records.list(); await input.emit({ type: "text", text: "비공개 본문" }); } };
  await runAgentWithPolicy(runtime, f.input, f); await runAgentWithPolicy(runtime, f.input, f);
  const rows = f.report.mock.calls.map(args => args[0]);
  expect(rows.filter(row => row.event === "agent.execution")).toEqual([expect.objectContaining({ modelCalls: 1, unknownCostCalls: 1 }), expect.objectContaining({ modelCalls: 1 })]);
  expect(JSON.stringify(rows)).not.toContain("비공개"); expect(JSON.stringify(rows)).not.toContain("owner");
});
it("취소 후 도구·출력을 반영하지 않는다", async () => {
  const f = fixture(); const runtime: AgentRuntime = { run: async input => { f.controller.abort(); await input.records.list(); } };
  await expect(runAgentWithPolicy(runtime, f.input, f)).rejects.toThrow("cancelled"); expect(f.input.records.list).not.toHaveBeenCalled();
});
it("합격률 수치가 조각으로 와도 공개 전에 안전 안내로 바꾼다", async () => {
  const f = fixture(); f.input.messages = [{ id: "question", role: "user", text: "내 합격률은?", tools: [], createdAt: "2026-11-10T00:00:00Z" }];
  await runAgentWithPolicy({ run: async input => { await input.emit({ type: "text", text: "합격률은 8" }); await input.emit({ type: "text", text: "0%입니다." }); } }, f.input, f);
  expect(f.input.emit).toHaveBeenCalledOnce(); expect(vi.mocked(f.input.emit).mock.calls[0]![0]).toMatchObject({ text: expect.stringContaining("숫자로 산출할 수 없습니다") });
});
it("합격률 외의 일반 응답은 스트리밍을 유지한다", async () => {
  const f = fixture(); await runAgentWithPolicy({ run: async input => { await input.emit({ type: "text", text: "첫 조각" }); expect(f.input.emit).toHaveBeenCalledOnce(); } }, f.input, f);
});

it("공급자가 도구 예산 오류를 잡아도 성공 응답으로 바꾸지 못한다", async () => {
 const f = fixture();
 const runtime: AgentRuntime = { run: async input => { await input.records.list(); await input.records.list().catch(() => {}); } };
 await expect(runAgentWithPolicy(runtime, f.input, { ...f, limits: { maxToolCalls: 1 } })).rejects.toMatchObject({ code: "TOOL_BUDGET" });
});

it("공급자가 한도 오류를 일반 오류로 감싸도 원래 중단 사유를 보존한다", async () => {
 const f = fixture();
 const runtime: AgentRuntime = { run: async input => {
  await input.records.list();
  try { await input.records.list(); } catch { throw new Error("agent execution failed"); }
 } };
 await expect(runAgentWithPolicy(runtime, f.input, { ...f, limits: { maxToolCalls: 1 } })).rejects.toMatchObject({ code: "TOOL_BUDGET", message: expect.stringContaining("도구 실행 한도") });
 expect(f.report).toHaveBeenLastCalledWith(expect.objectContaining({ outcome: "TOOL_BUDGET" }));
});
