import { interviewBasisKey, type BrewState, type InterviewQuestionBase, type InterviewSession } from "@expresso/contracts";
import { z } from "zod";

import { planningRecipe } from "./brew-materials-card";

/** 대화의 인터뷰에서 저장하는 질문의 상한. 세션 계약(`InterviewSessionSchema`)과 구성 생성이 읽는 질문 수가 6이다. */
export const INTERVIEW_QUESTION_LIMIT = 6;

/**
 * 대화의 「AI 대화」 카드가 읽는 것. 에이전트가 물을 수 있는 근거와 그 근거로 답을 저장했는지, 제작이 다음 단계로 넘어갔는지다.
 * 근거는 질문 생성이 보는 것과 같다(`interview-bases`) — 공고 요건 가운데 기록으로 확인되지 않은 것과 수치가 빠진 고른 기록.
 */
export const BrewInterviewCardSchema = z.strictObject({
  bases: z.array(z.strictObject({
    kind: z.enum(["requirement", "record"]),
    label: z.string().min(1).max(5_000),
    answered: z.boolean(),
  })),
  /** 답을 저장한 질문 수. 근거 목록에서 빠진 근거의 질문도 센다. */
  answered: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  /** 제작이 AI 대화 단계를 지난 뒤 이어지는 화면. 아직 이 단계면 null이다. */
  resumePath: z.string().min(1).max(300).nullable(),
});
export type BrewInterviewCardData = z.infer<typeof BrewInterviewCardSchema>;
export const BrewInterviewCardResponseSchema = z.strictObject({ data: BrewInterviewCardSchema });

/** 카드 데이터를 만든다. 근거와 답한 질문은 근거 키(`interviewBasisKey`)로 맞춘다 — 근거 글은 공고 · 기록을 고치면 바뀐다. */
export function interviewCard(brew: BrewState, bases: InterviewQuestionBase[], session: InterviewSession | null): BrewInterviewCardData {
  const answered = new Set((session?.questions ?? []).filter((question) => question.answered).map((question) => interviewBasisKey(question.basis)));
  return {
    bases: bases.map(({ basis, label }) => ({ kind: basis.type === "requirement" ? "requirement" : "record", label, answered: answered.has(interviewBasisKey(basis)) })),
    answered: session?.answeredCount ?? 0,
    limit: INTERVIEW_QUESTION_LIMIT,
    // 구성 잡이 도는 동안도 구성 단계다(`planningRecipe`).
    resumePath: (brew.status === "draft" || brew.status === "interviewing") && !planningRecipe(brew) ? null : `/brew/${brew.brewId}/design`,
  };
}
