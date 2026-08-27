"use server";

import { revalidatePath } from "next/cache";

import { ApiError } from "@/lib/api/client";
import { brews } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

/**
 * 01b 재료 고르기.
 *
 * 고른 목록은 **통째로** 보낸다. 하나씩 켜고 끄면 서버가 지금 몇 건인지 모르고,
 * 한도(10건)를 넘겼는지도 마지막 한 건을 받아 봐야 안다.
 */
export interface MaterialsResult {
  saved?: number;
  mode?: "solo" | "collab";
  error?: string;
}

function message(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 400) return "한 번에 10건까지 고를 수 있습니다.";
    if (error.status === 403) return "Cowork 모드는 PRO에서 쓸 수 있습니다.";
    if (error.status === 404) return "이 제작을 찾지 못했습니다.";
    if (error.status === 409) return "고를 수 없는 기록이 섞여 있습니다.";
  }
  return "저장하지 못했습니다. 다시 시도해 주세요.";
}

export async function selectMaterialsAction(
  _previous: MaterialsResult,
  formData: FormData,
): Promise<MaterialsResult> {
  const brewId = formData.get("brewId");
  if (typeof brewId !== "string") return {};
  const recordIds = formData.getAll("recordIds")
    .filter((id): id is string => typeof id === "string");

  const session = await requireSession();
  try {
    const { data } = await brews.selectMaterials(session.accessToken, brewId, recordIds);
    revalidatePath(`/brew/${brewId}/materials`);
    return { saved: data.materials.filter(({ selected }) => selected).length };
  } catch (error) {
    return { error: message(error) };
  }
}

export async function setModeAction(
  _previous: MaterialsResult,
  formData: FormData,
): Promise<MaterialsResult> {
  const brewId = formData.get("brewId");
  const mode = formData.get("mode");
  if (typeof brewId !== "string" || (mode !== "solo" && mode !== "collab")) return {};
  const session = await requireSession();
  try {
    const { data } = await brews.setMode(session.accessToken, brewId, mode);
    revalidatePath(`/brew/${brewId}/materials`);
    return { mode: data.mode };
  } catch (error) {
    return { error: message(error) };
  }
}
