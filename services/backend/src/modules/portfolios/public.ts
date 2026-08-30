

/**
 * 포트폴리오 읽기.
 *
 * 소유자가 자기 포트폴리오를 읽는 경로다. 편집 제안 흐름은
 * `portfolio-editing`이, 공개 배포본 조회는 `publishing`이 소유한다.
 */

export class PortfolioReadError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "PortfolioReadError";
    this.statusCode = statusCode;
  }
}
