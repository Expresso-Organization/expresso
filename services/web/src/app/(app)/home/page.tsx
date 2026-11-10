import type { Route } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AppBody } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { homeEngagement, recentPortfolios, watchedJobs } from "@/lib/app-data";
import { requireSession } from "@/lib/require-session";

import { HomeHeader, HomeSearch } from "./HomeChrome";
import { HomeInsights } from "./HomeInsights";
import { HomeJobs } from "./HomeJobs";
import { HomePortfolios } from "./HomePortfolios";
import { MidRowSkeleton, PortfolioGridSkeleton } from "./HomeSkeleton";
import { careerProfile, portfoliosWithPage, roleJobs, siteInsights } from "./home-data";
import { exampleQueries, gridItems, roleTab } from "./home-model";
import styles from "./page.module.css";

/** 격자 한 줄이 세 칸이다. 「새 포트폴리오」 칸을 더해 두 줄을 채운다. */
const GRID_ITEMS = 5;

/**
 * 00 홈 — 지금 무엇을 해야 하는지 알려주는 화면.
 *
 * 위에서부터 검색창(기록이 없으면 첫 기록 카드), 공고 카드와 사이트 반응 차트,
 * 내 포트폴리오 격자. 기다리는 두 구획만 Suspense로 감싸 응답 하나가 늦어도
 * 나머지는 먼저 나간다. 두 구획이 함께 쓰는 응답은 `home-data`가 `cache()`로 묶는다.
 */
export default async function HomePage() {
  const session = await requireSession();
  const profile = await careerProfile(session.accessToken);
  const recordTotal = session.categories.reduce((sum, category) => sum + category.recordCount, 0);

  return (
    <>
      <HomeHeader />
      <AppBody>
        <div className={styles.content}>
          {recordTotal === 0 ? <FirstRun /> : <HomeSearch examples={exampleQueries(profile)} />}

          <Suspense fallback={<MidRowSkeleton />}>
            <MidRow accessToken={session.accessToken} role={roleTab(profile)} />
          </Suspense>

          {recordTotal > 0 ? (
            <Suspense fallback={<PortfolioGridSkeleton />}>
              <Portfolios accessToken={session.accessToken} />
            </Suspense>
          ) : null}
        </div>
      </AppBody>
    </>
  );
}

/** 기록이 없을 때 — 비교할 재료가 없으니 검색 대신 첫 기록이 먼저다. */
function FirstRun() {
  return (
    <div className={styles.firstRun}>
      <p className={styles.firstRunTitle}>첫 기록을 남기면 공고와 맞춰 볼 수 있습니다</p>
      <div className={styles.firstRunActions}>
        <Link href="/career/experience" className={styles.firstRunCta}>
          <Icon name="coffee" weight="fill" size={15} />
          경험 기록하기
        </Link>
        <Link href={"/brew/new" as Route} className={styles.firstRunSecondary}>
          공고로 바로 만들기
        </Link>
      </div>
    </div>
  );
}

/** 공고 카드와, 배포한 사이트가 있으면 그 오른쪽의 차트 카드. 차트가 없으면 공고 카드가 한 줄을 다 쓴다. */
async function MidRow({
  accessToken,
  role,
}: {
  accessToken: string;
  role: ReturnType<typeof roleTab>;
}) {
  const [jobs, interested, sites] = await Promise.all([
    roleJobs(accessToken, role.family),
    watchedJobs(accessToken),
    siteInsights(accessToken),
  ]);
  return (
    <div className={`${styles.midRow} ${sites.length > 0 ? "" : styles.midRowSingle}`}>
      <HomeJobs
        role={{ ...role, total: jobs.summary.total, rows: jobs.data }}
        interested={{ total: interested.summary.total, rows: interested.data }}
      />
      {sites.length > 0 ? (
        <div className={styles.sideColumn}>
          <HomeInsights sites={sites} />
        </div>
      ) : null}
    </div>
  );
}

async function Portfolios({ accessToken }: { accessToken: string }) {
  const [{ data: home }, { data: recent }, sites] = await Promise.all([
    homeEngagement(accessToken),
    recentPortfolios(accessToken),
    siteInsights(accessToken),
  ]);
  const items = gridItems(home.activeBrews, recent, GRID_ITEMS);
  const withPage = await portfoliosWithPage(
    accessToken,
    items.flatMap((item) => (item.kind === "portfolio" ? [item.portfolio.id] : [])),
  );
  return <HomePortfolios items={items} withPage={withPage} sites={sites} />;
}
