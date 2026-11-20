import type { PortfolioSummary } from "@expresso/contracts";

/**
 * 포트폴리오의 공개 상태 — 편집 화면 상단과 배포 화면이 같은 판정을 쓴다.
 *
 * - `draft`: 한 번도 배포하지 않았다.
 * - `live`: 공개 중이고 공개본이 편집본과 같다.
 * - `changed`: 공개 중인데 배포한 뒤 고친 것이 아직 나가지 않았다.
 * - `unlisted`: 배포한 판은 있지만 공개를 중단해 주소가 닫혀 있다.
 */
export type PublishState = "draft" | "live" | "changed" | "unlisted";

export function publishState(portfolio: Pick<PortfolioSummary, "status" | "deployment">): PublishState {
  const { deployment } = portfolio;
  if (deployment === null) return "draft";
  if (portfolio.status !== "published") return "unlisted";
  return deployment.hasUnpublishedChanges ? "changed" : "live";
}

/** 편집 화면에서 배포 화면으로 가는 버튼의 이름. 지금 해야 할 일을 그대로 부른다. */
export const PUBLISH_ACTION_LABEL: Record<PublishState, string> = {
  draft: "배포하기",
  changed: "다시 배포",
  live: "배포 관리",
  unlisted: "다시 공개",
};
