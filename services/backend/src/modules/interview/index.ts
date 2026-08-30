import type { InterviewService as LegacyInterviewService } from "./legacy-mysql-service.js";
export { InterviewService } from "./service.js";
export { MongoInterviewService } from "./service.js";
export type InterviewApi = Pick<LegacyInterviewService, keyof LegacyInterviewService>;
export { InterviewError } from "./public.js";
