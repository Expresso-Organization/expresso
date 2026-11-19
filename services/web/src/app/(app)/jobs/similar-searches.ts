import type { RecentJobSearch } from "@expresso/contracts";

/** 한글 자모만 따로 선 글자(ㄱ–ㅎ · ㅏ–ㅣ). 조합하다 만 입력에서만 나온다. */
const LOOSE_JAMO = /[ㄱ-ㆎ]/u;

/**
 * 「비슷한 검색」에 띄울 최근 검색. 지금 검색어와 같은 것, 결과가 0건이었던 것, 한글을 조합하다 만
 * 글자가 든 것(「ㄹ옹로」)은 뺀다 — 누르면 다시 빈 결과가 나오는 검색을 권하지 않는다(Discord QA 11-13).
 * 「최근 검색」은 기록이라 그대로 둔다.
 */
export function similarSearches(recent: readonly RecentJobSearch[], query: string, limit = 3): RecentJobSearch[] {
  return recent
    .filter((search) => search.query !== query && search.resultCount > 0 && !LOOSE_JAMO.test(search.query))
    .slice(0, limit);
}
