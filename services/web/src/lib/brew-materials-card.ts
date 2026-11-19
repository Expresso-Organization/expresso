import { BrewMaterialsSchema, UuidSchema, type BrewState } from "@expresso/contracts";
import { z } from "zod";

/**
 * 대화의 「재료 고르기」 카드가 읽는 것. 백엔드의 재료 목록(`BrewMaterialsSchema`)과, 제작 상태에서 가른 다음 단계의 길이다.
 *
 * 다음 단계(AI 대화)는 질문 만들기 잡을 맡긴 뒤 열린다. 질문이 이미 있거나 만드는 중이면 잡을 또 맡기지 않고 화면만 연다 —
 * 지금의 재료 고르기 화면과 같은 판정이다(`brew/[brewId]/materials/page.tsx`).
 */
export const BrewMaterialsCardSchema = z.strictObject({
  materials: BrewMaterialsSchema,
  /** 「AI와 대화 시작」이 질문 만들기를 맡겨야 하는가. 아니면 대화 화면으로만 간다. */
  beginsInterview: z.boolean(),
  /** 화면이 마지막으로 본 잡. 질문 만들기의 멱등 키에 붙는다(`brewJobKey`). */
  basisJobId: UuidSchema.nullable(),
  /**
   * 제작이 재료 단계를 지났는가. 지났으면 카드는 고른 것을 보이기만 한다 — 질문은 고른 재료로 이미 만들어졌고 다시 만들지 않으며,
   * 구성을 만드는 중에 재료가 바뀌면 그 작업이 실패한다.
   */
  locked: z.boolean(),
});
export type BrewMaterialsCardData = z.infer<typeof BrewMaterialsCardSchema>;
export const BrewMaterialsCardResponseSchema = z.strictObject({ data: BrewMaterialsCardSchema });
/** 고른 기록의 목록. 통째로 보낸다 — 하나씩 켜고 끄면 서버가 한도를 넘겼는지 알 수 없다. */
export const SelectBrewMaterialsSchema = z.strictObject({ recordIds: z.array(UuidSchema).max(50) });

/**
 * 재료 단계의 다음 길. 질문이 이미 있거나 만드는 중이면 질문 만들기를 또 맡기지 않는다 — 잡을 또 내면 질문이 있는 대화 화면이
 * 잠깐 "만드는 중"으로 돌아가고, 도는 잡 옆에 잡이 하나 더 생긴다. 지금의 재료 고르기 화면과 대화의 카드가 이 판정 하나를 쓴다.
 */
export function interviewEntry(brew: BrewState): Pick<BrewMaterialsCardData, "beginsInterview" | "basisJobId"> {
  const interviewJob = brew.latestJob?.type === "interview" ? brew.latestJob : null;
  return {
    beginsInterview: !brew.interviewSessionId && interviewJob?.status !== "queued" && interviewJob?.status !== "running",
    basisJobId: brew.latestJob?.jobId ?? null,
  };
}
