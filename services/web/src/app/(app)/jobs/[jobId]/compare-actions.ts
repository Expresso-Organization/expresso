"use server";

import { revalidatePath } from "next/cache";

import { ApiError } from "@/lib/api/client";
import { jobs } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

export type CompareState = { error: string | null };

/**
 * 이 공고를 내 기록과 대조한다.
 *
 * 분석 자리만 만들고 큐에 넣는다 — 요건을 읽고 커버리지를 매기는 것은 워커가
 * 한다. 그래서 돌아왔을 때 상태는 `queued`이고, 화면이 그 자리에서 진행을
 * 그린 뒤 끝나면 충족 수로 바뀐다.
 *
 * 제작 시작(`brew/new`)도 같은 API를 쓰지만 그쪽은 분석 대기 화면으로 보낸다.
 * 여기서는 읽던 공고에 그대로 머문다.
 */
export async function compareWithRecordsAction(formData: FormData): Promise<CompareState> {
  const session = await requireSession();
  const jobPostingId = String(formData.get("jobPostingId") ?? "");

  try {
    await jobs.analyzePosting(session.accessToken, jobPostingId);
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: "대조를 시작하지 못했습니다." };
    }
    throw error;
  }

  // 이 공고 상세만 다시 그린다. 관심 공고와 달리 사이드바에 걸리는 것이 없다.
  revalidatePath(`/jobs/${jobPostingId}`);
  return { error: null };
}
