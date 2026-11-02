import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { readAccessToken } from "@/lib/session";

import { Landing } from "./LandingSections";

const TITLE = "Expresso — 공고에 맞춘 포트폴리오";
const DESCRIPTION =
  "채용 공고와 내 커리어 기록을 대조해 지원하는 곳마다 맞춘 포트폴리오 사이트를 만들고, 링크 하나로 보냅니다.";

/** 링크를 메신저에 붙였을 때 뜨는 머리. 주소는 요청 호스트가 아니라 앱의 공개 주소다. */
export function generateMetadata(): Metadata {
  const base = (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  return {
    title: TITLE,
    description: DESCRIPTION,
    openGraph: { title: TITLE, description: DESCRIPTION, url: `${base}/`, type: "website", siteName: "Expresso" },
  };
}

/**
 * `/` — 로그인하지 않은 방문자에게는 제품 소개를, 로그인한 사용자에게는 홈을 보여 준다.
 *
 * 공개 포트폴리오 호스트(`{slug}.expresso.ai.kr`)의 `/`는 프록시가 `/site/{slug}`로 다시
 * 쓰므로 여기까지 오지 않는다.
 */
export default async function LandingPage() {
  if (await readAccessToken()) redirect("/home");
  return <Landing />;
}
