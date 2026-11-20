"use server";

import { revalidatePath } from "next/cache";

import { ApiError } from "@/lib/api/client";
import { jobs } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

export type InterestState = { error: string | null };

/**
 * 관심 공고 담기 · 해제.
 *
 * 무엇을 할지(`next`)는 버튼이 본 상태로 정한다. PUT과 DELETE가 둘 다 멱등이라
 * 두 번 눌리거나 탭 두 개에서 눌려도 결과가 같다.
 */
export async function toggleInterestAction(formData: FormData): Promise<InterestState> {
  const session = await requireSession();
  const jobPostingId = String(formData.get("jobPostingId") ?? "");
  const next = formData.get("next") === "remove" ? "remove" : "save";

  try {
    if (next === "save") await jobs.saveInterest(session.accessToken, jobPostingId);
    else await jobs.removeInterest(session.accessToken, jobPostingId);
  } catch (error) {
    if (error instanceof ApiError) {
      return {
        error: next === "save" ? "관심 공고에 담지 못했습니다." : "관심 공고에서 빼지 못했습니다.",
      };
    }
    throw error;
  }

  // 관심 공고는 공고 탐색의 관심 공고 레일처럼 여러 화면에 걸친다. 루트 레이아웃
  // 단위로 무효화해야 지금 화면과 다음에 여는 화면이 함께 새 목록을 읽는다.
  revalidatePath("/", "layout");
  return { error: null };
}
