import type { JobSourceProvider } from "@expresso/contracts";

import {
  createPacer, fetchText, htmlToMarkdown, mapWithLimit,
  type FetchResult, type FetchScope, type JobSourceAdapter,
  type PostingRefresh, type RawPosting,
} from "./adapter.js";

/**
 * 그리팅(greetinghr) 채용 보드.
 *
 * 국내 스타트업이 가장 많이 쓰는 ATS다. 실측으로 21개 보드에서 862건을 봤고,
 * 회사 채용 페이지에서 주소를 뽑아 확인한 아홉 곳 중 여섯이 여기였다.
 *
 *   목록  https://{token}.career.greetinghr.com/ko/home
 *   상세  https://{token}.career.greetinghr.com/ko/o/{openingId}
 *
 * **공개 JSON API가 없다.** 대신 두 페이지 모두 Next.js가 `__NEXT_DATA__`에
 * 데이터를 통째로 실어 보낸다. 화면을 긁는 것이 아니라 그 안의 JSON을 읽는다 —
 * 마크업이 바뀌어도 따라 깨지지 않는다.
 *
 * 목록 한 번에 제목 · 회사 · 마감일 · 직무 · 근무지 · 경력 · 고용형태가 전부
 * 온다. 상세를 여는 이유는 **본문(`detail`) 하나** 때문이다. 그래서 요청 수가
 * 공고 수만큼 늘고, 겹치는 정도를 묶어 둔다.
 */

const HOST_SUFFIX = ".career.greetinghr.com";

/** 본문 읽기를 동시에 몇 개까지 겹칠지. 남의 서버다. */
const DETAIL_LANES = 3;

/**
 * 요청 사이 최소 간격.
 *
 * 보드가 클수록 상세 요청이 그만큼 늘어난다 — 실측에서 올리브영이 214건,
 * 무신사가 104건이었다. 동시성만 묶으면 응답이 빠른 보드에서 초당 수십 번이
 * 나가므로, 시작 시각을 줄 세워 초당 다섯 번으로 묶는다.
 */
const MIN_INTERVAL_MS = 200;

interface GreetingPlace { location?: string | null }
interface GreetingCareer {
  careerFrom?: number | null;
  careerTo?: number | null;
  careerType?: string | null;
}
interface GreetingPosition {
  workspaceOccupation?: { occupation?: string | null } | null;
  workspaceJob?: { job?: string | null } | null;
  workspacePlace?: GreetingPlace | null;
  jobPositionCareer?: GreetingCareer | null;
  jobPositionEmployment?: { employmentType?: string | null } | null;
}
interface GreetingOpening {
  openingId?: number;
  title?: string;
  dueDate?: string | null;
  group?: { name?: string | null } | null;
  openingJobPosition?: { openingJobPositions?: GreetingPosition[] } | null;
}

/**
 * 실측한 값만 옮긴다. 처음 보는 값은 **그대로 둔다** — 짐작해서 옮기면
 * 원문에 없는 말이 화면에 선다.
 *
 * 표본 70건에서 나온 값이 이 셋이었다.
 */
const EMPLOYMENT_LABELS: Record<string, string> = {
  FULL_TIME_WORKER: "정규직",
  CONTRACT_WORKER: "계약직",
  INTERN_WORKER: "인턴",
};

/**
 * 경력 칸을 사람이 읽는 한 줄로.
 *
 * `careerFrom`의 단위는 **년**이다 — 그리팅이 같은 값을 화면에 "경력 7년 이상"
 * 으로 찍는 것을 확인했다.
 */
function experienceLabel(career: GreetingCareer | null | undefined): string | null {
  if (!career) return null;
  const type = career.careerType ?? null;
  if (type === "NEW_COMER") return "신입";
  if (type === "NOT_MATTER") return "경력무관";
  if (type !== "EXPERIENCED") return type;

  const from = career.careerFrom ?? null;
  const to = career.careerTo ?? null;
  if (from !== null && to !== null) return `경력 ${from}~${to}년`;
  if (from !== null) return `경력 ${from}년 이상`;
  return "경력";
}

/** 페이지에 실린 `__NEXT_DATA__`를 꺼낸다. */
function nextData(html: string): unknown {
  const match = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!match?.[1]) throw new Error("__NEXT_DATA__ not found");
  return JSON.parse(match[1]);
}

/** `dehydratedState.queries[].state.data`를 순서대로 훑는다. */
function queryData(payload: unknown): unknown[] {
  const queries = (payload as {
    props?: { pageProps?: { dehydratedState?: { queries?: { state?: { data?: unknown } }[] } } };
  })?.props?.pageProps?.dehydratedState?.queries;
  if (!Array.isArray(queries)) return [];
  return queries.map((one) => one?.state?.data);
}

/**
 * 목록에서 공고를 꺼낸다.
 *
 * 몇 번째 쿼리인지로 찾지 않는다 — 실측에서 `queries[3]`이었지만 그건 이
 * 보드의 사정이다. **`openingId`를 가진 배열**을 찾는다.
 */
