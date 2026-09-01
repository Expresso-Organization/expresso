import type { JobSourceProvider } from "@expresso/contracts";

import {
  createPacer, fetchText, htmlToMarkdown, mapWithLimit,
  type JobSourceAdapter, type RawPosting,
} from "./adapter.js";

/**
 * 고용24 채용정보 목록.
 *
 * `work24` 어댑터와 다른 곳이다. 그쪽은 **공공기관 채용정보**(재정경제부 API)만
 * 주고, 여기는 고용24 화면에 서는 채용정보 전체다. IT 직종(022~026)만 4,761건,
 * 전 직종은 132,677건이다(2026-09-01 실측).
 *
 *   목록  /wk/a/b/1200/retriveDtlEmpSrchList.do?occupation={직종코드}&currentPageNo=N&resultCnt=100
 *   상세  목록이 준 링크를 그대로 따라간다
 *
 * **`infoTypeCd`를 고정하지 않는다.** 공고마다 다르다 — 실측 100건에서
 * 사람인(CSI) 57 · 잡코리아(CJK) 21 · 인크루트(CIN) 12 · 중소벤처기업진흥공단
 * (KOS) 5 · 고용24 자체(VALIDATION) 4 · 공채속보(OEW) 1 이었다. `VALIDATION`으로
 * 박아 두면 90%가 빈 본문으로 들어온다.
 *
 * **담당자 개인정보는 읽지 않는다.** 상세 페이지에 담당자 연락처·이메일 칸이
 * 따로 있는데, 본문을 `직무내용` 구획에서만 꺼내므로 그 칸에 닿지 않는다.
 *
 * 본문이 얇다 — IT 공고 14건 표본에서 중앙값 441자였다(ATS 보드는 3,000~15,000자).
 * 연계로 실려 온 요약본이라 그렇다. 넓이를 얹는 자리지 깊이를 얹는 자리가 아니다.
 */

const ORIGIN = "https://www.work24.go.kr";
const LIST_PATH = "/wk/a/b/1200/retriveDtlEmpSrchList.do";

/**
 * 목록 한 장에 몇 건. 100이 상한이다(그 이상을 넣어도 100으로 잘린다).
 */
const PAGE_SIZE = 100;

/**
 * 며칠치를 볼 것인가.
 *
 * 목록은 **등록일 내림차순**이다(실측: 1쪽 오늘 · 10쪽 6일 전 · 40쪽 한 달 전).
 * 수집은 하루 한 번 돌므로 매번 전량을 훑을 이유가 없다 — 창을 벗어난 줄을
 * 만나면 거기서 멈춘다. 이미 들인 공고는 `dedupe_hash`에서 걸리므로 겹쳐 보는
 * 값은 요청 한 번뿐이다.
 *
 * 3일이면 실행을 이틀 걸러도 빠지는 공고가 없다. IT 직종 다섯을 한 출처로 묶어
 * 실측하면 이렇게 줄어든다.
 *
 *   창 없음   목록 48장 · 상세 4,761건
 *   7일       목록 14장 · 상세 1,344건
 *   3일       목록  6장 · 상세   529건
 */
const RECENT_DAYS = 3;

/**
 * 창이 무너졌을 때를 막는 뒷벽.
 *
 * 정렬이 바뀌거나 등록일을 못 읽으면 창이 듣지 않는다. 그때 48쪽을 끝까지
 * 넘기는 대신 던진다 — 조용히 자르는 것보다 실패로 남는 편이 낫다.
 *
 * 3일 창이 실측 6장에서 닫히므로 세 배 남짓 여유를 둔다. 여기 걸린다는 것은
 * 창이 듣지 않는다는 뜻이지, 공고가 많다는 뜻이 아니다.
 */
const MAX_PAGES = 20;

/**
 * 상세를 동시에 몇 개까지. 남의 서버이고, 정부 서비스다.
 */
const DETAIL_LANES = 2;

/**
 * 요청 사이 최소 간격.
 *
 * 동시성만 묶으면 응답이 빠를 때 초당 수십 번이 나간다. 이 값이 실제 상한을
 * 정한다 — 400ms면 초당 2.5번을 넘지 않는다. 목록 10장에 상세 1,000건이면
 * 한 번 도는 데 7분쯤 걸리고, 하루 한 번이라 그 정도가 맞다.
 */
const MIN_INTERVAL_MS = 400;

