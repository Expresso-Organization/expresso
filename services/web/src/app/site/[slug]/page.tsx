import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PortfolioPage } from "@/components/portfolio/PortfolioPage";
import { Icon } from "@/components/ui/Icon";
import { ApiError } from "@/lib/api/client";
import { portfolios } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

import styles from "./page.module.css";

/**
 * 08 공개 사이트. 소유자가 배포 전후로 지면을 확인하는 화면이라 상단에
 * 소유자 바가 붙는다.
 *
 * 지면은 `PortfolioPage` 하나가 그린다 — 03 후보 미리보기도 같은 컴포넌트를
 * 쓴다. 미리보기와 실제 지면이 갈리면 고르는 의미가 없다.
 *
 * 방문자용 경로(`{slug}.xpresso.me`)는 배포 스냅샷을 읽어야 해서 아직 별개다.
 */
export default async function PublicSitePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await requireSession();

  let portfolio;
  try {
    portfolio = (await portfolios.get(session.accessToken, slug)).data;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) {
      notFound();
    }
    throw error;
  }

  const deployment = portfolio.deployment;

  return (
    <div className={styles.page}>
      <div className={styles.ownerBar}>
        <Icon name="eye" size={15} color="var(--ex-fg-on-accent)" />
        <span className={styles.ownerLabel}>내 사이트를 보는 중</span>
        <span className={styles.ownerMeta}>
          {deployment ? `v${deployment.version} · ${deployment.subdomain}` : "아직 배포 전"}
        </span>
        <div className={styles.ownerActions}>
          <Link href={`/edit/${portfolio.id}` as Route} className={styles.ownerGhost}>
            편집으로
          </Link>
          <Link href={`/edit/${portfolio.id}/deploy` as Route} className={styles.ownerPrimary}>
            {deployment ? `v${deployment.version + 1} 배포` : "배포하기"}
          </Link>
        </div>
      </div>

      <div className={styles.stage}>
        <div className={styles.desktop}>
          {/* 지면은 아직 만들지 않았다 — 생성 계약이 붙기 전까지 기본 배치로 그린다. */}
          <PortfolioPage portfolio={portfolio} />
        </div>
      </div>
    </div>
  );
}
