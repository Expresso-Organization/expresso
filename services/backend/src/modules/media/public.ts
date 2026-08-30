

export class MediaError extends Error {
  readonly statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "MediaError";
    this.statusCode = statusCode;
  }
}
