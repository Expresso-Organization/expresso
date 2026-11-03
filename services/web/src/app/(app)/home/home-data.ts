import { cache } from "react";

import { analytics, career, jobs, page, portfolios } from "@/lib/api/endpoints";

import { siteInsight, type SiteInsight } from "./home-model";

/**
 * 00 홈이 기다리는 응답. 구획 둘(공고 줄 · 포트폴리오 격자)이 같은 응답을 함께 쓰므로
 * `cache()`로 감싸 요청 한 번에 한 번만 부른다.
 */

/** 온보딩에서 정한 목표 직군 · 경력. 온보딩을 지나지 않았으면 null. */
export const careerProfile = cache(async (accessToken: string) =>
  (await career.profile(accessToken)).data,
);

/** 공고 카드 첫 탭. 목표 직군이 있으면 그 직군을 일치도 순으로, 없으면 전체를 최근 순으로. */
export const roleJobs = cache(async (accessToken: string, family: string | null) =>
  jobs.postings(accessToken, family
    ? { family, deadline: "open", sort: "match", limit: 5 }
    : { deadline: "open", sort: "recent", limit: 5 }),
);

/** 차트 색이 셋이라 사이트도 셋까지 그린다 — 넷째 색을 새로 만들지 않는다. */
const MAX_SITES = 3;

/**
 * 배포한 사이트의 최근 30일. 가장 최근에 배포한 셋을 07 분석 대시보드로 읽는다.
 * 한 사이트가 실패하면 그 사이트만 빼고 그린다. 순서는 먼저 배포한 사이트부터라,
 * 새 사이트가 생겨도 남은 사이트의 선 색이 바뀌지 않는다.
 */
export const siteInsights = cache(async (accessToken: string): Promise<SiteInsight[]> => {
  const { data } = await portfolios.list(accessToken, { status: "published" });
  const deployed = data
    .filter((portfolio) => portfolio.deployment)
    .sort((left, right) => (right.deployment?.publishedAt ?? "").localeCompare(left.deployment?.publishedAt ?? ""))
    .slice(0, MAX_SITES);
  const read = await Promise.allSettled(
    deployed.map(async (portfolio) => siteInsight(portfolio, (await analytics.dashboard(accessToken, portfolio.id, "30d")).data)),
  );
  return read
    .flatMap((result) => (result.status === "fulfilled" ? [result.value] : []))
    .sort((left, right) => (left.publishedOn ?? "").localeCompare(right.publishedOn ?? ""));
});

/**
 * 썸네일을 그릴 지면이 있는 포트폴리오. 지면이 없는 포트폴리오에 미리보기 틀을 세우면
 * 오류 문서가 축소되어 보이므로, 먼저 확인하고 없으면 빗금을 세운다.
 */
export const portfoliosWithPage = cache(async (accessToken: string, ids: string[]) => {
  const found = await Promise.all(
    ids.map(async (id) => ((await page.latest(accessToken, id).catch(() => null)) ? id : null)),
  );
  return new Set(found.filter((id): id is string => id !== null));
});
