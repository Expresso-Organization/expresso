import type { BrewState } from "@expresso/contracts";

/**
 * 제작 머리말에 서는 이름. 사용자가 붙인 이름 → 자유 제작 제목 → 공고 제목 순이다.
 * 여섯 단계 화면이 모두 이 함수로 고른다 — 한 화면만 다른 규칙을 쓰면 이름을
 * 바꾼 뒤 단계를 넘어갈 때 옛 이름이 다시 선다.
 */
export function brewTitle(brew: Pick<BrewState, "title" | "freeTitle" | "posting">): string | null {
  return brew.title ?? brew.freeTitle ?? brew.posting?.title ?? null;
}
