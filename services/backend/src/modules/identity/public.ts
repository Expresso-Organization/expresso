import type { AuthenticatedUser, Signup } from "@expresso/contracts";

/**
 * 서비스가 받는 가입 입력. HTTP 계약(`SignupSchema`)은 `termsVersion`을 필수로 요구해
 * 동의 없는 가입을 400으로 막는다. 서비스 층에서는 선택이다 — 통합 테스트가 계정을
 * 만드는 자리가 수십 곳이고, 거기서는 동의 기록이 검증 대상이 아니다. 값이 오면 기록한다.
 */
export type SignupInput = Omit<Signup, "termsVersion"> & { termsVersion?: Signup["termsVersion"] | undefined };

export interface IdentityPrincipal {
  sessionId: string;
  user: AuthenticatedUser;
}

export interface IssueIdentitySessionInput {
  userId: string;
  /** 로그인 상태 유지. 생략하면 켬 — `SESSION_POLICY.persistent`로 발급한다. */
  persistent?: boolean | undefined;
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
