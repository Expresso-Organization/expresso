

export class JobAnalysisNotFoundError extends Error {
  readonly statusCode = 404;
  constructor() {
    super("job analysis not found");
    this.name = "JobAnalysisNotFoundError";
  }
}
