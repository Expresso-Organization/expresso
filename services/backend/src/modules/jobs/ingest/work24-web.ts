import type { JobSourceProvider } from "@expresso/contracts";

import {
  fetchText, htmlToMarkdown, mapWithLimit,
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
 * 한 출처가 넘길 목록 장수의 상한.
 *
 * 50장이면 5,000건이라 IT 직종(4,761건)은 통째로 들어온다. 여기에 걸린다는
 * 것은 **한 출처에 너무 넓은 직종을 묶었다**는 뜻이다 — 조용히 자르는 대신
 * 던져서 출처를 쪼개게 한다. 전 직종(132,677건)을 한 줄로 두면 안 된다.
 */
const MAX_PAGES = 50;

/** 상세를 동시에 몇 개까지. 남의 서버이고, 정부 서비스다. */
const DETAIL_LANES = 3;

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
 * 목록 한 장에서 줄을 꺼낸다.
 *
 * 체크박스가 `공고번호|정보구분|회사명|공고명`을 한 칸에 담아 둔다 — 화면의
 * 표를 헤아리는 것보다 이쪽이 흔들리지 않는다.
 */
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

    rows.push({
      wantedAuthNo,
      companyName: decode(companyName).trim(),
      title: decode(title).trim(),
      detailUrl: ORIGIN + decode(href),
      expiresAt: expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : null,
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

export class Work24WebAdapter implements JobSourceAdapter {
  readonly provider: JobSourceProvider = "work24web";

  /** `token`은 직종코드다. 여러 개면 `|`로 잇는다 — 화면이 쓰는 그대로. */
  async fetch(token: string): Promise<RawPosting[]> {
    const rows: ListRow[] = [];
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const found = parseList(await fetchText(listUrl(token, page), 30_000));
      if (found.length === 0) break;
      rows.push(...found);
      if (found.length < PAGE_SIZE) break;
      if (page === MAX_PAGES) {
        throw new Error(
          `occupation ${token} exceeds ${MAX_PAGES * PAGE_SIZE} postings — split the source`,
        );
      }
    }

    const built = await mapWithLimit(
      rows,
      DETAIL_LANES,
      async (row): Promise<RawPosting | null> => {
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
