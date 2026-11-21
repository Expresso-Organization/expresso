import { ResumeBrew } from "./ResumeBrew";

/**
 * 진행 중인 제작을 잇는 주소. 단계와 관계없이 그 제작을 붙인 대화로 보낸다 — 대화가 없으면(옛 단계 화면에서 만든 제작)
 * 새 대화를 만들어 「포트폴리오 제작」 카드와 지금 단계의 카드를 붙인다. 편집의 「다시 뽑기」(`?again=1`)는 다 만든 제작에도
 * 다시 만들 수 있는 디자인 카드를 붙인다. 카드만 붙이고 AI는 부르지 않는다.
 *
 * 잇는 일은 쓰기다. 그리는 동안에는 하지 않고 화면이 뜬 뒤 `ResumeBrew`가 한 번 한다 — 사이드바 · 라이브러리의 링크를 미리 받을 때
 * 대화가 생기지 않게 한다.
 */
export default async function BrewResumePage({
  params,
  searchParams,
}: {
  params: Promise<{ brewId: string }>;
  searchParams: Promise<{ again?: string }>;
}) {
  const [{ brewId }, query] = await Promise.all([params, searchParams]);
  return <ResumeBrew brewId={brewId} again={query.again === "1"} />;
}
