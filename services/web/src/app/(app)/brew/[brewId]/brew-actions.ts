"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";

import { brews } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

/**
 * 위저드가 계약을 부르는 자리.
 *
 * 질문 생성과 레시피 생성은 **잡**이다 — 요청은 바로 돌아오고 워커가 계약을
 * 돌린다. 화면은 `brew.latestJob`을 보고 기다린다.
 */

function reload(brewId: string): void {
  revalidatePath(`/brew/${brewId}/counter`);
  revalidatePath(`/brew/${brewId}/outline`);
}

export async function startInterviewAction(_formData: FormData): Promise<void> {
  notFound();
}

export async function createRecipeAction(formData: FormData): Promise<void> {
  const brewId = formData.get("brewId");
  if (typeof brewId !== "string") return;
  const session = await requireSession();
  await brews.createRecipe(session.accessToken, brewId, `recipe:${brewId}`);
  reload(brewId);
}

export async function answerQuestionAction(_formData: FormData): Promise<void> {
  notFound();
}

export async function replaceQuestionAction(_formData: FormData): Promise<void> {
  notFound();
}
