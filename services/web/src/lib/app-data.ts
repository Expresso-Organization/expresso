import { cache } from "react";

import { engagement, portfolios as portfolioApi } from "./api/endpoints";

/**
 * 셸과 화면이 함께 읽는 응답들.
 *
 * 사이드바는 레이아웃이 그리고 홈 본문은 화면이 그리는데, 둘이 같은 두 응답을
 * 본다. App Router에서 레이아웃은 자식에게 데이터를 넘길 수 없으므로 각자 부르는
 * 것이 정상이고, `cache()`가 한 요청 안에서 실제 호출을 1회로 묶는다.
 */
export const homeEngagement = cache(async (accessToken: string) =>
  engagement.home(accessToken),
);

/** 사이드바의 "내 포트폴리오" 묶음. 홈의 포트폴리오 격자도 같은 목록을 쓴다. */
export const recentPortfolios = cache(async (accessToken: string) =>
  portfolioApi.list(accessToken, { limit: 5 }),
);
