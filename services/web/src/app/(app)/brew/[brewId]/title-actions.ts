"use server";

import { revalidatePath } from "next/cache";

import type { TitleEditState } from "@/components/shell/WizardTitleEditor";
import { ApiError } from "@/lib/api/client";
import { brews } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

/**
 * 제작 머리말의 이름을 바꾼다(`PATCH /brews/:id`의 `title`).
 *
 * 머리말은 여섯 단계 화면이 모두 그리므로 브루 아래 화면을 함께 다시 그린다.
 * 추출이 포트폴리오를 만들 때 이 이름을 쓴다.
 */
export async function renameBrewAction(
  brewId: string,
  _state: TitleEditState,
  formData: FormData,
): Promise<TitleEditState> {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "이름을 적어 주세요." };
  if (title.length > 300) return { error: "이름은 300자까지 적을 수 있습니다." };

  const session = await requireSession();
  try {
    await brews.rename(session.accessToken, brewId, title);
  } catch (error) {
    if (error instanceof ApiError) {
      return {
        error: error.status === 404
          ? "이 제작을 찾지 못했습니다. 홈에서 다시 열어 주세요."
          : "이름을 바꾸지 못했습니다. 잠시 뒤 다시 눌러 주세요.",
      };
    }
    throw error;
  }

  revalidatePath("/brew/[brewId]", "layout");
  return { error: null };
}
