"use server";

import { redirect } from "next/navigation";

import { readJobGoalAnswers } from "@/features/job-goal/JobGoalFields";
import { ApiError } from "@/lib/api/client";
import { career } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

export interface JobGoalFormState {
  error?: string;
}

/** 앱의 구직 목표 화면이 세 답을 저장한다. 저장하면 홈으로 돌아간다 — 홈의 제안이 이 목표를 읽는다. */
export async function saveJobGoalAction(_previous: JobGoalFormState, formData: FormData): Promise<JobGoalFormState> {
  const session = await requireSession();
  const answers = readJobGoalAnswers(formData);
  if (!answers.work && !answers.place && !answers.timing) return { error: "세 질문 가운데 하나는 답해 주세요." };
  try {
    await career.saveGoal(session.accessToken, { ...answers, source: "app" });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect("/login");
    if (error instanceof ApiError) return { error: "저장하지 못했습니다. 잠시 뒤 다시 눌러 주세요." };
    throw error;
  }
  redirect("/home");
}
