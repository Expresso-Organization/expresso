import type { AuthenticatedUser, CareerCategory } from "@expresso/contracts";
import { redirect } from "next/navigation";
import { cache } from "react";

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
 *
 * `cache()`로 감싼 이유 — App Router에서 레이아웃은 자식에게 데이터를 넘길 수
 * 없다. 그래서 셸을 그리는 레이아웃과 그 안의 화면이 **각자** 이 함수를 부르는
 * 것이 정상이다. 메모이제이션이 없으면 한 번 그릴 때 백엔드에 세 번씩 두 벌,
 * 여섯 번이 나간다. 감싸 두면 한 요청 안에서는 몇 번을 부르든 실제 호출은 1회다.
 */
export const requireSession = cache(async (): Promise<AppSession> => {
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
});
