"use server";

import {
  BlueprintEditSchema,
  BlueprintReorderSchema,
  SubmitJobPostingSchema,
  type BlueprintEdit,
  type BlueprintReorder,
  type JobPostingSummary,
  type RecipeV2,
} from "@expresso/contracts";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { ApiError } from "@/lib/api/client";
import { blueprints, jobs } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

/**
 * 02 레시피의 편집은 전부 이 자리를 지난다.
 *
 * 화면이 먼저 반영하고 서버가 뒤따른다. 서버가 거절하면 화면은 돌려받은 판을
 * 그대로 다시 그린다 — 낙관적 반영이 남긴 차이를 손으로 되돌리지 않는다.
 */

export type BlueprintResult =
  | { ok: true; recipe: RecipeV2 }
  | { ok: false; error: string };

function failure(error: unknown): BlueprintResult {
  if (error instanceof ApiError) {
    if (error.status === 409) return { ok: false, error: "다른 곳에서 먼저 바뀌었습니다. 화면을 새로 열어 주세요." };
    if (error.status === 404) return { ok: false, error: "고치려던 자리를 찾지 못했습니다." };
    return { ok: false, error: "저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요." };
  }
  throw error;
}

export async function editBlueprintAction(
  blueprintId: string,
  edit: BlueprintEdit,
): Promise<BlueprintResult> {
  const id = z.uuid().safeParse(blueprintId);
  const parsed = BlueprintEditSchema.safeParse(edit);
  if (!id.success || !parsed.success) return { ok: false, error: "요청을 읽지 못했습니다." };
  const session = await requireSession();
  try {
    const { data } = await blueprints.edit(session.accessToken, id.data, parsed.data);
    return { ok: true, recipe: data.recipe };
  } catch (error) {
    return failure(error);
  }
}

export async function reorderBlueprintAction(
  blueprintId: string,
  input: BlueprintReorder,
): Promise<BlueprintResult> {
  const id = z.uuid().safeParse(blueprintId);
  const parsed = BlueprintReorderSchema.safeParse(input);
  if (!id.success || !parsed.success) return { ok: false, error: "요청을 읽지 못했습니다." };
  const session = await requireSession();
  try {
    const { data } = await blueprints.reorder(session.accessToken, id.data, parsed.data);
    return { ok: true, recipe: data };
  } catch (error) {
    return failure(error);
  }
}

// ── 지원할 채용 공고 고르기 ──────────────────────────────────────

export type PostingSearchResult =
  | { ok: true; postings: JobPostingSummary[]; total: number }
  | { ok: false; error: string };

/** 모아 둔 공고에서 찾는다. 검색어가 비면 최근 순 앞쪽을 보여준다. */
export async function searchPostingsAction(query: string): Promise<PostingSearchResult> {
  const session = await requireSession();
  const q = query.trim();
  try {
    const result = await jobs.postings(session.accessToken, {
      ...(q ? { q } : {}),
      sort: "recent",
      page: 1,
      limit: 12,
    });
    return { ok: true, postings: result.data, total: result.summary.total };
  } catch (error) {
    if (error instanceof ApiError) return { ok: false, error: "공고를 불러오지 못했습니다." };
    throw error;
  }
}

export type PostingSubmitResult =
  | { ok: true; jobPostingId: string }
  | { ok: false; error: string };

/**
 * 목록에 없는 공고를 원문으로 넣는다.
 *
 * 공고와 분석이 함께 생긴다(202). 요건을 뽑는 것은 워커가 하는 일이라 여기서는
 * 공고 식별자만 받아 의도에 적는다.
 */
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
