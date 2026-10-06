export class JobCareerMatchError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "JobCareerMatchError";
    this.statusCode = statusCode;
  }
}