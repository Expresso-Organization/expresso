import { redirect } from "next/navigation";

import { ApiError } from "@/lib/api/client";
import { career } from "@/lib/api/endpoints";
import { readAccessToken } from "@/lib/session";

import { GoalForm } from "./GoalForm";

/**
 * 10c 온보딩 · 목표.
 *
 * 이미 지난 사람이 다시 들어오면 **자기가 적어 둔 것을 본다.** 매번 기본값을
 * 보여 주면 "백엔드 5년"이 자기 답인 줄 알고 그대로 다음을 누르게 된다.
 */
export default async function OnboardingGoalPage() {
  const accessToken = await readAccessToken();
  if (!accessToken) redirect("/login");

  try {
    const { data } = await career.profile(accessToken);
    return <GoalForm profile={data} />;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect("/login");
    throw error;
  }
}
