export class PreparationError extends Error {
  constructor(readonly statusCode: number, message: string) { super(message); this.name = "PreparationError"; }
}
