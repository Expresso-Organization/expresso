import type { Route } from "next";
import { redirect } from "next/navigation";

import { requireSession } from "@/lib/require-session";

/**
 * `/career`에는 화면이 없다. 카테고리 목록은 사이드바가 이미 보여 주므로, 여기로
 * 들어온 사람은 첫 카테고리 화면으로 보낸다. 홈과 사이드바도 같은 자리로 간다.
 */
export default async function CareerIndexPage() {
  const session = await requireSession();
  const first = session.categories[0]?.key ?? "experience";
  redirect(`/career/${first}` as Route);
}
