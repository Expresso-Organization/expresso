import type { JobPostingSummary } from "@expresso/contracts";
import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { Skel } from "@/components/shell/Skeleton";
import { CompanyAvatar } from "@/components/ui/CompanyAvatar";
import { Icon } from "@/components/ui/Icon";
import { homeEngagement, watchedJobs } from "@/lib/app-data";
import { activities, career, jobs, portfolios, proposals } from "@/lib/api/endpoints";

import { resumeStep } from "../brew/new/resume-step";
import { ProposalFeed } from "./ProposalFeed";
import { briefingSteps } from "./briefing";
import { careerProfile, siteInsights } from "./home-data";
import { roleTab } from "./home-model";
import styles from "./home-start.module.css";

/** 목록 응답 한 장의 상한(계약의 `limit` 최댓값). */
const RECORD_PAGE = 100;
const PORTFOLIO_PAGE = 50;
/** 위젯 하나에 세우는 줄 수. */
const ROWS = 4;
/** 마감 임박의 기준. 공고 목록의 `deadline=urgent`와 같은 7일이다. */
const URGENT_DAYS = 7;

/**
 * 제안 공간. 에이전트가 쓴 제안과 실행 상태를 서버에서 읽는다.
 * 규칙으로 센 제안(`briefingSteps`)은 크레딧이 남지 않아 에이전트가 쓰지 못했을 때 대신 보이도록 함께 넘긴다.
 */
export async function Proposals({ accessToken, recordTotal }: { accessToken: string; recordTotal: number }) {
  // 구직 목표가 없으면 제안 맨 앞에 목표를 묻는 카드가 선다.
  const [{ data: feed }, { data: goal }] = await Promise.all([proposals.feed(accessToken), career.goal(accessToken)]);
  // 규칙 제안은 대신 보일 때만 센다. 평소에는 그 응답들을 부르지 않는다.
  const fallback = feed.enabled && feed.run.reason === "no_credits" ? await ruleFindings(accessToken, recordTotal) : [];
  return <ProposalFeed initial={feed} fallback={fallback} hasGoal={goal !== null} />;
}

async function ruleFindings(accessToken: string, recordTotal: number) {
  const [records, home, list, sites, watched] = await Promise.all([
    career.records(accessToken, { sort: "updated_desc", limit: RECORD_PAGE }),
    homeEngagement(accessToken),
    portfolios.list(accessToken, { limit: PORTFOLIO_PAGE }),
    siteInsights(accessToken),
    watchedJobs(accessToken),
  ]);
  return briefingSteps({
    records: records.data,
    recordTotal,
    brews: home.data.activeBrews,
    portfolios: list.data,
    sites,
    watched: watched.data,
    jobTotal: 0,
    contests: [],
    brewHref: (brew) => `/brew/${brew.id}/${resumeStep(brew.status).segment}`,
  }).flatMap((step) => step.findings);
}

// 스켈레톤 틀은 150ms 뒤에 나타난다(ex-anim-appear) — 짧은 대기에 빈 틀이 번쩍이지 않는다.
export function ProposalsSkeleton() {
  return (
    <section className={`${styles.proposals} ex-anim-appear`}>
      <div className={styles.sectionHead}><Skel w={64} /></div>
      <div className={styles.proposalGrid}>
        <div className={styles.skeletonCard}><Skel w={180} /><Skel w={120} /></div>
        <div className={styles.skeletonCard}><Skel w={160} /><Skel w={140} /></div>
      </div>
    </section>
  );
}

/** 새 소식 위젯이 서는 자리. */
export function Widgets({ children }: { children: ReactNode }) {
  return <section className={styles.widgets}>{children}</section>;
}

function Widget({ icon, title, href, children }: { icon: string; title: string; href: string; children: ReactNode }) {
  // 스켈레톤 카드 자리에서 떠오른다(ex-anim-reveal).
  return (
    <section className={`${styles.widget} ex-anim-reveal`}>
      <header className={styles.widgetHead}>
        <Icon name={icon} size={14} />
        <h2 className={styles.widgetTitle}>{title}</h2>
        <Link href={href as Route} className={styles.widgetMore} aria-label={`${title} 모두 보기`}>
          <Icon name="arrow-right" size={13} />
        </Link>
      </header>
      {children}
    </section>
  );
}

export function WidgetSkeleton() {
  return (
    <div className={`${styles.skeletonCard} ex-anim-appear`}>
      <Skel w={80} />
      <Skel w={200} />
      <Skel w={170} />
      <Skel w={190} />
    </div>
  );
}

function deadline(daysLeft: number | null): ReactNode {
  if (daysLeft === null || daysLeft < 0) return null;
  return <span className={`${styles.rowDeadline} ${daysLeft <= URGENT_DAYS ? styles.rowDeadlineUrgent : ""}`}>D-{daysLeft}</span>;
}

function JobRows({ rows }: { rows: readonly JobPostingSummary[] }) {
  return (
    <ul className={styles.rows}>
      {rows.map((job) => (
        <li key={job.id}>
          <Link href={`/jobs/${job.id}` as Route} className={styles.row}>
            <CompanyAvatar company={job.company} className={styles.avatar} />
            <span className={styles.rowBody}>
              <span className={styles.rowTitle}>{job.title}</span>
              <span className={styles.rowSub}>{job.company.name}</span>
            </span>
            {deadline(job.daysLeft)}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** 새로 올라온 채용 공고. 목표 직군을 정했으면 그 직군에서 고른다. */
export async function JobsWidget({ accessToken }: { accessToken: string }) {
  const role = roleTab(await careerProfile(accessToken));
  const listing = await jobs.postings(accessToken, { ...(role.family ? { family: role.family } : {}), deadline: "open", sort: "recent", limit: ROWS });
  if (listing.data.length === 0) return null;
  return (
    <Widget icon="briefcase" title={role.family ? `${role.label} 공고` : "채용 공고"} href={role.family ? `/jobs?category=${encodeURIComponent(role.family)}` : "/jobs"}>
      <JobRows rows={listing.data} />
    </Widget>
  );
}

/** 접수 마감이 가까운 공모전. */
export async function ContestsWidget({ accessToken }: { accessToken: string }) {
  const rows = (await activities.list(accessToken, { kind: "contest", limit: ROWS }).catch(() => ({ data: [] }))).data;
  if (rows.length === 0) return null;
  return (
    <Widget icon="trophy" title="공모전" href="/jobs?kind=contest">
      <ul className={styles.rows}>
        {rows.map((contest) => (
          <li key={contest.id}>
            <a href={contest.url} target="_blank" rel="noreferrer" className={styles.row}>
              <span className={styles.rowBody}>
                <span className={styles.rowTitle}>{contest.title}</span>
                <span className={styles.rowSub}>{contest.host}</span>
              </span>
              {deadline(contest.daysLeft)}
            </a>
          </li>
        ))}
      </ul>
    </Widget>
  );
}

/** 진행 중인 인턴 공고. 제목으로 찾는다 — 고용 형태를 정규화하기 전까지의 근사다. */
export async function InternsWidget({ accessToken }: { accessToken: string }) {
  const listing = await jobs.postings(accessToken, { q: "인턴", sort: "deadline", limit: 3 });
  if (listing.data.length === 0) return null;
  return (
    <Widget icon="student" title="인턴" href="/jobs?kind=intern">
      <JobRows rows={listing.data} />
    </Widget>
  );
}
