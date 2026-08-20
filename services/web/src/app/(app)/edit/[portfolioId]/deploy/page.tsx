import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppBody, DocumentHeader } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { ApiError } from "@/lib/api/client";
import { entitlements, portfolios, publishing } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

import { DeployPanel } from "./DeployPanel";
import styles from "./page.module.css";

/**
 * 08b 배포 · 버전.
 *
 * 사전 확인은 **실제로 셀 수 있는 것만** 담는다. 정의서에는 "연락처가 비어
 * 있습니다" · "모바일에서 깨지는 블록 없음"도 있었지만, 연락처를 담는 자리도
 * 모바일 검사도 우리에게 없다 — 통과했다고 말할 근거가 없는 항목은 뺀다.
 */
export default async function DeployPage({
  params,
}: {
  params: Promise<{ portfolioId: string }>;
}) {
  const { portfolioId } = await params;
  const session = await requireSession();

  let portfolio;
  try {
    portfolio = (await portfolios.get(session.accessToken, portfolioId)).data;
  } catch (error) {
    // 없는 id도, UUID가 아닌 id(400)도 화면에서는 똑같이 없는 페이지다.
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) {
      notFound();
    }
    throw error;
  }

  const [{ data: deployments }, exportable] = await Promise.all([
    publishing.deployments(session.accessToken, portfolioId),
    entitlements.check(session.accessToken, "export.document"),
  ]);

  const nextVersion = (deployments[0]?.version ?? 0) + 1;
  const empty = portfolio.sections.filter(
    (section) => section.visible && section.blocks.length === 0,
  );
  const editor = `/edit/${portfolioId}` as Route;
  const checks = [
    {
      ok: portfolio.visibleSectionCount > 0,
      title: portfolio.visibleSectionCount > 0
        ? `${portfolio.visibleSectionCount}개 섹션이 나갑니다`
        : "보여줄 섹션이 없습니다",
      note: `블록 ${portfolio.blockCount}개 · 숨긴 섹션 ${portfolio.sectionCount - portfolio.visibleSectionCount}개`,
      ...(portfolio.visibleSectionCount > 0 ? {} : { fix: editor }),
    },
    {
      ok: empty.length === 0,
      title: empty.length === 0
        ? "모든 섹션에 내용이 있습니다"
        : `빈 섹션이 ${empty.length}개 있습니다`,
      note: empty.length === 0
        ? "빈 채로 나가는 섹션 없음"
        : empty.map((section) => section.title ?? "제목 없는 섹션").join(" · "),
      ...(empty.length === 0 ? {} : { fix: editor }),
    },
    {
      ok: !portfolio.deployment?.hasUnpublishedChanges,
      title: portfolio.deployment === null
        ? "아직 한 번도 나가지 않았습니다"
        : portfolio.deployment.hasUnpublishedChanges
          ? "편집본이 공개본보다 앞서 있습니다"
          : "공개본과 편집본이 같습니다",
      note: portfolio.deployment === null
        ? "배포하면 이 주소로 열립니다"
        : portfolio.deployment.hasUnpublishedChanges
          ? "지금 배포하면 고친 것이 함께 나갑니다"
          : "새로 배포할 것이 없습니다",
    },
  ];

  return (
    <>
      <DocumentHeader
        crumbs={[portfolio.title, "배포"]}
        actions={
          <>
            <span className={styles.headSaved}>저장됨</span>
            <Link href={editor} className={styles.headGhost}>
              편집으로
            </Link>
            <button type="submit" form="publish" className={styles.headPublish}>
              <Icon name="rocket-launch" size={14} />v{nextVersion} 배포
            </button>
          </>
        }
      />
      <AppBody>
        <div className={styles.body}>
          <div className={styles.inner}>
            <h1 className={styles.title}>배포</h1>
            <p className={styles.intro}>
              주소를 발급하고 버전 단위로 공개합니다. 배포하면 이전 버전은 남고, 언제든
              되돌릴 수 있습니다.
            </p>

            <DeployPanel
              portfolio={portfolio}
              deployments={deployments}
              checks={checks}
              canExport={exportable.data.allowed}
            />

            <div className={styles.footNote}>
              <Icon name="info" size={13} color="var(--ex-slate-400)" />
              공개를 중단해도 문서와 기록은 지워지지 않습니다. 주소만 접근할 수 없게 됩니다.
            </div>
          </div>
        </div>
      </AppBody>
    </>
  );
}
