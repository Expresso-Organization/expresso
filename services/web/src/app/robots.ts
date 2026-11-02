import type { MetadataRoute } from "next";

/**
 * 수집기가 들어갈 수 있는 곳.
 *
 * 앱 화면은 모두 로그인 뒤에 있어 수집할 것이 없다. 공개 포트폴리오는 호스트가
 * 사이트마다 다르고(`{slug}.expresso.ai.kr`) 그 호스트의 `/robots.txt`도 이 파일이
 * 답한다 — 거기서는 금지 목록의 경로가 없으므로 사실상 전부 허용이다. 사이트별 색인
 * 여부는 각 사이트의 robots 메타가 정한다.
 *
 * sitemap은 적지 않는다. 공개 사이트 목록을 주는 API가 없고, 호스트가 사이트마다
 * 달라 한 파일로 모을 수 없다.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/home",
        "/jobs",
        "/analytics",
        "/career",
        "/account",
        "/brew",
        "/edit",
        "/onboarding",
        "/api",
        "/admin",
        "/login",
        "/signup",
        "/verify-email",
      ],
    },
  };
}
