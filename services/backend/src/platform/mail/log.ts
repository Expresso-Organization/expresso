import { randomUUID } from "node:crypto";

import type { MailMessage, Mailer } from "./client.js";

/**
 * `MAIL_PROVIDER=off`. 보내지 않고 로그에 남긴다.
 *
 * 본문(text)을 그대로 적는다 — 개발자가 로그에서 재설정 · 인증 링크를 복사해 열기 위한
 * 것이다. 운영에서는 이 어댑터를 쓰지 않으므로 토큰이 운영 로그에 남는 일은 없다.
 */
export class LogMailer implements Mailer {
  readonly #log: (line: string) => void;

  constructor(log: (line: string) => void = (line) => console.info(line)) {
    this.#log = log;
  }

  async send(message: MailMessage): Promise<{ id: string }> {
    const id = randomUUID();
    this.#log(JSON.stringify({ level: "info", message: "mail logged instead of sent", id, to: message.to, subject: message.subject, text: message.text }));
    return { id };
  }
}
