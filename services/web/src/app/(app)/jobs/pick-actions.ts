"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { blueprints } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

/**
 * 02 레시피가 「지원할 공고」를 이 화면에서 고른다.
 *
 * 공고를 고르는 자리를 따로 만들지 않는다 — 실제 공고 탐색이 필터도 일치도도
 * 다 가지고 있다. 여기서는 고른 공고를 블루프린트의 제작 의도에 적고 레시피로
 * 돌려보낸다.
 */
export async function pickPostingForBrewAction(formData: FormData): Promise<void> {
  const brewId = z.uuid().safeParse(String(formData.get("brewId") ?? ""));
  const jobPostingId = z.uuid().safeParse(String(formData.get("jobPostingId") ?? ""));
  if (!brewId.success || !jobPostingId.success) redirect("/jobs");

  const session = await requireSession();
  const { data: blueprint } = await blueprints.open(session.accessToken, brewId.data);
  await blueprints.edit(session.accessToken, blueprint.id, {
    operation: "update_intent",
    intent: { ...blueprint.intent, jobPostingId: jobPostingId.data },
  });
  redirect(`/brew/${brewId.data}/recipe`);
}