/** 검색 화면이 실제로 넘기는 값. 비우면 목록이 열 건만 온다. */
function listUrl(occupation: string, page: number): string {
  const query = new URLSearchParams({
    searchMode: "Y",
    sortField: "DATE",
    sortOrderBy: "DESC",
    siteClcd: "all",
    // 상용직. 일용직은 이 제품이 다루는 자리가 아니다.
    empTpGbcd: "1",
    academicGbnoEdu: "noEdu",
    benefitSrchAndOr: "O",
    resultCnt: String(PAGE_SIZE),
    currentPageNo: String(page),
    occupation,
  });
  return `${ORIGIN}${LIST_PATH}?${query}`;
}

export interface ListRow {
  wantedAuthNo: string;
  companyName: string;
  title: string;
  detailUrl: string;
  expiresAt: Date | null;
  /** 등록일. 목록이 이 순서로 내려온다 — 어디서 멈출지 정하는 값이다. */
  postedOn: string | null;
}

/**
 * 이스케이프를 푼다.
 *
 * **한 번으로 끝나지 않는다** — 목록의 제목이 `&amp;amp;`로 두 겹 실려 온다
 * (실측: `Tech Lead / Senior WPF 클라이언트 &amp;amp; 풀스택 개발자`). 한 번만
 * 풀면 화면에 `&amp;`가 그대로 선다. 다만 **세 겹까지만** 푼다 — 공고 글에
 * `&amp;`라고 적어 둔 경우까지 풀면 그건 원문을 고치는 것이다.
 */
function decode(value: string): string {
  let source = value;
  for (let pass = 0; pass < 3; pass += 1) {
    const next = source
      .replace(/&nbsp;/g, " ")
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
      // `&amp;`는 마지막이다 — 먼저 풀면 `&amp;lt;`가 `<`까지 가 버린다.
      .replace(/&amp;/g, "&");
    if (next === source) break;
    source = next;
  }
  return source;
}

/**
 * 목록 한 장에 줄이 몇 개 실렸나.
 *
 * `parseList`가 돌려준 수로 마지막 장을 가늠하면 **틀린다** — 상세 링크가 없는
 * 줄이 섞여 100줄짜리 장이 99건으로 파싱된다(실측). 그걸 "덜 찬 장"으로 읽으면
 * 첫 장에서 멈춰 버린다. 끝 판정은 표에 실린 줄 수로 한다.
 */

/**
 * 목록 한 장에서 줄을 꺼낸다.
 *
 * 체크박스가 `공고번호|정보구분|회사명|공고명`을 한 칸에 담아 둔다 — 화면의
 * 표를 헤아리는 것보다 이쪽이 흔들리지 않는다.
 */
export function countListRows(html: string): number {
  return html.split(/<tr id="list\d+">/).length - 1;
}

export function parseList(html: string): ListRow[] {
  const rows: ListRow[] = [];
  for (const chunk of html.split(/<tr id="list\d+">/).slice(1)) {
    const value = /id="chkboxWantedAuthNo\d+"\s+value="([^"]*)"/.exec(chunk)?.[1];
    const href = /href="(\/wk\/a\/b\/1500\/empDetailAuthView\.do\?[^"]+)"/.exec(chunk)?.[1];
    if (!value || !href) continue;

    const [wantedAuthNo, , companyName, title] = value.split("|");
    if (!wantedAuthNo || !companyName || !title) continue;

    // 마감일이 목록에 적혀 있다. 상세를 한 번 더 부를 이유가 없다.
    const due = /마감일\s*:\s*(\d{4})-(\d{2})-(\d{2})/.exec(chunk);
    const expiresAt = due
      ? new Date(`${due[1]}-${due[2]}-${due[3]}T23:59:59+09:00`)
      : null;

    const posted = /등록일\s*:\s*(\d{4}-\d{2}-\d{2})/.exec(chunk);

    rows.push({
      wantedAuthNo,
      companyName: decode(companyName).trim(),
      title: decode(title).trim(),
      detailUrl: ORIGIN + decode(href),
      expiresAt: expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : null,
      postedOn: posted?.[1] ?? null,
    });
  }
  return rows;
}

/**
 * 상세에서 직무내용만 꺼낸다.
 *
 * `div.fold`가 페이지에 둘 있는데 하나는 **담당자 개인정보 열람 주의사항**이다.
 * 그래서 구획 이름이 `직무내용`인 것만 집는다.
 */
