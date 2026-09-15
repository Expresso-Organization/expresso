/**
 * 메일 발송 어댑터의 계약.
 *
 * 인증 메일(재설정 · 인증)은 사용자가 끌 수 없는 메일이라 `engagement`의 알림 공급자와
 * 다른 자리에 둔다. 공급자는 이 인터페이스 하나만 구현하고, 어느 것을 쓰는지는
 * `MAIL_PROVIDER`가 정한다(`create-mailer.ts`).
 */
export interface MailMessage {
  to: string;
  subject: string;
  /** 본문의 기준은 text다. HTML은 같은 내용을 꾸민 것이라 빠져도 뜻이 같아야 한다. */
  text: string;
  html?: string;
  /**
   * 같은 메일을 두 번 보내지 않게 하는 열쇠. 토큰 ID를 쓴다 — 타임아웃 뒤 사용자가
   * 다시 눌러도 공급자가 같은 요청으로 본다.
   */
  idempotencyKey?: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<{ id: string }>;
}

/** 공급자가 거절했거나 시간 안에 답하지 않았다. `reason`은 로그용이고 사용자에게는 보이지 않는다. */
export class MailDeliveryError extends Error {
  readonly reason: string;
  constructor(reason: string, message = "mail delivery failed") {
    super(message);
    this.name = "MailDeliveryError";
    this.reason = reason;
  }
}
