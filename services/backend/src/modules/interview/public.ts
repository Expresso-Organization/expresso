

export class InterviewError extends Error {
  readonly statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "InterviewError";
    this.statusCode = statusCode;
  }
}
