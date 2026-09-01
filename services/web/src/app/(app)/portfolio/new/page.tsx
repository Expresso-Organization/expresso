import { redirect } from "next/navigation";

import { brews } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

/**
 * 새 포트폴리오의 입구. 기준 문서 5.1.
 *
 * 빈 제작 항목을 만들고 곧바로 디자인 단계로 보낸다. v2 의 순서는 **디자인이
 * 먼저**다 — 무엇을 겨냥하는지는 생성 뒤 편집기에서 받는다. 그래서 여기서 묻는
 * 것이 없고 그릴 것도 없다. 누르면 첫 단계가 열린다.
 *
 * 제목은 임시값으로 시작한다. 위저드 헤더에서 언제든 고친다.
 *
 * 라우트 핸들러가 아니라 페이지인 이유는 하나다 — 타입이 붙은 링크가 걸 수
 * 있어야 사이드바와 홈이 이 경로를 가리킬 수 있다.
 */
export const dynamic = "force-dynamic";

export default async function NewPortfolioPage() {
  const session = await requireSession();
  const created = await brews.createFree(session.accessToken, {
    title: "새 포트폴리오",
    brief: "",
    lengthPreset: "single",
  });
  redirect(`/brew/${created.data.brewId}/design`);
}
