import { isProbabilityQuestion, probabilityAnswerIssues, PROBABILITY_FALLBACK } from "./answer-policy.js";
import { performance } from "node:perf_hooks";
import { AgentExecutionLimitsSchema, type AgentExecutionLimits } from "@expresso/contracts";
import type { AgentInput, AgentRuntime } from "./runtime.js";

// 모델에게 확정·배포 콜백을 주지 않습니다. 새 도구는 이 목록과 서버 동의 검사를 함께 추가해야 합니다.
export const TOOL_POLICY = {
  search_career_evidence: "read", search_job_postings: "read", list_career_records: "read",
  read_career_records: "read", read_preparation_plan: "read", record_requirement_review: "draft",
  record_gap_review: "draft", propose_new_record: "draft", propose_record_edit: "draft",
  propose_preparation_plan: "draft", propose_replan: "draft",
} as const;
export type AgentOperation = keyof typeof TOOL_POLICY | "model";
export class AgentExecutionError extends Error {
  constructor(readonly code: "POLICY_DENIED" | "TOOL_BUDGET" | "MODEL_BUDGET" | "INPUT_BUDGET" | "COST_BUDGET", message: string) { super(message); }
}
export interface AgentExecutionControl {
  readonly limits: AgentExecutionLimits;
  model(inputChars: number): Promise<void>;
  usage(costUsd: number | null): void;
}
export function assertAgentOperation(name: string): asserts name is keyof typeof TOOL_POLICY {
  if (!Object.hasOwn(TOOL_POLICY, name)) throw new AgentExecutionError("POLICY_DENIED", "승인·저장·배포는 별도 화면에서 확인해 주세요.");
}

/** 한 응답에서만 사용하는 예산입니다. 실패한 시도도 세며, 다른 사용자·응답과 공유하지 않습니다. */
export async function runAgentWithPolicy(runtime: AgentRuntime, input: AgentInput, options: {
  limits?: Partial<AgentExecutionLimits>;
  authorize(operation: AgentOperation): Promise<void>;
  report?(summary: Record<string, unknown>): void;
}): Promise<void> {
  const limits = AgentExecutionLimitsSchema.parse(options.limits ?? {});
  const question = input.messages.filter(message => message.role === "user").at(-1)?.text ?? "";
  const bufferProbabilityAnswer = isProbabilityQuestion(question);
  let answer = "", answerPolicyRejected = false;
  const started = performance.now();
  let toolCalls = 0, modelCalls = 0, inputChars = 0, costUsd = 0, unknownCostCalls = 0;
  let firstTextMs: number | null = null, outcome = "complete";
  let terminalError: AgentExecutionError | undefined;
  const stop = (error: AgentExecutionError): never => { terminalError = error; throw error; };
  const check = () => { if (terminalError) throw terminalError; if (input.signal.aborted) throw new Error("cancelled"); };
  const authorize = async (operation: AgentOperation) => { check(); await options.authorize(operation); check(); };
  const execution: AgentExecutionControl = {
    limits,
    async model(chars) {
      await authorize("model");
      if (++modelCalls > limits.maxModelCalls) stop(new AgentExecutionError("MODEL_BUDGET", "이번 요청의 AI 호출 한도에 도달했습니다. 질문을 나누어 다시 요청해 주세요."));
      inputChars += chars;
      if (inputChars > limits.maxInputChars) stop(new AgentExecutionError("INPUT_BUDGET", "이번 요청의 입력 예산에 도달했습니다. 자료를 줄여 다시 요청해 주세요."));
      if (costUsd >= limits.maxCostUsd) stop(new AgentExecutionError("COST_BUDGET", "이번 요청의 비용 한도에 도달했습니다."));
    },
    usage(cost) {
      if (cost === null || !Number.isFinite(cost) || cost < 0) unknownCostCalls++;
      else costUsd += cost;
      if (costUsd > limits.maxCostUsd) stop(new AgentExecutionError("COST_BUDGET", "이번 요청의 비용 한도에 도달했습니다."));
    },
  };
  const call = async <T>(name: keyof typeof TOOL_POLICY, work: () => Promise<T>): Promise<T> => {
    assertAgentOperation(name);
    await authorize(name);
    if (++toolCalls > limits.maxToolCalls) stop(new AgentExecutionError("TOOL_BUDGET", "이번 요청의 도구 실행 한도에 도달했습니다. 질문을 나누어 다시 요청해 주세요."));
    const at = performance.now(); let status = "complete";
    try { const result = await work(); await authorize(name); return result; }
    catch (error) { status = "failed"; throw error; }
    finally { options.report?.({ event: "agent.tool", operation: name, access: TOOL_POLICY[name], status, durationMs: Math.round(performance.now() - at) }); }
  };
  try {
    if (!input.userId) throw new AgentExecutionError("POLICY_DENIED", "로그인이 필요합니다.");
    await authorize("model");
    await runtime.run({ ...input, execution,
      records: { list: () => call("list_career_records", () => input.records.list()), read: ids => call("read_career_records", () => input.records.read(ids)) },
      ...(input.search ? { search: { career: args => call("search_career_evidence", () => input.search!.career(args)), jobs: args => call("search_job_postings", () => input.search!.jobs(args)) } } : {}),
      review: args => call("record_requirement_review", () => input.review(args)),
      gapReview: args => call("record_gap_review", () => input.gapReview(args)),
      draftRecord: args => call("propose_new_record", () => input.draftRecord(args)),
      propose: (id, args) => call("propose_record_edit", () => input.propose(id, args)),
      planDraft: args => call("propose_preparation_plan", () => input.planDraft(args)),
      replanDraft: args => call("propose_replan", () => input.replanDraft(args)),
      readPlan: id => call("read_preparation_plan", () => input.readPlan(id)),
      emit: async event => { check(); if (!bufferProbabilityAnswer && event.type === "text" && firstTextMs === null) firstTextMs = Math.round(performance.now() - started); if (bufferProbabilityAnswer && event.type === "text") { answer += event.text; if (answer.length > 64_000) stop(new AgentExecutionError("INPUT_BUDGET", "응답이 너무 길어 중단했습니다. 질문을 나누어 주세요.")); } else await input.emit(event); },
    });
    await authorize("model");
    if (bufferProbabilityAnswer && answer) {
      answerPolicyRejected = probabilityAnswerIssues(question, answer).length > 0;
      firstTextMs = Math.round(performance.now() - started);
      await input.emit({ type: "text", text: answerPolicyRejected ? PROBABILITY_FALLBACK : answer });
    }
  } catch (error) {
    // 공급자가 도구 오류를 일반 실행 오류로 감싸도 이미 확정된 예산 중단 사유를 보존합니다.
    const failure = terminalError ?? error;
    outcome = input.signal.aborted ? "cancelled" : failure instanceof AgentExecutionError ? failure.code : "failed";
    throw failure;
  }
  finally { options.report?.({ event: "agent.execution", outcome, durationMs: Math.round(performance.now() - started), firstTextMs, toolCalls, modelCalls, inputChars, costUsd, unknownCostCalls, answerPolicyRejected }); }
}
