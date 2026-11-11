import type { InterviewQuestionBasis } from "@expresso/contracts";

/** 질문이 붙은 근거의 종류. 대화 화면의 근거 패널과 대기 중 근거 목록이 같이 쓴다. */
export function basisKind(basis: InterviewQuestionBasis): string {
  if (basis.type === "record_gap") return "기록 · 수치가 빠짐";
  return basis.coverage === "missing" ? "공고 요건 · 아직 못 채움" : "공고 요건 · 일부만 채움";
}
