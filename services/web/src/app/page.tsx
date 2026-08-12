import { redirect } from "next/navigation";

import { readAccessToken } from "@/lib/session";

/**
 * §2.1 — 랜딩은 비로그인 마케팅 페이지이고, 로그인 상태면 /home으로 보낸다.
 * 랜딩 자체는 아직 만들지 않았으므로 지금은 로그인으로 보낸다.
 */
export default async function RootPage() {
  redirect((await readAccessToken()) ? "/home" : "/login");
}