function openingsOf(payload: unknown): GreetingOpening[] {
  for (const data of queryData(payload)) {
    if (!Array.isArray(data)) continue;
    const first = data[0] as GreetingOpening | undefined;
    if (first && typeof first === "object" && "openingId" in first) {
      return data as GreetingOpening[];
    }
  }
  return [];
}


/** 직무는 좁은 쪽(`job`)이 먼저다. 없으면 넓은 쪽(`occupation`). */
function teamOf(opening: GreetingOpening): string | null {
  const position = opening.openingJobPosition?.openingJobPositions?.[0] ?? null;
  return (position?.workspaceJob?.job ?? position?.workspaceOccupation?.occupation)
    ?.trim().slice(0, 120) ?? null;
}

function placeOf(opening: GreetingOpening): string | null {
  const position = opening.openingJobPosition?.openingJobPositions?.[0] ?? null;
  return position?.workspacePlace?.location?.trim().slice(0, 120) ?? null;
}

function dueOf(opening: GreetingOpening): Date | null {
  const due = opening.dueDate ? new Date(opening.dueDate) : null;
  return due && !Number.isNaN(due.getTime()) ? due : null;
}

/** 상세에서 본문만 꺼낸다. */
function detailOf(payload: unknown): string | null {
  for (const data of queryData(payload)) {
    const info = (data as { data?: { openingsInfo?: { detail?: string } } })?.data?.openingsInfo;
    if (info && typeof info.detail === "string") return info.detail;
  }
  return null;
}

/** 붙는 세기를 부르는 쪽이 정할 수 있게 열어 둔다. 기본값이 안전한 값이다. */
export interface GreetingOptions {
  /** 요청 사이 최소 간격(ms). 기본 200ms — 초당 다섯 번. */
  minIntervalMs?: number;
  /** 본문 읽기를 동시에 몇 개까지. 기본 3. */
  detailLanes?: number;
}

export class GreetingAdapter implements JobSourceAdapter {
  readonly provider: JobSourceProvider = "greeting";
  readonly #minIntervalMs: number;
  readonly #detailLanes: number;

  constructor(options: GreetingOptions = {}) {
    this.#minIntervalMs = options.minIntervalMs ?? MIN_INTERVAL_MS;
    this.#detailLanes = options.detailLanes ?? DETAIL_LANES;
  }

  async fetch(
    token: string,
    displayName: string,
    scope: FetchScope,
  ): Promise<FetchResult> {
    const base = `https://${encodeURIComponent(token)}${HOST_SUFFIX}`;
    const pace = createPacer(this.#minIntervalMs);
    await pace();
    const openings = openingsOf(nextData(await fetchText(`${base}/ko/home`)));

    // 상세는 공고 하나에 요청 하나다. 목록만 보고 먼저 가른다 — 들일 생각이
    // 없거나 이미 들인 공고의 본문을 받는 것이 여기서 가장 큰 낭비다.
    const fresh: GreetingOpening[] = [];
    const refresh: PostingRefresh[] = [];
    let skippedUnwanted = 0;
    for (const opening of openings) {
      const id = opening.openingId;
      const title = opening.title?.trim();
      if (!id || !title) continue;

      if (scope.isKnown(String(id))) {
        // 본문은 고칠 수 없다. 갈래와 마감만 다시 붙이면 된다.
        refresh.push({
          externalId: String(id),
          title: title.slice(0, 300),
          team: teamOf(opening),
          location: placeOf(opening),
          expiresAt: dueOf(opening),
        });
        continue;
      }
      if (!scope.wants(title, teamOf(opening))) { skippedUnwanted += 1; continue; }
      fresh.push(opening);
    }

    const built = await mapWithLimit(
      fresh,
      this.#detailLanes,
      async (opening): Promise<RawPosting | null> => {
        const id = opening.openingId;
        const title = opening.title?.trim();
        if (!id || !title) return null;

        const url = `${base}/ko/o/${id}`;
        await pace();
        const detail = detailOf(nextData(await fetchText(url)));
        // 본문이 없으면 들이지 않는다. 짧은 본문을 거르는 것은 수집 서비스의
        // 일이지만, **아예 못 읽은 것**은 여기서 끝내야 그 공고가 왜 없는지
        // 말할 수 있다.
        if (detail === null) return null;

        const position = opening.openingJobPosition?.openingJobPositions?.[0] ?? null;
        const employment = position?.jobPositionEmployment?.employmentType ?? null;

        return {
          externalId: String(id),
          title: title.slice(0, 300),
          companyName: (opening.group?.name?.trim() || displayName).slice(0, 200),
          descriptionRaw: htmlToMarkdown(detail),
          sourceUrl: url,
          location: placeOf(opening),
          employmentType: employment
            ? (EMPLOYMENT_LABELS[employment] ?? employment).slice(0, 60)
            : null,
          experienceLabel: experienceLabel(position?.jobPositionCareer)?.slice(0, 60) ?? null,
          team: teamOf(opening),
          expiresAt: dueOf(opening),
        };
      },
    );

    return {
      postings: built.filter((one): one is RawPosting => one !== null),
      refresh,
      skippedUnwanted,
    };
  }
}
