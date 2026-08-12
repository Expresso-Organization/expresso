"use server";

import { revalidatePath } from "next/cache";

import { ApiError } from "@/lib/api/client";
import { jobAnalyses } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

/**
 * 01 "다시 분석".
 *
 * 다시 분석하면 요건이 갈리고, 그 요건에 기대어 만든 것들이 흔들린다. 그래서
 * 서버가 **무엇이 영향을 받는지**를 함께 돌려주고 화면이 그대로 옮긴다.
 */
export interface AnalyzeResult {
  queued?: { targetVersion: number; brewCount: number; recipeCount: number };
  error?: string;
}

export async function reanalyzeAction(
  _previous: AnalyzeResult,
  formData: FormData,
): Promise<AnalyzeResult> {
  const jobAnalysisId = formData.get("jobAnalysisId");
  const brewId = formData.get("brewId");
  if (typeof jobAnalysisId !== "string" || typeof brewId !== "string") return {};

  const session = await requireSession();
  try {
    const { data } = await jobAnalyses.reanalyze(session.accessToken, jobAnalysisId);
    revalidatePath(`/brew/${brewId}/analyze`);
    return {
      queued: {
        targetVersion: data.targetVersion,
        brewCount: data.impact.brewCount,
        recipeCount: data.impact.recipeCount,
      },
    };
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      return { error: "아직 분석이 끝나지 않았습니다. 끝난 뒤에 다시 눌러 주세요." };
    }
    return { error: "다시 분석하지 못했습니다. 잠시 뒤 시도해 주세요." };
  }
}
