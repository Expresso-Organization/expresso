import type { AgentGoalDraft, AgentGoalDraftInput } from "@expresso/contracts";
import { normalize } from "./requirement-review.js";

/** 구직 목표의 세 글. 적지 않은 칸은 빈 글이다. */
export interface GoalTexts { work: string; place: string; timing: string }
const KEYS = ["work", "place", "timing"] as const;

/** 지금 적힌 글과 실제로 다른 칸만 고른다. 공백 차이는 같은 글로 본다. */
const changedKeys = (input: AgentGoalDraftInput, current: GoalTexts | null) =>
  KEYS.filter(key => input[key] !== undefined && normalize(input[key]) !== normalize(current?.[key] ?? ""));

/**
 * 저장하지 않은 앞선 초안의 칸을 새 입력이 이어받는다. 같은 칸은 새 입력이 이긴다.
 *
 * 새 초안이 서면 앞선 초안은 닫힌다. 이어받지 않으면 사용자가 칸을 하나씩 말할 때마다 앞서
 * 말한 칸이 카드와 함께 사라진다.
 */
export function carryOver(input: AgentGoalDraftInput, pending: Pick<AgentGoalDraft, "work" | "place" | "timing"> | undefined): AgentGoalDraftInput {
  if (!pending) return input;
  const merged: AgentGoalDraftInput = { ...input };
  for (const key of KEYS) if (merged[key] === undefined && pending[key] !== null) merged[key] = pending[key];
  return merged;
}

/**
 * 목표 변경 초안의 입력 검사.
 *
 * 도구의 입력 스키마는 세 칸이 모두 선택이라 「하나 이상」을 스키마로 걸 수 없다. 바뀌는 칸이
 * 없으면 카드에 보일 것이 없으므로 여기서 돌려보낸다.
 */
export function goalDraftIssues(input: AgentGoalDraftInput, current: GoalTexts | null) {
  if (!KEYS.some(key => input[key] !== undefined)) return ["바뀌는 칸이 없습니다. work · place · timing 가운데 사용자가 말한 칸을 하나 이상 넣으십시오."];
  if (!changedKeys(input, current).length) return ["적어 둔 목표와 같은 글입니다. 바뀌는 칸만 넣으십시오. 바뀐 것이 없으면 제안하지 마십시오."];
  return [];
}

/** 바뀌는 칸만 담은 초안. 지금 글과 같은 칸은 null로 두어 카드에 세우지 않는다. */
export function buildGoalDraft(input: AgentGoalDraftInput, draftId: string, current: GoalTexts | null): AgentGoalDraft {
  const changed = new Set(changedKeys(input, current));
  const text = (key: typeof KEYS[number]) => (changed.has(key) ? input[key]!.trim() : null);
  return { draftId, work: text("work"), place: text("place"), timing: text("timing"), previous: current ? { work: current.work, place: current.place, timing: current.timing } : null, status: "ready" };
}

/**
 * 승인할 때 저장할 글. 승인 시점의 목표에 초안의 칸만 덮는다 — 카드가 선 뒤 구직 목표 화면에서
 * 고친 다른 칸을 되돌리지 않는다.
 */
export function mergeGoal(draft: Pick<AgentGoalDraft, "work" | "place" | "timing">, current: GoalTexts | null): GoalTexts {
  return { work: draft.work ?? current?.work ?? "", place: draft.place ?? current?.place ?? "", timing: draft.timing ?? current?.timing ?? "" };
}
