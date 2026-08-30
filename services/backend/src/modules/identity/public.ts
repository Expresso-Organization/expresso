import type { AuthenticatedUser } from "@expresso/contracts";

export interface IdentityPrincipal {
  sessionId: string;
  user: AuthenticatedUser;
}

export interface IssueIdentitySessionInput {
  userId: string;
  ttlMs?: number;
}

export class IdentityError extends Error {
  readonly statusCode: number;
  /** 응답의 `error.details`로 나간다. 화면이 다음 행동을 고를 수 있을 때만 채운다. */
  readonly publicDetails: Record<string, unknown> | undefined;

  constructor(
    statusCode: number,
    message: string,
    publicDetails?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "IdentityError";
    this.statusCode = statusCode;
    this.publicDetails = publicDetails;
  }
}
