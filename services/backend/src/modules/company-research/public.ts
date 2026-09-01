

export class CompanyResearchError extends Error {
  readonly statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "CompanyResearchError";
    this.statusCode = statusCode;
  }
}
