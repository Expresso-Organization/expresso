export class CareerGapError extends Error {
  constructor(readonly statusCode: number, message: string) { super(message); this.name = "CareerGapError"; }
}
