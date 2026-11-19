import { seoulDateOfMs } from "../dates.js";
import { ActivitySourceError, clip, fetchText, statusOn, type ActivityRow, type ActivitySource, type FetchText } from "./adapter.js";
import { isHackathon } from "./text.js";

/**
 * 링커리어(linkareer.com) 공모전.
 *
 * 웹 화면이 쓰는 GraphQL(`api.linkareer.com/graphql`)을 인증 없이 부른다(2026-11-20 확인). 문서가 없는 내부 API라
 * 모양이 바뀌면 응답에 `errors`가 오거나 `nodes`가 없다 — 그때 던진다.
 * - `activityTypeID: "3"`이 공모전이다(목록 화면 `/list/contest`의 질의에서 확인).
 * - 접수 시작 · 마감이 밀리초 시각으로 온다. 마감은 그날 23:59:59.999(서울)다.
 * - `awards`는 시상 규모(만 원). 상세 화면에 「시상규모 540만 원」으로 보인다.
 * - 같은 공모전을 여러 사람이 따로 올린 글이 있다 — 중복 묶기가 하나로 보인다.
 */
const ENDPOINT = "https://api.linkareer.com/graphql";
const PAGE_SIZE = 100;
/** 쪽 수 상한. 모집 중 공모전이 440건(2026-11-20)이라 넉넉히 둔다. */
const MAX_PAGES = 10;

const QUERY = `query ActivityList($filter: ActivityFilter, $page: Int!, $pageSize: Int!) {
  activities(filterBy: $filter, pagination: { page: $page, pageSize: $pageSize }) {
    totalCount
    nodes { id title organizationName recruitStartAt recruitCloseAt homepageURL awards targets { name } categories { name } }
  }
}`;

interface LinkareerNode {
  id: string;
  title: string;
  organizationName: string | null;
  recruitStartAt: number | null;
  recruitCloseAt: number | null;
  homepageURL: string | null;
  awards: string | null;
  targets: { name: string }[] | null;
  categories: { name: string }[] | null;
}

interface LinkareerResponse {
  data?: { activities?: { totalCount: number; nodes: LinkareerNode[] } | null };
  errors?: { message: string }[];
}

/** 시상 규모(만 원)를 글로. 0이거나 없으면 null. */
export function linkareerPrize(awards: string | null): string | null {
  const amount = Number(awards);
  return Number.isFinite(amount) && amount > 0 ? `총 ${amount.toLocaleString("ko-KR")}만 원` : null;
}

export function linkareerRow(node: LinkareerNode, at: Date): ActivityRow | null {
  if (!node.id || !node.title || !node.recruitCloseAt) return null;
  const applyStartOn = node.recruitStartAt ? seoulDateOfMs(node.recruitStartAt) : null;
  const targets = (node.targets ?? []).map(({ name }) => name).filter((name) => name !== "대상 제한 없음");
  const homepage = node.homepageURL?.trim();
  return {
    sourceId: node.id,
    kind: isHackathon(node.title) ? "hackathon" : "contest",
    title: node.title.trim().slice(0, 300),
    host: (node.organizationName ?? "").trim().slice(0, 200),
    fields: (node.categories ?? []).map(({ name }) => name.slice(0, 60)).slice(0, 12),
    url: `https://linkareer.com/activity/${node.id}`,
    homepageUrl: homepage && /^https?:\/\//.test(homepage) ? homepage.slice(0, 2_000) : null,
    applyStartOn,
    deadlineOn: seoulDateOfMs(node.recruitCloseAt),
    deadlinePrecision: "day",
    startsOn: null,
    eligibility: (node.targets ?? []).length ? clip(targets.length ? targets.join(", ") : "제한 없음", 300) : null,
    prize: linkareerPrize(node.awards),
    tuition: null,
    nbcardRequired: null,
    status: statusOn(applyStartOn, at),
  };
}

export class LinkareerSource implements ActivitySource {
  readonly name = "linkareer" as const;

  constructor(private readonly fetchPage: FetchText = fetchText) {}

  async fetch(at: Date): Promise<ActivityRow[]> {
    const rows: ActivityRow[] = [];
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const body = JSON.stringify({ query: QUERY, variables: { filter: { activityTypeID: "3", status: "OPEN" }, page, pageSize: PAGE_SIZE } });
      const response = JSON.parse(await this.fetchPage(ENDPOINT, { method: "POST", headers: { "content-type": "application/json", origin: "https://linkareer.com" }, body })) as LinkareerResponse;
      const listing = response.data?.activities;
      if (response.errors?.length || !listing || !Array.isArray(listing.nodes)) throw new ActivitySourceError(`linkareer: ${response.errors?.[0]?.message ?? "unexpected response"}`.slice(0, 300));
      if (page === 1 && listing.nodes.length === 0) throw new ActivitySourceError("linkareer: no rows");
      for (const node of listing.nodes) {
        const row = linkareerRow(node, at);
        if (row) rows.push(row);
      }
      if (listing.nodes.length < PAGE_SIZE || page * PAGE_SIZE >= listing.totalCount) break;
    }
    return rows;
  }
}
