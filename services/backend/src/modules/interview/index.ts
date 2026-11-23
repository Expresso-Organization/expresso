import type { InterviewAnswerResult, InterviewQuestionBase, InterviewQuestionBasis, InterviewSession } from "@expresso/contracts";
import type { InterviewService as LegacyInterviewService } from "./legacy-mysql-service.js";
export { InterviewService } from "./service.js";
export { MongoInterviewService } from "./service.js";
/** 옛 MySQL 구현의 메서드에 Mongo 구현에만 있는 것을 더한다. */
export type InterviewApi = Pick<LegacyInterviewService, keyof LegacyInterviewService> & {
  questionBases(userId: string, brewId: string): Promise<InterviewQuestionBase[]>;
  /** 에이전트 대화에서 여는 인터뷰. 질문 0개의 세션으로 시작한다. */
  openConversation(userId: string, brewId: string): Promise<InterviewSession>;
  conversationState(userId: string, brewId: string): Promise<{ bases: InterviewQuestionBase[]; session: InterviewSession | null }>;
  saveConversationAnswer(userId: string, brewId: string, input: { basis: InterviewQuestionBasis; question: string; transcript: string; recordId?: string }, idempotencyKey: string): Promise<InterviewAnswerResult>;
};
export { InterviewError } from "./public.js";
