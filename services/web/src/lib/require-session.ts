import type { AuthenticatedUser, CareerCategory } from "@expresso/contracts";
import { redirect } from "next/navigation";

import { ApiError } from "./api/client";
import { auth, career, entitlements } from "./api/endpoints";
import { readAccessToken } from "./session";

export interface AppSession {
  accessToken: string;
  user: AuthenticatedUser;
  categories: readonly CareerCategory[];
  /**
   * 이번 달 추출. 사이드바가 모든 화면에서 이 숫자를 그린다.
   *
   * 여기서 읽는 이유는 하나다 — 화면마다 손으로 적어 두면 틀린다. 실제로
   * 열한 화면이 `0 / 3`을 고정으로 그리고 있었고, 03이 진짜 값을 말하기
   * 시작하자 같은 화면 안에서 두 숫자가 서로 다른 말을 했다.
   */
  quota: { used: number; limit: number | null };
}

/**
 * 앱 셸 화면의 공통 진입점. 사이드바가 모든 화면에서 카테고리 트리를 그리므로
 * 사용자와 카테고리를 한 번에 가져온다.
 */
export async function requireSession(): Promise<AppSession> {
  const accessToken = await readAccessToken();
  if (!accessToken) redirect("/login");

  try {
    const [me, categories, generate] = await Promise.all([
      auth.me(accessToken),
      career.categories(accessToken),
      entitlements.check(accessToken, "portfolio.generate"),
    ]);
    return {
      accessToken,
      user: me.data,
      categories: categories.data,
      quota: {
        used: generate.data.usage?.used ?? 0,
        limit: generate.data.usage?.limit ?? null,
      },
    };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect("/login");
    throw error;
  }
}
