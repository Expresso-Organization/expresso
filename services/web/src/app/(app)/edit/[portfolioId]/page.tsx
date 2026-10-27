import type { GeneratedPage, PageEditorDesign, PortfolioRevision } from "@expresso/contracts";
import { notFound } from "next/navigation";

import { ApiError } from "@/lib/api/client";
import { career, page as pageApi, portfolios } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

import { Editor } from "./Editor";
import type { LibraryRecord } from "./RecordLibrary";

/**
 * 04 · 04b · 04c 다듬기. 에디터 셸은 앱 셸을 쓰지 않고 사이드바를 56px
 * 아이콘 레일로 접는다 (§4.3).
 *
 * 섹션 · 블록 · 배포 상태 · 변경 이력 · 생성 지면은 모두 실제 API에서 옵니다.
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
  let revisionsCursor: string | null = null;
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
    revisionsCursor = history.page.hasNextPage ? history.page.nextCursor : null;
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

  // 구조화 지면은 요소를 직접 고칠 디자인 값과, 지면에 더할 커리어 기록 목록을 함께 읽는다.
  let design: PageEditorDesign | null = null;
  let editableRender: { html: string; css: string } | null = null;
  let records: LibraryRecord[] | null = [];
  if (generatedPage?.generationManifest?.structured) {
    const [designResult, editable, library] = await Promise.all([
      pageApi.design(session.accessToken, portfolioId),
      pageApi.editable(session.accessToken, portfolioId),
      // 기록 목록을 읽지 못해도 지면 편집은 연다. 기록 탭만 그 사실을 보인다.
      Promise.all([
        career.records(session.accessToken, { sort: "updated_desc", limit: 100 }),
        career.categories(session.accessToken),
      ]).catch(() => null),
    ]);
    design = designResult.data;
    // 편집 미리보기는 요소 키 표시가 있는 렌더 결과로 그린다. 같은 판일 때만 쓴다.
    if (editable.data.revision === generatedPage.revision) editableRender = { html: editable.data.html, css: editable.data.css };
    const [recordList, categories] = library ?? [null, null];
    const names = new Map(categories?.data.map((category) => [category.id, category.name]));
    records = recordList === null ? null : recordList.data
      .filter((record) => !record.isEmpty && record.bodyMd.trim())
      .map((record) => ({
        id: record.id,
        title: record.title || "제목 없는 기록",
        category: names.get(record.categoryId) ?? "기록",
        period: record.periodFrom ? `${record.periodFrom.slice(0, 7).replace("-", ".")} — ${record.periodTo ? record.periodTo.slice(0, 7).replace("-", ".") : "진행 중"}` : null,
      }));
  }

  return (
    <Editor
      displayName={session.user.displayName}
      portfolio={portfolio}
      revisions={revisions}
      revisionsCursor={revisionsCursor}
      checkpoints={checkpoints}
      generatedPage={generatedPage}
      generatedPageHistory={generatedPageHistory}
      design={design}
      editableRender={editableRender}
      records={records}
    />
  );
}
