import type { PortfolioSummary } from "@expresso/contracts";
import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { CompanyAvatar } from "@/components/ui/CompanyAvatar";
import { Icon } from "@/components/ui/Icon";
import { publicSiteHost } from "@/lib/public-site";

import { resumeStep } from "../brew/new/resume-step";
import type { ActiveBrew, GridItem, SiteInsight } from "./home-model";
import styles from "./page.module.css";

/**
 * 00 「내 포트폴리오」 격자. 만들다 만 제작도 같은 카드 모양으로 함께 선다 —
 * 사용자에게는 둘 다 "내 포트폴리오"다. 카드 위쪽은 실제 지면의 축소본이고,
 * 지면이 아직 없으면 사이드바 썸네일과 같은 빗금이 선다.
 */
export function HomePortfolios({
  items,
  withPage,
  sites,
}: {
  items: GridItem[];
  withPage: Set<string>;
  sites: SiteInsight[];
}) {
  const stats = new Map(sites.map((site) => [site.portfolioId, site]));
  return (
    <div>
      <div className={styles.sectionHead}>
        <span className={styles.sectionTitle}>내 포트폴리오</span>
      </div>
      <div className={styles.portfolioGrid}>
        {items.map((item) =>
          item.kind === "brew" ? (
            <BrewCard key={item.brew.id} brew={item.brew} />
          ) : (
            <PortfolioCard
              key={item.portfolio.id}
              portfolio={item.portfolio}
              hasPage={withPage.has(item.portfolio.id)}
              site={stats.get(item.portfolio.id) ?? null}
            />
          ),
        )}
        <Link href={"/brew/new" as Route} className={styles.newPortfolio}>
          <span className={styles.newPortfolioIcon}>
            <Icon name="plus" size={18} color="var(--ex-accent-text)" />
          </span>
          <span className={styles.newPortfolioTitle}>새 포트폴리오</span>
        </Link>
      </div>
    </div>
  );
}

/** 끝나지 않은 제작. 배지는 멈춘 단계이고, 누르면 그 단계로 간다. */
function BrewCard({ brew }: { brew: ActiveBrew }) {
  const step = resumeStep(brew.status);
  return (
    <Link href={`/brew/${brew.id}/${step.segment}` as Route} className={styles.portfolioCard}>
      <div className={styles.portfolioThumb}>
        <span className={`${styles.portfolioBadge} ${styles.badgeMaking}`}>
          {brew.status === "generating" ? <span className={`${styles.workingDot} ex-anim-pulse`} /> : null}
          {step.label}
        </span>
      </div>
      <CardBody title={brew.title ?? "만들던 포트폴리오"} company={brew.company} posting={null}>
        <span className={styles.portfolioMeta}>{formatAt(brew.updatedAt)}</span>
      </CardBody>
    </Link>
  );
}

function PortfolioCard({
  portfolio,
  hasPage,
  site,
}: {
  portfolio: PortfolioSummary;
  hasPage: boolean;
  site: SiteInsight | null;
}) {
  const { deployment, target } = portfolio;
  return (
    <Link href={`/edit/${portfolio.id}` as Route} className={styles.portfolioCard}>
      {/*
        넓은 화면 폭으로 그린 지면을 1/4로 줄인다. 04 새 탭 미리보기와 같은 문서라 배포될 모습 그대로다.
        카드를 누르는 자리라 틀 안은 손이 닿지 않고, 화면 밖 카드는 내려오기 전까지 불러오지 않는다.
      */}
      <div className={styles.portfolioThumb} inert>
        {hasPage ? (
          <iframe
            src={`/edit/${portfolio.id}/preview`}
            title={`${portfolio.title} 미리보기`}
            loading="lazy"
            tabIndex={-1}
            className={styles.portfolioFrame}
          />
        ) : null}
        <span className={`${styles.portfolioBadge} ${deployment ? styles.badgeLive : styles.badgeDraft}`}>
          {deployment ? "배포됨" : "초안"}
        </span>
      </div>
      <CardBody title={portfolio.title} company={target?.company ?? null} posting={target?.postingTitle ?? null}>
        {deployment ? (
          <>
            <span className={styles.portfolioHost}>
              {publicSiteHost(deployment.subdomain)} · v{deployment.version}
            </span>
            {site ? (
              <span className={styles.portfolioStats}>
                <span>
                  방문 <b>{site.visits}</b>
                </span>
                <span>
                  연락처 <b>{site.contactClicks}</b>
                </span>
              </span>
            ) : null}
          </>
        ) : (
          <span className={styles.portfolioMeta}>{formatAt(portfolio.updatedAt)}</span>
        )}
      </CardBody>
    </Link>
  );
}

/** 카드 아래 칸 — 대상 회사 마크와 이름, 대상 공고, 바닥 줄. */
function CardBody({
  title,
  company,
  posting,
  children,
}: {
  title: string;
  company: { name: string; logoUrl: string | null } | null;
  posting: string | null;
  children: ReactNode;
}) {
  return (
    <div className={styles.portfolioBody}>
      <div className={styles.portfolioTitleRow}>
        {company ? (
          <CompanyAvatar company={{ name: company.name, logoUrl: company.logoUrl }} className={styles.portfolioAvatar} />
        ) : null}
        <span className={styles.portfolioTitle}>{title}</span>
      </div>
      {company ? (
        <span className={styles.portfolioTarget}>{posting ? `${company.name} · ${posting}` : company.name}</span>
      ) : null}
      <div className={styles.portfolioFoot}>{children}</div>
    </div>
  );
}

function formatAt(at: string): string {
  return new Date(at).toLocaleString("ko-KR", {
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  });
}
