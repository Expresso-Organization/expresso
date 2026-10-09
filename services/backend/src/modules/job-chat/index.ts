import type { JobChatService } from "./service.js";

export { JobChatService } from "./service.js";
export { JobChatError } from "./public.js";
export type { BeginJobChatResult } from "./public.js";

export type JobChatApi = Pick<
  JobChatService,
  | "createSession"
  | "listSessions"
  | "getSession"
  | "beginMessage"
  | "completeMessage"
  | "failMessage"
>;