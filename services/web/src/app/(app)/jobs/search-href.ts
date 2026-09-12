import type { Route } from "next";

/** 검색어를 바꿀 때 기존 필터와 정렬을 유지하고 첫 쪽으로 돌아갑니다. */
export function searchHref(listQuery: string, query: string): Route {
  const params = new URLSearchParams(listQuery);
  params.delete("page");
  params.delete("category");
  const normalized = query.trim();
  if (normalized) params.set("q", normalized);
  else params.delete("q");
  const serialized = params.toString();
  return (serialized ? `/jobs?${serialized}` : "/jobs") as Route;
}
