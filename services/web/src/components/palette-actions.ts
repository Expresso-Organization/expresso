"use server";

import type { Notification } from "@expresso/contracts";
import { z } from "zod";

import { engagement } from "@/lib/api/endpoints";
import { readAccessToken } from "@/lib/session";

/**
 * 00c 통합 검색 · 알림이 부르는 서버 액션.
 *
 * 오버레이는 클라이언트 컴포넌트라 토큰을 읽을 수 없다. 쿠키는 여기서 읽고,
 * 화면에는 계약으로 파싱한 결과만 넘긴다. 세션이 없으면 빈 결과를 돌려준다 —
 * 셸이 그려졌다면 세션 확인은 이미 화면이 했다.
 */
const IdSchema = z.uuid();

export async function searchAction(q: string) {
  const accessToken = await readAccessToken();
  const query = q.trim().slice(0, 200);
  if (!accessToken || !query) return [];
  return (await engagement.search(accessToken, query)).data;
}

export async function notificationsAction(): Promise<Notification[]> {
  const accessToken = await readAccessToken();
  if (!accessToken) return [];
  return (await engagement.notifications(accessToken)).data;
}

export async function markNotificationReadAction(id: string): Promise<Notification | null> {
  const accessToken = await readAccessToken();
  if (!accessToken || !IdSchema.safeParse(id).success) return null;
  return (await engagement.markNotificationRead(accessToken, id)).data;
}

export async function markAllNotificationsReadAction(): Promise<number> {
  const accessToken = await readAccessToken();
  if (!accessToken) return 0;
  return (await engagement.markAllNotificationsRead(accessToken)).data.updated;
}
