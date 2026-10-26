import type { BrewJobType } from "@expresso/contracts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 질문 · 레시피 잡을 부를 때의 멱등 키.
 *
 * 키에 **화면이 마지막으로 본 잡**을 붙인다. 같은 화면에서 두 번 누르면 키가
 * 같아 잡 하나로 모이고, 잡이 끝나 화면이 바뀐 뒤 누르면 새 키라 새 잡이 돈다
 * — 거절 뒤 재료를 고쳐 다시 누를 때나 구성을 다시 만들 때가 그렇다.
 * 본 잡이 없으면 예전과 같은 키다.
 */
export function brewJobKey(type: BrewJobType, brewId: string, basisJobId: FormDataEntryValue | null): string {
  return typeof basisJobId === "string" && UUID.test(basisJobId)
    ? `${type}:${brewId}:${basisJobId}`
    : `${type}:${brewId}`;
}
