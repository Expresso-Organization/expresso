"use server";

import { z } from "zod";

import { ApiError } from "@/lib/api/client";
import { brews } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

/**
 * 진행 중인 제작을 대화로 잇는다. 그 제작을 붙인 대화(없으면 새 대화)에 지금 단계의 카드를 붙이고 그 대화의 ID를 돌려준다.
 * 대화를 만들고 카드를 붙이는 쓰기라 화면을 그릴 때가 아니라 화면이 뜬 뒤 부른다 — 링크를 미리 받을 때 돌지 않게 한다.
 */
export async function resumeBrewAction(brewId: string, again: boolean): Promise<{ conversationId: string } | { missing: true } | { error: string }> {
  const session = await requireSession();
  if (!z.uuid().safeParse(brewId).success) return { missing: true };
  try {
    return { conversationId: (await brews.resume(session.accessToken, brewId, again)).data.conversationId };
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) return { missing: true };
    if (error instanceof ApiError) return { error: "포트폴리오 제작을 열지 못했습니다. 잠시 뒤 다시 시도해 주세요." };
    throw error;
  }
}
