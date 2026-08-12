import type { JobSourceProvider } from "@expresso/contracts";
import TurndownService from "turndown";

/**
 * 어댑터가 내놓는 공고 하나.
 *
 * 여기까지가 **바깥의 모양**이고, `job_posting`으로 옮기는 일은 수집 서비스가
 * 한다. 어댑터는 정규화하지 않는다 — 어느 출처든 같은 규칙으로 다듬어야
 * 나중에 출처를 바꿔도 공고가 달라지지 않는다.
 */
export interface RawPosting {
  /** 출처 안에서 이 공고를 가리키는 값. `external_id`의 뒷부분이 된다. */
  externalId: string;
  title: string;
  companyName: string;
  /** 요건을 뽑는 근거다. 짧으면 뽑을 것이 없다. */
  descriptionRaw: string;
  sourceUrl: string | null;
  location: string | null;
  employmentType: string | null;
  experienceLabel: string | null;
  team: string | null;
  expiresAt: Date | null;
}

/** 출처 하나를 읽는 방법. 프로바이더마다 하나씩. */
export interface JobSourceAdapter {
  readonly provider: JobSourceProvider;
  /**
   * `token`이 가리키는 출처의 공고를 모두 가져온다.
   *
   * 실패는 던진다 — 수집 서비스가 출처별로 받아 `last_error`에 적는다.
   * 한 출처가 죽어도 나머지는 계속 돌아야 한다.
   */
  fetch(token: string): Promise<RawPosting[]>;
}

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
    const next = decodeEntities(source);
    if (next === source) break;
    source = next;
  }

  return turndown
    .turndown(source)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 몇 겹으로 이스케이프된 마크업을 되돌린다. */
function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    // `&amp;`는 마지막이다 — 먼저 풀면 `&amp;lt;`가 `<`까지 가 버린다.
    .replace(/&amp;/g, "&");
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

/**
 * 바깥에서 읽어 올 때의 공통 규칙.
 *
 * 시간과 크기를 묶는다 — 출처가 느리거나 거대한 응답을 주면 수집 전체가
 * 그 하나에 붙잡힌다.
 */
export async function fetchJson(url: string, timeoutMs = 15_000): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json", "user-agent": USER_AGENT },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/** 우리가 누구인지 밝힌다. 막고 싶은 쪽이 막을 수 있어야 한다. */
export const USER_AGENT = "ExpressoBot/0.1 (+https://xpresso.me/bot)";
