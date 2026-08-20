"use server";

import { SaveCareerProfileSchema } from "@expresso/contracts";
import { redirect } from "next/navigation";

import { ApiError } from "@/lib/api/client";
import { career } from "@/lib/api/endpoints";
import { readAccessToken } from "@/lib/session";

export interface GoalFormState {
  /** §13 — 에러는 다음 행동으로 끝난다. */
  error?: string;
}

/**
 * 10c 목표 단계를 사용자 기록에 남긴다.
 *
 * 이 화면은 오랫동안 아무 데도 보내지 않았다 — 슬라이더를 12년에 놓고 다음을
 * 눌러도 그 값은 그 순간 사라졌다. 이제 `career_profile`에 남는다.
 */
export async function saveCareerGoalAction(
  _previous: GoalFormState,
  formData: FormData,
): Promise<GoalFormState> {
  const accessToken = await readAccessToken();
  if (!accessToken) redirect("/login");

  const parsed = SaveCareerProfileSchema.safeParse({
    targetRoles: formData.getAll("targetRoles").map(String),
    experienceYears: Number(formData.get("experienceYears")),
    primaryGoal: formData.get("primaryGoal"),
  });
  if (!parsed.success) {
    // 화면이 만들 수 없는 값이다. 사람이 고칠 수 있는 것이 아니므로 다시 하게 한다.
    return { error: "고른 값을 읽지 못했습니다. 새로고침한 뒤 다시 골라 주세요." };
  }

  try {
    await career.saveProfile(accessToken, parsed.data);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect("/login");
    if (error instanceof ApiError) {
      return { error: "저장하지 못했습니다. 잠시 뒤 다시 눌러 주세요." };
    }
    throw error;
  }

  redirect("/onboarding/consent");
}
