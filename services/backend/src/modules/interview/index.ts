import type { InterviewQuestionBase } from "@expresso/contracts";
import type { InterviewService as LegacyInterviewService } from "./legacy-mysql-service.js";
export { InterviewService } from "./service.js";
export { MongoInterviewService } from "./service.js";
/** 옛 MySQL 구현의 메서드에 Mongo 구현에만 있는 것을 더한다. */
export type InterviewApi = Pick<LegacyInterviewService, keyof LegacyInterviewService> & {
  questionBases(userId: string, brewId: string): Promise<InterviewQuestionBase[]>;
};
export { InterviewError } from "./public.js";
