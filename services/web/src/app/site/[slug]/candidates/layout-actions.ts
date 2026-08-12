"use server";

import { revalidatePath } from "next/cache";

import { portfolios } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

/**
 * 03에서 지면을 고른다.
 *
 * 고른 지면은 곧바로 공개 사이트와 에디터에 실린다. 되돌리려면 다른 후보를
 * 다시 고르면 된다 — 후보는 지워지지 않는다.
 */
export async function selectLayoutAction(formData: FormData): Promise<void> {
  const portfolioId = formData.get("portfolioId");
  const layoutId = formData.get("layoutId");
  if (typeof portfolioId !== "string" || typeof layoutId !== "string") return;

  const session = await requireSession();
  await portfolios.selectLayout(session.accessToken, portfolioId, layoutId);
  revalidatePath(`/site/${portfolioId}/candidates`);
  revalidatePath(`/site/${portfolioId}`);
}
