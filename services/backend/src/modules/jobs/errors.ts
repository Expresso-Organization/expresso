export class JobMarketError extends Error {
  readonly statusCode: number;
  readonly publicDetails: Record<string, unknown> | undefined;

  constructor(
    statusCode: number,
    message: string,
    publicDetails?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "JobMarketError";
    this.statusCode = statusCode;
    this.publicDetails = publicDetails;
  }
}
