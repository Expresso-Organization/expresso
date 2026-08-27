import type { GeneratedPage, PortfolioRevision } from "@expresso/contracts";
import { notFound } from "next/navigation";

import { ApiError } from "@/lib/api/client";
import { page as pageApi, portfolios } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

import { Editor } from "./Editor";

/**
 * 04 · 04b · 04c 다듬기. 에디터 셸은 앱 셸을 쓰지 않고 사이드바를 56px
 * 아이콘 레일로 접는다 (§4.3).
 *
 * 섹션 · 블록 · 배포 상태 · 변경 이력은 실제 API에서 옵니다. 채팅과 속성 탭은
 * 블록 편집 API와 AI 계약이 아직 없어 예시 데이터로 둡니다.
 */
export default async function EditPage({
  params,
}: {
  params: Promise<{ portfolioId: string }>;
}) {
  const { portfolioId } = await params;
  const session = await requireSession();

  let portfolio;
  let revisions: readonly PortfolioRevision[] = [];
  let checkpoints: { id: string; label: string; createdAt: string }[] = [];
  let generatedPage: GeneratedPage | null = null;
  let generatedPageHistory: GeneratedPage[] = [];

  try {
    const [detail, history] = await Promise.all([
      portfolios.get(session.accessToken, portfolioId),
      portfolios.revisions(session.accessToken, portfolioId, { limit: 20 }),
    ]);
    portfolio = detail.data;
    revisions = history.data.revisions;
    checkpoints = history.data.checkpoints.map((checkpoint) => ({
      id: checkpoint.id,
      label: checkpoint.label,
      createdAt: checkpoint.createdAt,
    }));
  } catch (error) {
    // 없는 id도, UUID가 아닌 id(400)도 화면에서는 똑같이 없는 페이지다.
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) {
      notFound();
    }
    throw error;
  }

  try {
    const [latest, history] = await Promise.all([
      pageApi.latest(session.accessToken, portfolioId),
      pageApi.history(session.accessToken, portfolioId),
    ]);
    generatedPage = latest.data;
    generatedPageHistory = history.data;
  } catch (error) {
    // 자유 지면은 v1 생성부터 생긴다. 옛 포트폴리오의 404는 정상 호환 경로다.
    if (!(error instanceof ApiError && error.status === 404)) throw error;
  }

  return (
    <Editor
      displayName={session.user.displayName}
      portfolio={portfolio}
      revisions={revisions}
      checkpoints={checkpoints}
      generatedPage={generatedPage}
      generatedPageHistory={generatedPageHistory}
    />
  );
}
