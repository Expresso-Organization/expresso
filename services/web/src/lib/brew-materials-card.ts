import { BrewMaterialsSchema, UuidSchema, type BrewState } from "@expresso/contracts";
import { z } from "zod";

/**
 * 대화의 「재료 고르기」 카드가 읽는 것. 백엔드의 재료 목록(`BrewMaterialsSchema`)과, 제작 상태에서 가른 다음 단계의 길이다.
 *
 * 다음 단계(AI 대화)는 대화에서 열린다 — 카드의 「AI와 대화 시작」이 에이전트 대화의 인터뷰 열기를 부른다. 지금의 재료 고르기
 * 화면에서 질문을 만든 제작만 지금의 AI 대화 화면으로 이어진다(`resumePath`).
 */
export const BrewMaterialsCardSchema = z.strictObject({
  materials: BrewMaterialsSchema,
  /**
   * 재료를 더 고칠 수 없는 제작이 이어지는 화면. 고칠 수 있으면 null이다(`resumePath`).
   * 값이 있으면 카드는 고른 것을 보이기만 하고 그 화면으로 가는 링크 하나만 둔다.
   */
  resumePath: z.string().min(1).max(300).nullable(),
});
export type BrewMaterialsCardData = z.infer<typeof BrewMaterialsCardSchema>;
export const BrewMaterialsCardResponseSchema = z.strictObject({ data: BrewMaterialsCardSchema });
/** 고른 기록의 목록. 통째로 보낸다 — 하나씩 켜고 끄면 서버가 한도를 넘겼는지 알 수 없다. */
export const SelectBrewMaterialsSchema = z.strictObject({ recordIds: z.array(UuidSchema).max(50) });

/**
 * 재료 단계의 다음 길. 질문이 이미 있거나 만드는 중이면 질문 만들기를 또 맡기지 않는다 — 잡을 또 내면 질문이 있는 대화 화면이
 * 잠깐 "만드는 중"으로 돌아가고, 도는 잡 옆에 잡이 하나 더 생긴다. 지금의 재료 고르기 화면과 대화의 카드가 이 판정 하나를 쓴다.
 */
export function interviewEntry(brew: BrewState): { beginsInterview: boolean; basisJobId: string | null } {
  return { beginsInterview: !brew.interviewSessionId && !makingQuestions(brew), basisJobId: brew.latestJob?.jobId ?? null };
}

/** 질문을 만드는 잡이 줄에 있거나 도는 중인가. */
function makingQuestions(brew: BrewState): boolean {
  return brew.latestJob?.type === "interview" && (brew.latestJob.status === "queued" || brew.latestJob.status === "running");
}

/**
 * 대화의 카드에서 재료를 더 고칠 수 없는 제작이 이어지는 화면. 고칠 수 있으면 null이다.
 *
 * 제작의 상태는 질문이 다 만들어져야 `draft`를 떠난다. 그래서 질문을 만드는 중에도 막는다 — 질문은 잡이 시작할 때 고른 재료로 만든다.
 * 그 뒤에는 구성을 만드는 중에 재료가 바뀌면 그 작업이 실패한다(`brew materials changed while planning`).
 * 갈래는 백엔드가 「이어서 만들기」에 내는 경로(`brewPath`)와 같다. 대화에서 연 인터뷰면 카드가 이 링크 대신 대화 아래의 「AI 대화」 카드에 맡긴다.
 */
export function resumePath(brew: BrewState): string | null {
  if (brew.status === "draft") return makingQuestions(brew) ? `/brew/${brew.brewId}/counter` : null;
  return `/brew/${brew.brewId}/${brew.status === "interviewing" ? "counter" : "design"}`;
}
