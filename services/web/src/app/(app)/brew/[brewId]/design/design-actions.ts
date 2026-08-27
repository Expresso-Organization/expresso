"use server";

import { randomUUID } from "node:crypto";

import { TemplateStyleOverrideSchema } from "@expresso/contracts";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ApiError } from "@/lib/api/client";
import { generation } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

/**
 * 03 추출하기.
 *
 * 3분쯤 걸리는 일이라 202와 잡 id만 받고 돌아온다. 진행은 `brew.latestGeneration`이
 * 알려주므로 화면은 다시 그리기만 하면 된다 — 잡 id를 주소에 실어 나를 필요가 없다.
 */
export type BrewState = { error: string | null };

export async function startGenerationAction(
  _state: BrewState,
  formData: FormData,
): Promise<BrewState> {
  const session = await requireSession();
  const brewId = String(formData.get("brewId") ?? "");
  const recipeId = String(formData.get("recipeId") ?? "");
  const templateId = String(formData.get("templateId") ?? "");
  const styleOverrides = TemplateStyleOverrideSchema.safeParse({
    structure: formData.get("structure") ?? "single-column",
    density: formData.get("density") ?? "comfortable",
    font: formData.get("font") ?? "sans",
    // 기업 색과 대비 보정을 포함해 사용자가 실제로 본 팔레트를 넘깁니다.
    background: formData.get("background") ?? undefined,
    text: formData.get("text") ?? undefined,
    accent: formData.get("accent") ?? undefined,
  });

  if (!templateId) return { error: "디자인을 먼저 골라 주세요." };
  if (!styleOverrides.success) return { error: "디자인 설정을 확인하고 다시 골라 주세요." };

  try {
    await generation.submit(
      session.accessToken,
      { recipeId, templateId, styleOverrides: styleOverrides.data },
      randomUUID(),
    );
  } catch (error) {
    if (error instanceof ApiError) return { error: submitFailure(error) };
    throw error;
  }

  revalidatePath(`/brew/${brewId}/design`);
  return { error: null };
}

/** 다 뽑혔으면 04로 간다. 기다리는 화면이 스스로 넘어가지는 않는다 — 눌러서 간다. */
export async function openPortfolioAction(formData: FormData): Promise<void> {
  await requireSession();
  redirect(`/edit/${String(formData.get("portfolioId") ?? "")}`);
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
