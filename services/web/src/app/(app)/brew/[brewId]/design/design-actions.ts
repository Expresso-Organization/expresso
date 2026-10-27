"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { PortfolioArchetypeSchema } from "@expresso/contracts";

import { ApiError } from "@/lib/api/client";
import { brews, designSystems, generation } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

/**
 * 03 디자인 선택에서 생성을 시작한다.
 *
 * 고른 디자인 시스템을 브루에 저장한 뒤, 그 판으로 생성을 요청한다. 스타일 값은 서버가
 * 판의 토큰에서 정한다. 3분쯤 걸리는 일이라 202와 잡 id만 받고 돌아온다. 진행은
 * `brew.latestGeneration`이 알려주므로 화면은 다시 그리기만 하면 된다.
 *
 * 구성(레시피)이 아직이면 구성 잡을 먼저 맡기고(브루마다 같은 키라 이미 돌고 있으면 그 잡이다) 브루로 생성을
 * 요청한다. 서버가 구성이 끝나는 대로 생성을 이어서 시작한다.
 */
export type BrewState = { error: string | null };

export async function startGenerationAction(
  _state: BrewState,
  formData: FormData,
): Promise<BrewState> {
  const session = await requireSession();
  const ids = z
    .object({
      brewId: z.uuid(),
      recipeId: z.uuid().optional(),
      designSystemRevisionId: z.uuid(),
      archetype: PortfolioArchetypeSchema.optional(),
    })
    .safeParse({
      brewId: formData.get("brewId"),
      // 구성이 없으면 폼에 칸이 없다(`null`). 빈 값도 구성이 없는 것으로 본다.
      recipeId: formData.get("recipeId") || undefined,
      designSystemRevisionId: formData.get("designSystemRevisionId"),
      archetype: formData.get("archetype") ?? undefined,
    });
  if (!ids.success) return { error: "고른 디자인을 확인하고 다시 눌러 주세요." };
  const { brewId, recipeId, designSystemRevisionId, archetype } = ids.data;

  try {
    // 선택을 먼저 남긴다. 생성이 실패해도 다시 열면 같은 디자인이 골라져 있다.
    await designSystems.select(session.accessToken, brewId, { revisionId: designSystemRevisionId });
    if (!recipeId) await brews.createRecipe(session.accessToken, brewId, `recipe:${brewId}`);
    await generation.submit(
      session.accessToken,
      { ...(recipeId ? { recipeId } : { brewId }), designSystemRevisionId, ...(archetype ? { archetype } : {}) },
      randomUUID(),
    );
  } catch (error) {
    if (error instanceof ApiError) return { error: submitFailure(error) };
    throw error;
  }

  revalidatePath(`/brew/${brewId}/design`);
  // "다시 뽑기"(`again=1`)에서 시작했으면 그 표시를 지운다. 남겨 두면 생성이 끝나 화면을 다시 그릴 때 카탈로그가 다시
  // 열려, 방금 채워지는 것을 지켜본 지면 대신 고르는 화면으로 돌아간다.
  redirect(`/brew/${brewId}/design`);
  return { error: null };
}

/** 기다리는 동안 다시 읽어 온다. 01b·02b의 "새로고침"과 같은 자리다. */
export async function refreshGenerationAction(formData: FormData): Promise<void> {
  await requireSession();
  revalidatePath(`/brew/${String(formData.get("brewId") ?? "")}/design`);
}

function submitFailure(error: ApiError): string {
  if (error.status === 402 || error.status === 403) {
    return "이번 달 추출 횟수를 다 썼습니다. 다음 달에 다시 뽑거나 요금제를 올려 주세요.";
  }
  if (error.status === 404) {
    return "고른 디자인을 더 이상 쓸 수 없습니다. 다시 골라 주세요.";
  }
  return "추출을 시작하지 못했습니다. 잠시 뒤 다시 눌러 주세요.";
}
