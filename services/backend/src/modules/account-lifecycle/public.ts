

export class AccountLifecycleError extends Error {
  readonly statusCode: number;
  constructor(statusCode: number, message: string) { super(message); this.name = "AccountLifecycleError"; this.statusCode = statusCode; }
}
