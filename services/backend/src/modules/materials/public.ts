

export class MaterialsError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "MaterialsError";
    this.statusCode = statusCode;
  }
}
