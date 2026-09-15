import { MailDeliveryError, type MailMessage, type Mailer } from "./client.js";

/**
 * Resend HTTP API. https://resend.com/docs/api-reference/emails/send-email
 *
 * - `POST /emails`, `Authorization: Bearer`, 성공은 200 `{ id }`.
 * - `Idempotency-Key` 헤더(최대 256자, 24시간)로 같은 메일의 중복 발송을 막는다.
 * - 실패 응답은 `{ statusCode, name, message }`. `name`(예: `validation_error`,
 *   `rate_limit_exceeded`, `daily_quota_exceeded`)만 로그에 남기고 사용자에게는 보이지 않는다.
 */
export interface ResendMailerOptions {
  apiKey: string;
  from: string;
  timeoutMs: number;
  fetch?: typeof fetch;
  baseUrl?: string;
}

export class ResendMailer implements Mailer {
  readonly #options: Required<Omit<ResendMailerOptions, "fetch" | "baseUrl">> & { fetch: typeof fetch; baseUrl: string };

  constructor(options: ResendMailerOptions) {
    this.#options = { ...options, fetch: options.fetch ?? globalThis.fetch, baseUrl: options.baseUrl ?? "https://api.resend.com" };
  }

  async send(message: MailMessage): Promise<{ id: string }> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.#options.apiKey}`,
      "content-type": "application/json",
    };
    if (message.idempotencyKey) headers["idempotency-key"] = message.idempotencyKey;

    let response: Response;
    try {
      response = await this.#options.fetch(`${this.#options.baseUrl}/emails`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          from: this.#options.from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          ...(message.html ? { html: message.html } : {}),
        }),
        signal: AbortSignal.timeout(this.#options.timeoutMs),
      });
    } catch (error) {
      throw new MailDeliveryError(error instanceof Error && error.name === "TimeoutError" ? "timeout" : "network");
    }

    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const name = typeof body === "object" && body !== null && typeof (body as { name?: unknown }).name === "string"
        ? (body as { name: string }).name
        : `http_${response.status}`;
      throw new MailDeliveryError(name);
    }
    const id = typeof body === "object" && body !== null ? (body as { id?: unknown }).id : undefined;
    if (typeof id !== "string") throw new MailDeliveryError("malformed_response");
    return { id };
  }
}
