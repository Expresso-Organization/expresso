"use server";

import {
  RecipeV2EditSchema,
  RecipeV2ReorderSchema,
  SubmitJobPostingSchema,
  type RecipeV2,
  type RecipeV2Edit,
  type RecipeV2Reorder,
} from "@expresso/contracts";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ApiError } from "@/lib/api/client";
import { brews, jobs, recipeV2 } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

/**
 * 02 레시피의 편집은 전부 이 자리를 지난다.
 *
 * 화면이 먼저 반영하고 서버가 뒤따른다. 서버가 거절하면 화면은 돌려받은 판을
 * 그대로 다시 그린다 — 낙관적 반영이 남긴 차이를 손으로 되돌리지 않는다.
 */

export type RecipeResult =
  | { ok: true; recipe: RecipeV2 }
  | { ok: false; error: string };

function failure(error: unknown): RecipeResult {
  if (error instanceof ApiError) {
    if (error.status === 409) return { ok: false, error: "다른 곳에서 먼저 바뀌었습니다. 화면을 새로 열어 주세요." };
    if (error.status === 404) return { ok: false, error: "고치려던 자리를 찾지 못했습니다." };
    return { ok: false, error: "저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요." };
  }
  throw error;
}

export async function editRecipeAction(recipeId: string, edit: RecipeV2Edit): Promise<RecipeResult> {
  const id = z.uuid().safeParse(recipeId);
  const parsed = RecipeV2EditSchema.safeParse(edit);
  if (!id.success || !parsed.success) return { ok: false, error: "요청을 읽지 못했습니다." };
  const session = await requireSession();
  try {
    const { data } = await recipeV2.edit(session.accessToken, id.data, parsed.data);
    return { ok: true, recipe: data.recipe };
  } catch (error) {
    return failure(error);
  }
}

export async function reorderRecipeAction(recipeId: string, input: RecipeV2Reorder): Promise<RecipeResult> {
  const id = z.uuid().safeParse(recipeId);
  const parsed = RecipeV2ReorderSchema.safeParse(input);
  if (!id.success || !parsed.success) return { ok: false, error: "요청을 읽지 못했습니다." };
  const session = await requireSession();
  try {
    const { data } = await recipeV2.reorder(session.accessToken, id.data, parsed.data);
    return { ok: true, recipe: data };
  } catch (error) {
    return failure(error);
  }
}

/**
 * 초안을 새로 만든다.
 *
 * 멱등성 키에 지금 초안의 식별자를 넣는다 — 만들어지는 동안 두 번 눌러도 같은
 * 잡이고, 만들어진 뒤에 누르면 새 초안이다.
 */
export async function draftRecipeAction(formData: FormData): Promise<void> {
  const brewId = formData.get("brewId");
  const previousRecipeId = formData.get("previousRecipeId");
  if (typeof brewId !== "string") return;
  const session = await requireSession();
  await brews.createRecipe(
    session.accessToken,
    brewId,
    `recipe:${brewId}:${typeof previousRecipeId === "string" && previousRecipeId ? previousRecipeId : "first"}`,
  );
  revalidatePath(`/brew/${brewId}/recipe`);
}

// ── 목록에 없는 공고를 원문으로 ─────────────────────────────────

export type PostingSubmitResult =
  | { ok: true; jobPostingId: string }
  | { ok: false; error: string };

export async function submitPostingAction(
  _previous: PostingSubmitResult | null,
  formData: FormData,
): Promise<PostingSubmitResult> {
  const input = SubmitJobPostingSchema.safeParse({
    companyName: String(formData.get("companyName") ?? ""),
    title: String(formData.get("title") ?? ""),
    descriptionRaw: String(formData.get("descriptionRaw") ?? ""),
    ...(String(formData.get("sourceUrl") ?? "").trim()
      ? { sourceUrl: String(formData.get("sourceUrl")).trim() }
      : {}),
  });
  if (!input.success) {
    return { ok: false, error: "회사 이름 · 공고 제목 · 본문 200자 이상이 필요합니다." };
  }
  const session = await requireSession();
  try {
    const { data } = await jobs.submit(session.accessToken, input.data, randomUUID());
    return { ok: true, jobPostingId: data.jobPostingId };
  } catch (error) {
    if (error instanceof ApiError) return { ok: false, error: "공고를 넣지 못했습니다. 잠시 뒤 다시 시도해 주세요." };
    throw error;
  }
}
