import TurndownService from "turndown";

import { decodeHtmlEntities } from "./entities.js";

/**
 * HTML을 **마크다운**으로 옮긴다.
 *
 * 평문으로 눌러 버리면 안 된다. 실측한 공고 하나가 `h3` 9개 · `h4` 5개 ·
 * 목록 32항목 · 강조 6개로 짜인 문서였는데, 태그를 다 벗기면 "자격 요건"이라는
 * 제목과 그 아래 항목이 **같은 굵기의 한 덩어리**가 된다. 사람도 못 읽고,
 * 요건 추출도 어디부터가 요건인지 알 수 없다.
 *
 * HTML을 그대로 담지 않는 이유는 `description_raw`가 **근거 구간의 좌표계**이기
 * 때문이다 — 요건의 `source_span.start/end`가 이 글의 문자 위치를 가리키므로,
 * 마크업을 담으면 근거가 태그를 가리킨다. 마크다운은 글자라서 그 문제가 없다.
 */
const turndown = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  emDelimiter: "*",
});

// 채용 페이지에 흔한 껍데기는 글이 아니다.
turndown.remove(["script", "style", "nav", "footer", "form"]);

export function htmlToMarkdown(html: string): string {
  // Greenhouse는 본문을 **이스케이프해서** 준다(`&lt;p&gt;`). 그대로 넘기면
  // turndown이 태그를 못 보고 글자로 옮긴다 — 먼저 풀어야 마크업이 마크업이다.
  // 몇 겹으로 인코딩돼 오는 것이 있어(실측에 `&amp;amp;amp;`까지 있었다) 더
  // 풀리지 않을 때까지 푼다. 다만 **세 겹까지만** — 공고 글에 `&amp;`라고
  // 적혀 있는 경우까지 풀면 그건 원문을 고치는 것이다.
  let source = html;
  for (let pass = 0; pass < 3; pass += 1) {
    const next = decodeHtmlEntities(source);
    if (next === source) break;
    source = next;
  }

  return turndown
    .turndown(source)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 마크다운을 원하지 않는 자리를 위해. 기호만 걷어낸다. */
export function htmlToText(html: string): string {
  return htmlToMarkdown(html)
    .replace(/^#{1,6} /gm, "")
    // turndown은 항목 기호 뒤를 네 칸으로 맞춘다(`-   `). 평문에서는 그 여백이
    // 의미가 없다.
    .replace(/^[-*]\s+/gm, "• ")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\[(.+?)\]\([^)]*\)/g, "$1")
    .replace(/^-{3,}$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
