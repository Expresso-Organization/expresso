import type { MailMessage } from "../../platform/mail/client.js";

/**
 * 인증 메일 두 통의 문안.
 *
 * §13 — 메일도 다음 행동으로 끝난다. 링크 하나, 유효 시간, 내가 요청하지 않았을 때
 * 할 일. 본문의 기준은 text이고 HTML은 같은 문장을 꾸민 것이다.
 */
export interface AuthMailLinks {
  appBaseUrl: string;
}

// 색은 웹 토큰(`tokens.css`)에서 가져온다 — ink-900 · espresso · slate-500. 메일은 CSS 변수를
// 못 읽어 값을 적지만, 출처는 그 파일 하나다.
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

function layout(title: string, paragraphs: string[], action: { href: string; label: string }, footer: string): string {
  const body = paragraphs.map((text) => `<p style="margin:0 0 12px;line-height:1.7">${escapeHtml(text)}</p>`).join("");
  return [
    `<div style="font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Pretendard',sans-serif;color:#16223a;max-width:520px;margin:0 auto;padding:32px 24px">`,
    `<p style="margin:0 0 20px;font-weight:700;letter-spacing:.02em">Expresso</p>`,
    `<h1 style="margin:0 0 16px;font-size:20px;line-height:1.4">${escapeHtml(title)}</h1>`,
    body,
    `<p style="margin:20px 0"><a href="${escapeHtml(action.href)}" style="display:inline-block;background:#9a4030;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600">${escapeHtml(action.label)}</a></p>`,
    `<p style="margin:0 0 12px;font-size:13px;line-height:1.7;color:#5a6b87">버튼이 눌리지 않으면 이 주소를 브라우저에 붙여 넣으십시오.<br>${escapeHtml(action.href)}</p>`,
    `<p style="margin:20px 0 0;font-size:13px;line-height:1.7;color:#5a6b87">${escapeHtml(footer)}</p>`,
    `</div>`,
  ].join("");
}

export function passwordResetMail(to: string, token: string, links: AuthMailLinks, ttlMinutes: number): MailMessage {
  const href = `${links.appBaseUrl}/login/reset?token=${encodeURIComponent(token)}`;
  const title = "비밀번호를 다시 정하십시오";
  const paragraphs = [
    `Expresso 계정(${to})의 비밀번호 재설정을 요청하셨습니다.`,
    `아래 버튼을 누르고 새 비밀번호를 정하십시오. 링크는 ${ttlMinutes}분 동안 한 번만 쓸 수 있습니다.`,
  ];
  const footer = "요청한 적이 없다면 이 메일은 무시하셔도 됩니다. 비밀번호는 바뀌지 않습니다.";
  return {
    to,
    subject: "[Expresso] 비밀번호 재설정",
    text: [title, "", ...paragraphs, "", href, "", footer].join("\n"),
    html: layout(title, paragraphs, { href, label: "새 비밀번호 정하기" }, footer),
  };
}

export function emailVerificationMail(to: string, token: string, links: AuthMailLinks, ttlHours: number): MailMessage {
  const href = `${links.appBaseUrl}/verify-email?token=${encodeURIComponent(token)}`;
  const title = "이메일 주소를 확인해 주십시오";
  const paragraphs = [
    `이 주소(${to})로 Expresso에 가입하셨습니다.`,
    `아래 버튼을 누르면 확인이 끝나고 포트폴리오를 공개 주소에 올릴 수 있습니다. 링크는 ${ttlHours}시간 동안 유효합니다.`,
  ];
  const footer = "가입한 적이 없다면 이 메일은 무시하셔도 됩니다. 아무 일도 일어나지 않습니다.";
  return {
    to,
    subject: "[Expresso] 이메일 주소 확인",
    text: [title, "", ...paragraphs, "", href, "", footer].join("\n"),
    html: layout(title, paragraphs, { href, label: "이메일 확인" }, footer),
  };
}
