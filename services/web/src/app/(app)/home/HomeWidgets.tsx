import type { JobPostingSummary } from "@expresso/contracts";
import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { LogoMark } from "@/components/brand/Logo";
import { Skel } from "@/components/shell/Skeleton";
import { CompanyAvatar } from "@/components/ui/CompanyAvatar";
import { Icon } from "@/components/ui/Icon";
import { homeEngagement, watchedJobs } from "@/lib/app-data";
import { career, jobs, portfolios } from "@/lib/api/endpoints";

import { resumeStep } from "../brew/new/resume-step";
import { activities } from "../jobs/explore";
import { ProposalAction } from "./HomeStart";
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
 * 행동 제안. 기록 · 포트폴리오 · 관심 공고를 집계해서 찾은 것만 선다.
 * 공모전처럼 바깥에서 온 소식은 아래의 위젯이 보여 주므로 여기서는 뺀다.
 */
export async function Proposals({ accessToken, recordTotal }: { accessToken: string; recordTotal: number }) {
  const [records, home, list, sites, watched] = await Promise.all([
    career.records(accessToken, { sort: "updated_desc", limit: RECORD_PAGE }),
    homeEngagement(accessToken),
    portfolios.list(accessToken, { limit: PORTFOLIO_PAGE }),
    siteInsights(accessToken),
    watchedJobs(accessToken),
  ]);
  const steps = briefingSteps({
    records: records.data,
    recordTotal,
    brews: home.data.activeBrews,
    portfolios: list.data,
    sites,
    watched: watched.data,
    jobTotal: 0,
    contests: [],
    brewHref: (brew) => `/brew/${brew.id}/${resumeStep(brew.status).segment}`,
  });
  const findings = steps.flatMap((step) => step.findings.map((finding) => ({ ...finding, icon: step.icon })));
  return (
    <section className={styles.proposals}>
      <div className={styles.sectionHead}>
        <LogoMark size={16} />
        <h2 className={styles.sectionTitle}>제안</h2>
        {findings.length > 0 ? <span className={styles.sectionCount}>{findings.length}</span> : null}
        <span className={styles.checked}>
          {findings.length === 0 ? "오늘은 손볼 곳이 없습니다 · " : ""}
          기록 {recordTotal}건 · 포트폴리오 {list.data.length}개 · 관심 공고 {watched.summary.total}건 확인
        </span>
      </div>
      {findings.length > 0 ? (
        <div className={styles.proposalGrid}>
          {findings.map((finding) => (
            <article key={finding.id} className={styles.proposal}>
              <span className={styles.proposalIcon}><Icon name={finding.icon} size={14} /></span>
              <p className={styles.proposalText}>{finding.text}</p>
              {finding.items.length > 0 ? (
                <ul className={styles.proposalItems}>
                  {finding.items.map((item) => (
                    <li key={item.href}>
                      <Link href={item.href as Route} className={styles.proposalItem}>{item.label}</Link>
                    </li>
                  ))}
                </ul>
              ) : null}
              <ProposalAction action={finding.action} />
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function ProposalsSkeleton() {
  return (
    <section className={styles.proposals}>
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
  return (
    <section className={styles.widget}>
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
    <div className={styles.skeletonCard}>
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
export async function ContestsWidget() {
  const rows = (await activities("contest").catch(() => [])).slice(0, ROWS);
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