export function parseBody(html: string): string | null {
  for (const match of html.matchAll(/<div class="fold">([\s\S]*?)<\/div>/g)) {
    const inner = match[1] ?? "";
    const label = /<strong[^>]*>([^<]+)<\/strong>/.exec(inner)?.[1]?.trim();
    if (label !== "직무내용") continue;
    return htmlToMarkdown(inner.replace(/<strong[^>]*>[\s\S]*?<\/strong>/, ""));
  }
  return null;
}

/** `<em class="tit">라벨</em> … <p>값</p>` 한 쌍을 읽는다. */
export function field(html: string, label: string): string | null {
  const pattern = new RegExp(
    `<em class="tit">\\s*${label}\\s*</em>[\\s\\S]*?<p>([\\s\\S]*?)</p>`,
  );
  const raw = pattern.exec(html)?.[1];
  if (!raw) return null;
  const value = decode(raw.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  return value ? value : null;
}

/** 붙는 세기를 부르는 쪽이 정할 수 있게 열어 둔다. 기본값이 안전한 값이다. */
export interface Work24WebOptions {
  /** 며칠치를 볼지. 기본 7일. */
  recentDays?: number;
  /** 요청 사이 최소 간격(ms). 기본 400ms — 초당 2.5번. */
  minIntervalMs?: number;
  /** 상세를 동시에 몇 개까지. 기본 2. */
  detailLanes?: number;
}

export class Work24WebAdapter implements JobSourceAdapter {
  readonly provider: JobSourceProvider = "work24web";
  readonly #recentDays: number;
  readonly #minIntervalMs: number;
  readonly #detailLanes: number;

  constructor(options: Work24WebOptions = {}) {
    this.#recentDays = options.recentDays ?? RECENT_DAYS;
    this.#minIntervalMs = options.minIntervalMs ?? MIN_INTERVAL_MS;
    this.#detailLanes = options.detailLanes ?? DETAIL_LANES;
  }

  /** `token`은 직종코드다. 여러 개면 `|`로 잇는다 — 화면이 쓰는 그대로. */
  async fetch(token: string): Promise<RawPosting[]> {
    const pace = createPacer(this.#minIntervalMs);
    const cutoff = new Date(Date.now() - this.#recentDays * 86_400_000)
      .toISOString().slice(0, 10);

    const rows: ListRow[] = [];
    let reachedCutoff = false;
    for (let page = 1; page <= MAX_PAGES && !reachedCutoff; page += 1) {
      await pace();
      const html = await fetchText(listUrl(token, page), 30_000);
      const onPage = countListRows(html);
      if (onPage === 0) break;

      for (const row of parseList(html)) {
        // 등록일을 못 읽은 줄은 남긴다 — 우리가 못 읽은 것을 "오래된 것"으로
        // 바꿔 말하면 그 공고는 영영 들어오지 않는다.
        if (row.postedOn !== null && row.postedOn < cutoff) { reachedCutoff = true; break; }
        rows.push(row);
      }
      // 표에 실린 줄로 끝을 가늠한다. 파싱된 수로 보면 한 줄만 빠져도
      // 마지막 장으로 오해한다.
      if (onPage < PAGE_SIZE) break;
      if (page === MAX_PAGES && !reachedCutoff) {
        // 창이 듣지 않았다. 정렬이 바뀌었거나 등록일을 못 읽고 있다.
        throw new Error(
          `occupation ${token}: ${this.#recentDays}일 창이 ${MAX_PAGES}장 안에서 닫히지 않았다`,
        );
      }
    }

    const built = await mapWithLimit(
      rows,
      this.#detailLanes,
      async (row): Promise<RawPosting | null> => {
        await pace();
        const detail = await fetchText(row.detailUrl, 30_000);
        const body = parseBody(detail);
        // 본문이 없는 공고가 흔하다 — 자사 채용 페이지로 넘기는 자리다.
        // 들이지 않는다. 요건을 뽑을 것이 없다.
        if (body === null) return null;

        return {
          externalId: row.wantedAuthNo,
          title: row.title.slice(0, 300),
          companyName: row.companyName.slice(0, 200),
          descriptionRaw: body,
          sourceUrl: row.detailUrl,
          location: field(detail, "지역")?.slice(0, 120) ?? null,
          employmentType: field(detail, "고용형태")?.slice(0, 60) ?? null,
          experienceLabel: field(detail, "경력")?.slice(0, 60) ?? null,
          // 고용24는 부서 칸이 없다. 짐작해서 채우지 않는다.
          team: null,
          expiresAt: row.expiresAt,
        };
      },
    );

    return built.filter((one): one is RawPosting => one !== null);
  }
}
