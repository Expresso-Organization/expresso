import { UuidSchema } from "@expresso/contracts";
import { z } from "zod";

import type { WaitReading } from "@/app/(app)/brew/[brewId]/design/GenerationWait";

/**
 * 대화의 「생성」 카드와 무대가 읽는 것. 제작의 최근 생성과, 기다리는 동안 보일 입력 묶음이다.
 * 입력 묶음은 생성이 줄에 있거나 도는 동안 처음 한 번만 읽는다(`?reading=1`) — 지금의 생성 화면과 같은 함수(`waitReading`)로 만든다.
 */
export const BrewGenerationCardSchema = z.strictObject({
  generation: z.strictObject({
    id: UuidSchema,
    status: z.enum(["queued", "running", "done", "failed"]),
    createdAt: z.string(),
    portfolioId: UuidSchema.nullable(),
    failureCode: z.string().nullable(),
  }).nullable(),
  /** 구성(레시피)이 끝나기 전에 맡긴 생성이고 구성 잡이 아직 도는가. */
  recipePending: z.boolean(),
  /** 지면 제목. 무대와 미리보기 문서의 제목이다. */
  title: z.string(),
  reading: z.custom<WaitReading>((value) => typeof value === "object" && value !== null).nullable(),
});
export type BrewGenerationCardData = z.infer<typeof BrewGenerationCardSchema>;
export const BrewGenerationCardResponseSchema = z.strictObject({ data: BrewGenerationCardSchema });

/** 생성이 줄에 있거나 도는 중인가. */
export const generationRunning = (data: BrewGenerationCardData | null | undefined) => data?.generation?.status === "queued" || data?.generation?.status === "running";
