import type { JobPostingSummary } from "@expresso/contracts";
import type { Route } from "next";
import Link from "next/link";

import { CompanyAvatar } from "@/components/ui/CompanyAvatar";

import { analyzePostingAction } from "../brew/new/new-brew-actions";
import { deadlineLabel } from "../jobs/JobRows";
import { HomeJobsTabs } from "./HomeJobsTabs";
import { missingRequirements } from "./home-model";
import styles from "./page.module.css";

/**
 * 00 공고 카드 — 첫 탭은 목표 직군의 진행 중 공고, 둘째 탭은 관심 공고.
 *
 * 점수는 내가 분석한 공고에만 선다. 분석하지 않은 공고는 근무지 · 경력을 보여 준다.
 * 두 탭의 행을 모두 여기서 그려 `HomeJobsTabs`에 넘긴다. 홈이 두 목록을 이미 함께
 * 받아 두므로, 탭을 바꿀 때 서버를 다시 부르지 않고 클라이언트에서 보일 쪽만 고른다.
 */
export function HomeJobs({
  role,
  interested,
}: {
  role: { label: string; family: string | null; total: number; rows: JobPostingSummary[] };
  interested: { total: number; rows: JobPostingSummary[] };
}) {
  return (
    <div className={`${styles.card} ${styles.jobsCard}`}>
      <HomeJobsTabs
        role={{ label: role.label, family: role.family, total: role.total, rows: <JobRows jobs={role.rows} /> }}
        interested={{ total: interested.total, rows: interested.total > 0 ? <JobRows jobs={interested.rows} /> : null }}
      />
    </div>
  );
}

function JobRows({ jobs }: { jobs: JobPostingSummary[] }) {
  return jobs.map((job) => <JobRow key={job.id} job={job} />);
}

function JobRow({ job }: { job: JobPostingSummary }) {
  return (
    <div className={styles.jobRow}>
      <CompanyAvatar
        company={{
          name: job.company.name,
          initial: job.company.initial,
          avatarBackground: job.company.avatarBackground,
          avatarColor: job.company.avatarColor,
          logoUrl: job.company.logoUrl,
        }}
        className={styles.jobInitial}
      />
      <Link href={`/jobs/${job.id}` as Route} className={styles.jobBody}>
        <div className={styles.jobHead}>
          <span className={styles.jobName}>{job.title}</span>
          {job.match ? <span className={styles.jobScore}>{job.match.total}</span> : null}
          {/* 마감일을 모르면 아무 말도 하지 않는다 — 06 공고 목록과 같은 규칙이다. */}
          {job.daysLeft !== null ? <span className={styles.jobDeadline}>{deadlineLabel(job)}</span> : null}
        </div>
        <div className={styles.jobLine}>
          <span className={styles.jobCompany}>{job.company.name}</span>
          {job.match ? (
            <>
              <span className={styles.coverage}>
                요건 <b>{job.match.covered}/{job.match.required}</b>
              </span>
              {missingRequirements(job.match).map((item) => (
                <span key={item} className={styles.missingTag}>
                  {item}
                </span>
              ))}
            </>
          ) : (
            <span className={styles.jobFacts}>
              {[job.location, job.experienceLabel].filter(Boolean).join(" · ")}
            </span>
          )}
        </div>
      </Link>
      {/* 행은 공고 상세로, 「만들기」는 그 공고로 바로 분석을 시작한다. 폼을 링크 안에 넣을 수 없어 나란히 둔다. */}
      <form action={analyzePostingAction}>
        <input type="hidden" name="jobPostingId" value={job.id} />
        <button type="submit" className={`${styles.jobCta} ${styles.jobCtaQuiet}`}>
          만들기
        </button>
      </form>
    </div>
  );
}
