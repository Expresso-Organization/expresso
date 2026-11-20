import { AppBody, AppHeader } from "@/components/shell/AppShell";
import { SearchAndNotifications } from "@/components/shell/HeaderActions";
import { Icon } from "@/components/ui/Icon";
import { activities as activitiesApi, jobs as jobsApi } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

import type { Activity } from "@expresso/contracts";
import type { Route } from "next";

import { ActivityWall } from "./ActivityWall";
import { ACTIVITY_PAGE_SIZE, activitySourceNote, EXPLORE_KINDS, type ExploreKind } from "./explore";
import { ExploreFrame } from "./ExploreFrame";
import { JobRowList } from "./JobRows";
import { Pagination } from "./Pagination";
import styles from "./explore.module.css";
import jobStyles from "./page.module.css";

/**
 * 채용 공고가 아닌 종류의 탐색 화면 — 인턴 · 공모전 · 해커톤 · 부트캠프.
 *
 * 인턴은 적재한 공고에서 찾고, 공모전 · 해커톤 · 부트캠프는 서버가 수집해 둔 활동을 마감 순으로 읽는다(한 쪽 100건).
 */
export async function ExploreActivities({ kind, page }: { kind: Exclude<ExploreKind, "jobs">; page: number }) {
  const session = await requireSession();
  const label = EXPLORE_KINDS.find((item) => item.key === kind)?.label ?? "";
  return (
    <>
      <AppHeader title="탐색" actions={<SearchAndNotifications />} />
      <AppBody>
        <ExploreFrame kind={kind}>
          <div className={styles.paneScroll}>
            {kind === "intern" ? (
              <Interns accessToken={session.accessToken} />
            ) : (
              <Activities accessToken={session.accessToken} kind={kind} label={label} page={page} />
            )}
          </div>
        </ExploreFrame>
      </AppBody>
    </>
  );
}

async function Activities({ accessToken, kind, label, page }: { accessToken: string; kind: "contest" | "hackathon" | "bootcamp"; label: string; page: number }) {
  const listing = await activitiesApi.list(accessToken, { kind, limit: ACTIVITY_PAGE_SIZE, offset: (page - 1) * ACTIVITY_PAGE_SIZE });
  const totalPages = Math.ceil(listing.summary.total / ACTIVITY_PAGE_SIZE);
  return (
    <ActivityList
      label={label}
      icon={EXPLORE_KINDS.find((item) => item.key === kind)?.icon ?? "trophy"}
      rows={listing.data}
      total={listing.summary.total}
      pager={{ page, pageSize: ACTIVITY_PAGE_SIZE, totalPages, hasPrevPage: page > 1, hasNextPage: page < totalPages }}
      href={(next) => (next > 1 ? `/jobs?kind=${kind}&page=${next}` : `/jobs?kind=${kind}`) as Route}
    />
  );
}

/** 제목에 「인턴」이 든 진행 중 공고. 고용 형태를 정규화하기 전까지의 근사다. */
async function Interns({ accessToken }: { accessToken: string }) {
  const listing = await jobsApi.postings(accessToken, { q: "인턴", sort: "deadline", limit: 20 });
  if (listing.data.length === 0) return <Empty icon="student" title="진행 중인 인턴 공고가 없습니다" />;
  return (
    <div className={jobStyles.results}>
      <div className={jobStyles.resultsHead}>
        <span className={jobStyles.resultsCount}>인턴 · {listing.summary.total}건</span>
      </div>
      <JobRowList jobs={listing.data} tail="experience" now={Date.now()} />
    </div>
  );
}

function ActivityList({ label, icon, rows, total, pager, href }: {
  label: string;
  icon: string;
  rows: Activity[];
  total: number;
  pager: Parameters<typeof Pagination>[0]["page"];
  href: (next: number) => Route;
}) {
  if (rows.length === 0) return <Empty icon={icon} title={`접수 중인 ${label}이 없습니다`} />;
  return (
    <div className={jobStyles.results}>
      <div className={jobStyles.resultsHead}>
        <span className={jobStyles.resultsCount}>{label} · {total}건</span>
        <span className={jobStyles.resultsNote}>{activitySourceNote(rows)}</span>
      </div>
      <ActivityWall rows={rows} />
      <Pagination page={pager} href={href} />
    </div>
  );
}

function Empty({ icon, title }: { icon: string; title: string }) {
  return (
    <div className={styles.empty}>
      <span className={styles.emptyIcon}><Icon name={icon} size={18} /></span>
      <p className={styles.emptyTitle}>{title}</p>
    </div>
  );
}
