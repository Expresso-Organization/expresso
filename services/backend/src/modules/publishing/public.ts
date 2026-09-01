

export class PublishingError extends Error {
  readonly statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "PublishingError";
    this.statusCode = statusCode;
  }
}
