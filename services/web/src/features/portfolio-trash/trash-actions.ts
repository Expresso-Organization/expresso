"use server";

import type { TrashedBrew, TrashedPortfolio } from "@expresso/contracts";
import { revalidatePath } from "next/cache";

import { ApiError } from "@/lib/api/client";
import { brews, portfolios } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

export type TrashKind = "portfolio" | "brew";
export type TrashResult = { error: string | null };

/** 홈 격자와 사이드바가 같은 목록을 그리므로 앱 레이아웃 전체를 다시 그린다. */
function refreshLists() {
  revalidatePath("/", "layout");
}

/** 포트폴리오 · 만들던 포트폴리오를 휴지통으로 옮긴다. */
export async function trashAction(kind: TrashKind, id: string): Promise<TrashResult> {
  const session = await requireSession();
  try {
    if (kind === "portfolio") await portfolios.trash(session.accessToken, id);
    else await brews.trash(session.accessToken, id);
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    if (error.status === 409) return { error: "생성 중인 포트폴리오는 옮길 수 없습니다. 생성이 끝난 뒤 다시 눌러 주세요." };
    if (error.status === 404) return { error: "이미 휴지통에 있거나 찾을 수 없습니다. 화면을 새로 고쳐 주세요." };
    return { error: "휴지통으로 옮기지 못했습니다. 잠시 뒤 다시 눌러 주세요." };
  }
  refreshLists();
  return { error: null };
}

export async function restoreAction(kind: TrashKind, id: string): Promise<TrashResult> {
  const session = await requireSession();
  try {
    if (kind === "portfolio") await portfolios.restore(session.accessToken, id);
    else await brews.restore(session.accessToken, id);
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    return { error: error.status === 404 ? "보관 기간이 지나 되살릴 수 없습니다." : "되살리지 못했습니다. 잠시 뒤 다시 눌러 주세요." };
  }
  refreshLists();
  return { error: null };
}

export type TrashList = { portfolios: TrashedPortfolio[]; brews: TrashedBrew[] } | { error: string };

/** 휴지통 창의 목록. 포트폴리오와 만들던 포트폴리오를 함께 낸다. */
export async function loadTrashAction(): Promise<TrashList> {
  const session = await requireSession();
  try {
    const [portfolioList, brewList] = await Promise.all([portfolios.trashList(session.accessToken), brews.trashList(session.accessToken)]);
    return { portfolios: portfolioList.data, brews: brewList.data };
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    return { error: "휴지통을 불러오지 못했습니다." };
  }
}
