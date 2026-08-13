import type { Route } from "next";

/**
 * 목록에서 상세로 갔다가 **같은 목록으로** 돌아오기.
 *
 * 상세 화면은 어디서 왔는지 모른다. 그래서 목록이 자기 조건을 주소에 실어
 * 보내고(`?from=…`), 상세는 그걸로 돌아갈 주소를 만든다.
 *
 * `from`은 주소창에 노출되는 값이라 **믿지 않는다.** 아는 조건만 골라 다시
 * 조립한다 — 그래서 결과는 언제나 `/jobs` 아니면 `/jobs?<우리가 아는 것>`이고,
 * 바깥으로 나가는 주소가 될 수 없다.
 */

/** 목록 화면이 실제로 읽는 조건. 여기 없는 것은 되돌아갈 때 버린다. */
const FILTER_KEYS = [
  "q",
  "category",
  "sort",
  "page",
  "country",
  "experience",
  "workType",
  "company",
] as const;

/** 한 조건이 지나치게 길면 주소가 아니라 짐이다. 목록 쪽 계약의 상한과 맞춘다. */
const MAX_VALUE_LENGTH = 200;

function serialize(read: (key: string) => string | undefined): string {
  const query = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const value = read(key)?.trim();
    if (!value || value.length > MAX_VALUE_LENGTH) continue;
    query.set(key, value);
  }
  return query.toString();
}

/**
 * 지금 목록이 걸고 있는 조건을 한 문자열로 만든다.
 *
 * 비어 있으면 빈 문자열이다 — 아무 조건도 없는 목록에서 `?from=`을 달고 다니면
 * 주소만 길어지고 돌아가는 곳은 같다.
 */
export function currentListQuery(
  params: Record<string, string | string[] | undefined>,
): string {
  return serialize((key) => {
    const value = params[key];
    return typeof value === "string" ? value : undefined;
  });
}

/** 상세로 가는 주소. 조건이 없으면 `from`을 달지 않는다. */
export function detailHref(jobId: string, listQuery: string): Route {
  return (listQuery ? `/jobs/${jobId}?from=${encodeURIComponent(listQuery)}` : `/jobs/${jobId}`) as Route;
}

/**
 * 돌아갈 목록 주소. 아는 조건만 남긴다.
 *
 * `from`이 없거나 알아볼 수 없으면 `/jobs`다 — 주소를 직접 열었거나 알림에서
 * 들어온 사람도 목록에는 닿아야 한다.
 */
export function backToListHref(from: string | string[] | undefined): Route {
  if (typeof from !== "string" || from.length === 0) return "/jobs" as Route;
  const incoming = new URLSearchParams(from);
  const query = serialize((key) => incoming.get(key) ?? undefined);
  return (query ? `/jobs?${query}` : "/jobs") as Route;
}
