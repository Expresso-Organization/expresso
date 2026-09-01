import { partialJson } from "./partial-json.js";

/**
 * 짜이는 동안 보여 주는 레시피.
 *
 * 레시피 하나는 실측 150초다(sonnet · 재료 10건). 그동안 화면이 정직하게 할 수
 * 있는 일은 **지금 무엇이 써지는지 그대로 보여 주는 것**이다 — 남은 시간은
 * 우리도 모르고 모델도 알려 주지 않는다.
 *
 * 흐르는 것은 `RecipeDraftSchema` 모양의 JSON 하나가 잘린 조각들이다. 여기
 * 있는 것은 그 조각에서 **화면이 그릴 수 있는 데까지**를 꺼내는 도구다.
 */

/** SSE 한 줄의 이름. 받는 쪽이 `switch`로 가르는 값이다. */
export const RECIPE_STREAM_EVENTS = ["begin", "thinking", "delta", "done", "failed"] as const;
export type RecipeStreamEvent = (typeof RECIPE_STREAM_EVENTS)[number];

/**
 * 아직 짜이는 중인 섹션.
 *
 * 모델은 스키마에 적힌 순서대로 쓴다 — 제목 · 목적이 먼저 오고 핵심 메시지와
 * 항목이 뒤따른다. 그래서 **안 온 것은 빈 문자열**이지 없는 것이 아니다.
 */
export interface PartialRecipeSection {
  title: string;
  purpose: string;
  /** §7.8 「핵심 메시지」. 스키마의 `takeaway`. */
  takeaway: string;
  items: string[];
}

/**
 * 조각을 이어 붙인 것에서 지금까지 온 섹션을 꺼낸다.
 *
 * 아직 아무것도 못 읽으면 빈 배열이다. 진행률을 지어내지 않는다 — 몇 개짜리
 * 레시피가 될지는 다 나와야 안다.
 */
export function partialRecipeSections(buffer: string): PartialRecipeSection[] {
  const draft = partialJson(buffer);
  if (!isObject(draft) || !Array.isArray(draft.sections)) return [];
  return draft.sections.flatMap((section) => {
    if (!isObject(section)) return [];
    const items = Array.isArray(section.items)
      ? section.items.flatMap((item) => (isObject(item) ? [text(item.pointText)] : []))
      : [];
    return [{
      title: text(section.title),
      purpose: text(section.purpose),
      takeaway: text(section.takeaway),
      // 문구가 아직 한 글자도 안 온 항목은 자리만 잡는다 — 곧 채워진다.
      items,
    }];
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
