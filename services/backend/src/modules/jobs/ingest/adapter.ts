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
   * `displayName`은 **회사 이름이 응답에 없을 때만** 쓴다. Lever는 회사 이름을
   * 아예 주지 않고 Greenhouse도 `company_name`이 비는 보드가 있는데, 그때
   * `token`으로 메우면 화면에 `zoyi` 같은 슬러그가 회사 이름으로 선다.
   *
   * 실패는 던진다 — 수집 서비스가 출처별로 받아 `last_error`에 적는다.
   * 한 출처가 죽어도 나머지는 계속 돌아야 한다.
   */
  fetch(token: string, displayName: string): Promise<RawPosting[]>;
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

/**
 * 글로 오는 출처를 읽는다.
 *
 * 보드가 JSON API를 열어 두지 않고 자기 채용 페이지만 세워 둔 곳이 있다
 * (그리팅). 그런 곳은 페이지를 받아 안에 실린 데이터를 꺼내야 한다.
 */
export async function fetchText(url: string, timeoutMs = 20_000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "text/html,application/json", "user-agent": USER_AGENT },
    });
    if (!response.ok) throw new HttpError(response.status, retryAfterMs(response));
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 상태 코드를 들고 다니는 실패.
 *
 * `HTTP 503` 같은 문자열로 뭉개면 **막힌 것과 그냥 실패한 것을 가를 수 없다.**
 * 상대가 밀어내는 중이면 계속 두드리는 대신 멈춰야 한다.
 */
export class HttpError extends Error {
  constructor(readonly status: number, readonly retryAfterMs: number | null = null) {
    super(`HTTP ${status}`);
    this.name = "HttpError";
  }

  /** 상대가 "그만 보내라"고 말한 것인가. */
  get isBackpressure(): boolean {
    return this.status === 429 || this.status === 503 || this.status === 509;
  }
}

/** `Retry-After`는 초 또는 날짜로 온다. 둘 다 읽는다. */
function retryAfterMs(response: Response): number | null {
  const raw = response.headers.get("retry-after");
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const at = Date.parse(raw);
  return Number.isNaN(at) ? null : Math.max(0, at - Date.now());
}

/**
 * 요청 사이의 최소 간격을 지킨다.
 *
 * **동시성 제한만으로는 폭주를 막지 못한다.** 레인 셋이 각각 50ms 만에 끝나면
 * 초당 60번을 던진다. 남의 서버가 보는 것은 우리의 레인 수가 아니라 초당 몇
 * 번이냐다. 시작 시각을 줄 세워 그 수를 묶는다.
 */
export function createPacer(minIntervalMs: number): () => Promise<void> {
  let next = 0;
  return async () => {
    const now = Date.now();
    const at = Math.max(now, next);
    next = at + minIntervalMs;
    if (at > now) await new Promise((resolve) => setTimeout(resolve, at - now));
  };
}

/**
 * 한 번에 몇 개까지만 겹쳐 부른다.
 *
 * 간격을 두는 일은 `createPacer`가 맡는다 — 둘을 함께 써야 순간 폭주와 총량이
 * 같이 잡힌다.
 *
 * 공고 하나가 페이지 하나인 보드가 있어서(그리팅) 한 출처를 읽는 데 수십~수백
 * 번을 부른다. 전부 한꺼번에 던지면 남의 서버에 순간 부하를 주고 우리도 막힌다.
 * 실패한 항목은 `null`로 남기고 나머지는 계속 간다 — 공고 하나 때문에 보드
 * 전체를 잃지 않는다.
 */
export async function mapWithLimit<In, Out>(
  items: readonly In[],
  limit: number,
  run: (item: In) => Promise<Out>,
): Promise<(Out | null)[]> {
  const results: (Out | null)[] = new Array(items.length).fill(null);
  let cursor = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      try {
        results[index] = await run(items[index] as In);
      } catch (error) {
        // 상대가 밀어내는 중이면 나머지도 같은 답을 받는다. 끝까지 두드려
        // 놓고 "몇 건 모았다"고 적는 대신, 출처 하나를 통째로 실패로 남긴다.
        if (error instanceof HttpError && error.isBackpressure) throw error;
        results[index] = null;
      }
    }
  });
  await Promise.all(lanes);
  return results;
}
