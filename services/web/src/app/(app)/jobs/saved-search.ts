import type { JobSearchCondition, SavedJobSearch } from "@expresso/contracts";

/** 해석 칩이 서는 축. 칩마다 주소의 파라미터 하나를 바꾸거나 끈다. */
export type ChipAxis = "location" | "experience" | "technology" | "family" | "workType";

/** 해석 칩 중 다른 값으로 바꾸거나 끌 수 있는 축과, 그 값이 채워 넣는 질의 파라미터. */
export const CHIP_AXIS_PARAM: Partial<Record<JobSearchCondition["field"], ChipAxis>> = {
  location: "location",
  experience: "experience",
  role: "family",
  technology: "technology",
  work_type: "workType",
};

/**
 * 조건 묶음을 비교하는 키. 순서와 확신도는 보지 않는다 — 같은 검색이 같은 키를 내야
 * 「저장한 검색」인지 가릴 수 있다.
 */
export function conditionsKey(conditions: readonly JobSearchCondition[]): string {
  return conditions
    .map((condition) => `${condition.field}=${String(condition.value)}${condition.enabled ? "" : ":off"}`)
    .sort()
    .join("&");
}

/** 지금 화면의 검색이 이미 저장한 검색인가. 검색 문장과 칩 조건이 모두 같아야 같은 검색이다. */
export function isSavedSearch(
  saved: readonly SavedJobSearch[],
  query: string,
  conditions: readonly JobSearchCondition[],
): boolean {
  const key = conditionsKey(conditions);
  return saved.some((search) => search.originalQuery === query && conditionsKey(search.conditions) === key);
}

/**
 * 저장한 검색을 다시 여는 주소. 칩이 쓰는 파라미터 그대로 적는다 — 켠 조건은 그 값을,
 * 끈 조건은 `off`를 적어야 검색 문장이 그 축을 다시 읽어내도 저장한 대로 걸린다.
 */
export function savedSearchQuery(search: Pick<SavedJobSearch, "originalQuery" | "conditions">): Record<string, string> {
  const query: Record<string, string> = { q: search.originalQuery };
  for (const condition of search.conditions) {
    const param = CHIP_AXIS_PARAM[condition.field];
    if (!param) continue;
    query[param] = condition.enabled ? String(condition.value) : "off";
  }
  return query;
}
