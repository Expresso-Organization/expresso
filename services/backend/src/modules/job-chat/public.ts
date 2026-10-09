import type {
  JobChatMessage,
  JobChatSession,
} from "@expresso/contracts";

export class JobChatError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "JobChatError";
    this.statusCode = statusCode;
  }
}

export type BeginJobChatResult =
  | {
      kind: "completed";
      session: JobChatSession;
      userMessage: JobChatMessage;
      assistantMessage: JobChatMessage;
    }
  | {
      kind: "started";
      attemptId: string;
      userMessage: JobChatMessage;
      messages: JobChatMessage[];
    };