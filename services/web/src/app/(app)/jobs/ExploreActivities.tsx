import { AppBody, AppHeader } from "@/components/shell/AppShell";
import { SearchAndNotifications } from "@/components/shell/HeaderActions";
import { Icon } from "@/components/ui/Icon";
import { jobs as jobsApi } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

import { EXPLORE_KINDS, activities, type Activity, type ExploreKind } from "./explore";
import { ExploreFrame } from "./ExploreFrame";
import { JobRowList } from "./JobRows";
import styles from "./explore.module.css";
import jobStyles from "./page.module.css";

/**
 * 채용 공고가 아닌 종류의 탐색 화면 — 인턴 · 공모전 · 해커톤 · 부트캠프.
 *
 * 인턴은 적재한 공고에서 찾고, 공모전 · 해커톤은 위비티 목록을 읽는다. 부트캠프는 출처
 * (고용24 훈련과정 API)를 아직 붙이지 않아 비어 있다.
 */
export async function ExploreActivities({ kind }: { kind: Exclude<ExploreKind, "jobs"> }) {
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
            ) : kind === "bootcamp" ? (
              <Empty icon="chalkboard-teacher" title="수집한 부트캠프 과정이 없습니다" />
            ) : (
              <ActivityList label={label} rows={await activities(kind)} />
            )}
          </div>
        </ExploreFrame>
      </AppBody>
    </>
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

function ActivityList({ label, rows }: { label: string; rows: Activity[] }) {
  if (rows.length === 0) return <Empty icon="trophy" title={`접수 중인 ${label}이 없습니다`} />;
  return (
    <div className={jobStyles.results}>
      <div className={jobStyles.resultsHead}>
        <span className={jobStyles.resultsCount}>{label} · {rows.length}건</span>
        <span className={jobStyles.resultsNote}>위비티 웹/모바일/IT · 게임/소프트웨어</span>
      </div>
      <div className={styles.activities}>
        {rows.map((row) => (
          <a key={row.id} href={row.url} target="_blank" rel="noreferrer" className={styles.activity}>
            <span className={styles.activityMark}>{row.host.slice(0, 1)}</span>
            <span className={styles.activityBody}>
              <span className={styles.activityTitle}>{row.title}</span>
              <span className={styles.activityMeta}>{row.host}</span>
            </span>
            <span className={styles.activityTags}>
              {row.fields.slice(0, 2).map((field) => (
                <span key={field} className={styles.activityTag}>{field}</span>
              ))}
            </span>
            <span className={styles.activityStatus}>{row.status}</span>
            <span className={`${styles.activityDeadline} ${row.daysLeft <= 7 ? styles.activityDeadlineUrgent : ""}`}>
              D-{row.daysLeft}
            </span>
            <Icon name="arrow-square-out" size={13} className={styles.activityOut} />
          </a>
        ))}
      </div>
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
