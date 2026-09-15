import { describe, expect, it } from "vitest";

import { MailDeliveryError } from "./client.js";
import { ResendMailer } from "./resend.js";

const message = { to: "person@example.com", subject: "제목", text: "본문", idempotencyKey: "token-1" };

function mailer(handler: (input: string, init: RequestInit) => Response | Promise<Response>) {
  return new ResendMailer({
    apiKey: "re_test",
    from: "Expresso <noreply@expresso.kr>",
    timeoutMs: 50,
    fetch: ((input: string | URL | Request, init?: RequestInit) => Promise.resolve(handler(String(input), init ?? {}))) as typeof fetch,
  });
}

describe("ResendMailer", () => {
  it("보내는 요청의 주소 · 인증 · 멱등 키 · 본문을 Resend 형식으로 만든다", async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const result = await mailer((url, init) => {
      seen = { url, init };
      return new Response(JSON.stringify({ id: "49a3999c" }), { status: 200 });
    }).send(message);

    expect(result).toEqual({ id: "49a3999c" });
    expect(seen?.url).toBe("https://api.resend.com/emails");
    expect(seen?.init.method).toBe("POST");
    const headers = seen?.init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer re_test");
    expect(headers["idempotency-key"]).toBe("token-1");
    expect(JSON.parse(String(seen?.init.body))).toEqual({
      from: "Expresso <noreply@expresso.kr>",
      to: ["person@example.com"],
      subject: "제목",
      text: "본문",
    });
  });

  it("거절 응답의 name 을 사유로 남기고 사용자용 메시지는 고정한다", async () => {
    const error = await mailer(() => new Response(JSON.stringify({ statusCode: 422, name: "validation_error", message: "bad" }), { status: 422 }))
      .send(message).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(MailDeliveryError);
    expect((error as MailDeliveryError).reason).toBe("validation_error");
    expect((error as MailDeliveryError).message).toBe("mail delivery failed");
  });

  it("시간 안에 답이 없으면 timeout 으로 실패한다", async () => {
    const slow = new ResendMailer({
      apiKey: "re_test",
      from: "Expresso <noreply@expresso.kr>",
      timeoutMs: 20,
      fetch: ((_input: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      })) as typeof fetch,
    });
    const error = await slow.send(message).catch((caught: unknown) => caught);
    expect((error as MailDeliveryError).reason).toBe("timeout");
  });
});
