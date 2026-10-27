import type { RuntimeConfig } from "../../config/runtime-config.js";
import type { Mailer } from "./client.js";
import { LogMailer } from "./log.js";
import { ResendMailer } from "./resend.js";

/**
 * 설정에서 메일러를 만든다. AI 프로바이더와 같은 꼴이되 **끌 수 없다** — `off`는
 * 보내지 않는 어댑터일 뿐이고, 인증 메일을 만들어야 하는 자리는 언제나 메일러 하나를
 * 손에 든다.
 */
export function createMailer(config: RuntimeConfig): Mailer {
  const provider = config.mailProvider ?? "off";
  if (provider === "off") return new LogMailer();
  if (!config.resendApiKey) throw new Error("MAIL_PROVIDER=resend requires RESEND_API_KEY");
  return new ResendMailer({
    apiKey: config.resendApiKey,
    from: config.mailFrom ?? "Expresso <noreply@expresso.kr>",
    timeoutMs: config.mailTimeoutMs ?? 10_000,
  });
}
