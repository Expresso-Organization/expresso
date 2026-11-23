import type { AgentBrewInterviewState } from "../../platform/agent/runtime.js";

/** 첫 질문에 쓸 근거 하나를 정한다. 이미 답한 근거는 새 질문에서 제외한다. */
export function interviewFocus(bases: AgentBrewInterviewState["bases"], saved: AgentBrewInterviewState["saved"]) {
  const answered = new Set(saved.map(item => item.basis));
  const next = bases.find(item => !answered.has(item.index));
  return next ? { basis: next.index, topic: next.label, askFor: "이 요건과 관련해 실제로 수행한 작업 한 가지" } : null;
}
