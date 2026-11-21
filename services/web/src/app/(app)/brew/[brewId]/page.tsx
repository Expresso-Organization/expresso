import { notFound, redirect } from "next/navigation";

import { ApiError } from "@/lib/api/client";
import { brews } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

/**
 * 진행 중인 제작을 잇는 주소. 단계와 관계없이 그 제작을 붙인 대화로 보낸다 — 대화가 없으면(옛 단계 화면에서 만든 제작)
 * 새 대화를 만들어 「포트폴리오 제작」 카드와 지금 단계의 카드를 붙인다. 편집의 「다시 뽑기」(`?again=1`)는 다 만든 제작에도
 * 다시 만들 수 있는 디자인 카드를 붙인다. 카드만 붙이고 AI는 부르지 않는다.
 */
export default async function BrewResumePage({
  params,
  searchParams,
}: {
  params: Promise<{ brewId: string }>;
  searchParams: Promise<{ again?: string }>;
}) {
  const session = await requireSession();
  const [{ brewId }, query] = await Promise.all([params, searchParams]);
  let conversationId: string;
  try {
    conversationId = (await brews.resume(session.accessToken, brewId, query.again === "1")).data.conversationId;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) notFound();
    throw error;
  }
  redirect(`/home?chat=${conversationId}`);
}
