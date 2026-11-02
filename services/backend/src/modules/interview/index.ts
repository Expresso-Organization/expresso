import type { InterviewService as LegacyInterviewService } from "./legacy-mysql-service.js";
export { InterviewService } from "./service.js";
export { MongoInterviewService } from "./service.js";
export interface InterviewApi extends Pick<LegacyInterviewService, keyof LegacyInterviewService> {
  saveAnswerOperation?: import("./product-career-integration.js").InterviewProductCareerIntegration["saveAnswerOperation"];
  cleanupAnswerOperation?: (userId: string, source: import("./product-career-integration.js").InterviewCleanupSource) => Promise<void>;
}
export { InterviewProductCareerIntegration, InterviewCleanupSourceSchema } from "./product-career-integration.js";
export type { InterviewAnswerOperationResult, InterviewCleanupSource, InterviewProductCareerOptions } from "./product-career-integration.js";
export { InterviewError } from "./public.js";

export { PreparedInterviewCareerWriter } from "./prepared-career-writer.js";
