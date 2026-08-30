

export class RecipeError extends Error {
  readonly statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message); this.name = "RecipeError"; this.statusCode = statusCode;
  }
}
