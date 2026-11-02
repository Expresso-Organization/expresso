import { z } from "zod";

import { TimestampSchema, UuidSchema } from "./common.js";
import { CareerWriteOperationSchema } from "./career-write-operation.js";

export const InterviewQuestionBasisSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("requirement"),
    requirementId: UuidSchema,
    coverage: z.enum(["partial", "missing"]),
    evidence: z.string().min(1).max(5_000),
  }),
  z.strictObject({
    type: z.literal("record_gap"),
    recordId: UuidSchema,
    gap: z.literal("metric"),
    evidence: z.string().min(1).max(300),
  }),
]);

export const InterviewQuestionSchema = z.strictObject({
  id: UuidSchema,
  order: z.number().int().nonnegative(),
  text: z.string().trim().min(1).max(200),
  basis: InterviewQuestionBasisSchema,
  /** 왜 이걸 묻는지(§8.3). 규칙으로 만든 옛 질문에는 없다. */
  rationale: z.string().max(300).nullable(),
  replacedFromId: UuidSchema.nullable(),
  skipped: z.boolean(),
  answered: z.boolean(),
  pendingOperation: CareerWriteOperationSchema.refine(value => value.producer === "interview", "Interview operation required").optional(),
});

export const InterviewAnswerSchema = z.strictObject({
  id: UuidSchema,
  questionId: UuidSchema,
  inputType: z.enum(["text", "voice"]),
  transcript: z.string().min(1).max(100_000),
  createdRecordId: UuidSchema,
  version: z.number().int().positive(),
  updatedAt: TimestampSchema,
});

export const InterviewSessionSchema = z.strictObject({
  id: UuidSchema,
  brewId: UuidSchema,
  status: z.enum(["open", "paused", "done"]),
  currentOrder: z.number().int().nonnegative(),
  answeredCount: z.number().int().nonnegative(),
  questionCount: z.number().int().min(3).max(6),
  questionsMayAdapt: z.literal(true),
  questions: z.array(InterviewQuestionSchema).min(3).max(6),
});

export const InterviewSessionResponseSchema = z.strictObject({
  data: InterviewSessionSchema,
});

export const SaveInterviewAnswerSchema = z.strictObject({
  inputType: z.enum(["text", "voice"]),
  transcript: z.string().trim().min(1).max(100_000),
});

export const InterviewAnswerResultSchema = z.strictObject({
  answer: InterviewAnswerSchema,
  recordChange: z.strictObject({
    type: z.enum(["created", "strengthened"]),
    recordId: UuidSchema,
    changedFields: z.array(z.string().min(1).max(100)).min(1),
    sourceQuote: z.string().min(1).max(100_000),
  }),
  progress: z.strictObject({
    answered: z.number().int().nonnegative(),
    total: z.number().int().min(3).max(6),
  }),
});

export type InterviewQuestionBasis = z.infer<typeof InterviewQuestionBasisSchema>;
export type SaveInterviewAnswer = z.infer<typeof SaveInterviewAnswerSchema>;

// ── §8.3 「질문 생성」 — 모델이 내는 초안 ─────────────────────────────

/**
 * 의문사. 이게 없으면 대개 예/아니오로 답할 수 있는 질문이다.
 *
 * §8.3이 이 계약에 붙인 금지 조항이 "예/아니오로 끝나는 질문 금지"인데,
 * 한국어에서 그건 어미가 아니라 **의문사의 유무**로 갈린다 —
 * "Kafka를 써 보셨나요?"와 "Kafka로 무엇을 만드셨나요?"의 차이다.
 */
const INTERROGATIVE = /무엇|무슨|어떤|어떻게|어떠한|어디|언제|누가|누구|왜|얼마나|몇/;

const QUESTION_SHAPE = {
  /** 물어볼 것 하나. 답하는 사람이 바로 이야기를 시작할 수 있어야 한다. */
  text: z.string().trim().min(5).max(200),
  /** 왜 이걸 묻는지. 01b가 질문 아래에 그대로 보여준다. */
  rationale: z.string().trim().min(1).max(300),
} as const;

/**
 * 질문 문장이 질문의 조건을 어긴 곳. 비어 있으면 통과다.
 *
 * 모양(Zod)이 아니라 업무 규칙이다 — 어긴 질문도 저장할 수 있는 모양이라, 출력을
 * 거절하지 않고 그 질문만 쓴 모델에게 고쳐 받는다(백엔드 `question-writer.ts`의 check).
 */
export function interviewQuestionProblems(text: string): string[] {
  const problems: string[] = [];
  if (!INTERROGATIVE.test(text)) {
    problems.push("예/아니오로 답할 수 있는 질문입니다 — 무엇 · 어떻게 · 왜로 묻습니다");
  }
  if ((text.match(/\?/g) ?? []).length !== 1) problems.push("한 번에 한 가지만 묻습니다 — 물음표는 하나입니다");
  return problems;
}

export const InterviewQuestionDraftSchema = z.strictObject({
  /** 프롬프트에서 준 근거 번호. 근거 없는 질문은 만들 수 없다. */
  basis: z.number().int().min(1).max(20),
  ...QUESTION_SHAPE,
});

/**
 * 세션 하나의 질문 수(`InterviewSessionSchema`)와 같은 3~6개다. 기능 명세서 T5.1.1 —
 * 배정할 자리가 모자라면 줄이되 최소 3개는 유지한다.
 */
export const InterviewQuestionDraftListSchema = z.strictObject({
  questions: z.array(InterviewQuestionDraftSchema).min(3).max(6),
});

/** 다시 묻기 — 같은 근거를 다른 각도에서 묻는다. */
export const InterviewQuestionRewriteSchema = z.strictObject(QUESTION_SHAPE);

export type InterviewQuestionDraft = z.infer<typeof InterviewQuestionDraftSchema>;
export type InterviewQuestionRewrite = z.infer<typeof InterviewQuestionRewriteSchema>;

export type InterviewAnswerResult = z.infer<typeof InterviewAnswerResultSchema>;
