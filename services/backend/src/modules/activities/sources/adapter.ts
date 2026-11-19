import type { ActivityKind, ActivitySource as ActivitySourceName } from "@expresso/contracts";

import { seoulDate } from "../dates.js";

/**
 * 출처 하나가 돌려주는 활동 한 줄. 저장 문서(`ActivityDoc`)에서 수집 시각과 중복 대표를 뺀 모양이다.
 * 출처가 주지 않는 칸은 null이다.
 */
export interface ActivityRow {
  /** 출처 안의 번호. 저장 `_id`는 `<출처>:<sourceId>`다. */
  sourceId: string;
  kind: ActivityKind;
  title: string;
  host: string;
  fields: string[];
  url: string;
  homepageUrl: string | null;
  applyStartOn: string | null;
  deadlineOn: string;
  deadlinePrecision: "day" | "month";
  startsOn: string | null;
  eligibility: string | null;
  prize: string | null;
  tuition: number | null;
  nbcardRequired: boolean | null;
  status: string;
}

/**
 * 활동 출처. `fetch`는 지금 접수 중인(또는 접수 예정인) 활동을 돌려준다.
 *
 * 응답이 없거나 쪽에서 한 줄도 읽지 못하면(마감한 줄까지 포함해) `ActivitySourceError`를 던진다 —
 * 조용히 0건을 돌려주면 수집이 성공한 것처럼 보인다.
 */
export interface ActivitySource {
  readonly name: ActivitySourceName;
  fetch(at: Date): Promise<ActivityRow[]>;
}

export class ActivitySourceError extends Error {
  override readonly name = "ActivitySourceError";
}

/** 주소를 받아 본문을 돌려준다. 응답이 2xx가 아니면 던진다. */
export type FetchText = (url: string, init?: { method?: "GET" | "POST"; headers?: Record<string, string>; body?: string }) => Promise<string>;

/** 출처 쪽은 대부분 브라우저용이라 브라우저 꼴의 사용자 에이전트를 보낸다. */
export const USER_AGENT = "Mozilla/5.0 (compatible; ExpressoActivityCollector/1.0)";
const TIMEOUT_MS = 20_000;

export const fetchText: FetchText = async (url, init = {}) => {
  const response = await fetch(url, {
    method: init.method ?? "GET",
    headers: { "user-agent": USER_AGENT, ...init.headers },
    ...(init.body === undefined ? {} : { body: init.body }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new ActivitySourceError(`${new URL(url).host} ${response.status}`);
  return response.text();
};

/** 접수 시작 전이면 "접수예정", 아니면 "접수중". */
export function statusOn(applyStartOn: string | null, at: Date): string {
  return applyStartOn && applyStartOn > seoulDate(at) ? "접수예정" : "접수중";
}

/** 칸 길이를 계약에 맞춘다. 빈 글은 null. */
export function clip(text: string | null | undefined, max: number): string | null {
  const value = text?.replace(/\s+/g, " ").trim();
  return value ? value.slice(0, max) : null;
}
