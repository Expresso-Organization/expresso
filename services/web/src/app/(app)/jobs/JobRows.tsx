import type { JobPostingSummary } from "@expresso/contracts";
import type { Route } from "next";
import Link from "next/link";

import { Icon } from "@/components/ui/Icon";

import { CompanyAvatar } from "@/components/ui/CompanyAvatar";
import { detailHref } from "./list-query";
import styles from "./page.module.css";

/** 게이지 채움은 점수 구간으로 갈린다 (정의서 00b). */
function fillColor(score: number): string {
  if (score >= 90) return "var(--ex-ink-900)";
  if (score >= 82) return "var(--ex-slate-700)";
  return "var(--ex-border-strong)";
}

/**
 * "D-9" · "마감". 마감일을 모르면 **아무 말도 하지 않는다.**
 *
 * 예전에는 "상시"라고 적었다. 그건 우리가 모른다는 뜻이지 상시 채용이라는
 * 뜻이 아니다 — 모아 온 공고는 마감이 거의 비어 있어 전부 "상시"가 됐고,
 * 그 말을 믿고 미룬 사람은 우리 때문에 놓친다.
 */
export function deadlineLabel(job: JobPostingSummary): string {
  if (job.daysLeft === null) return "";
  if (job.daysLeft < 0) return "마감";
  return `D-${job.daysLeft}`;
}

/** 마감 임박은 목록 API의 `deadline=urgent`와 같은 기준(7일)으로 본다. */
function isUrgent(job: JobPostingSummary): boolean {
  return job.daysLeft !== null && job.daysLeft >= 0 && job.daysLeft <= 7;
}

function deadlineClass(job: JobPostingSummary): string {
  if (isUrgent(job)) return `${styles.rowDeadline} ${styles.rowDeadlineUrgent}`;
  if (job.daysLeft === null) return `${styles.rowDeadline} ${styles.rowDeadlineAlways}`;
  return styles.rowDeadline ?? "";
}

const NEW_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

function isNew(job: JobPostingSummary, now: number): boolean {
  return now - new Date(job.createdAt).getTime() < NEW_WINDOW_MS;
}

/**
 * 회사 줄. 00b는 근무 형태를, 06은 연차를 뒤에 붙인다 — 정의서가 화면마다
 * 다르게 읽히도록 적어 둔 그대로다.
 */
function companyLine(job: JobPostingSummary, tail: "workType" | "experience"): string {
  const last = tail === "workType" ? job.workType : job.experienceLabel;
  return [job.company.name, job.location ?? job.workType, last]
    .filter((part, index, parts) => part && parts.indexOf(part) === index)
    .join(" · ");
}

export function JobRowList({
  jobs,
  highlightFirst = false,
  tail = "workType",
  now,
  listQuery = "",
}: {
  jobs: readonly JobPostingSummary[];
  /** 00b는 가장 잘 맞는 첫 행에 시그니처 지면을 깐다. */
  highlightFirst?: boolean;
  tail?: "workType" | "experience";
  /** NEW 배지 기준 시각. 서버에서 한 번 정해 넘긴다. */
  now: number;
  /**
   * 지금 목록이 걸고 있는 조건. 상세로 실어 보내 **돌아올 때 그대로 되살린다.**
   * 비어 있으면 안 싣는다 — 조건 없는 목록에서 `?from=`은 짐일 뿐이다.
   */
  listQuery?: string;
}) {
  return (
    <div className={styles.rows}>
      {jobs.map((job, index) => (
        <Link
          key={job.id}
          href={detailHref(job.id, listQuery)}
          className={`${styles.row} ${
            highlightFirst && index === 0 ? styles.rowTop : ""
          }`}
        >
          <CompanyAvatar company={job.company} className={styles.avatar} />
          <span className={styles.rowTitle}>
            <span className={styles.rowRole} style={{ display: "block" }}>
              {job.title}
              {isNew(job, now) ? <span className={styles.rowNew}>NEW</span> : null}
            </span>
            <span className={styles.rowCompany} style={{ display: "block" }}>
              {companyLine(job, tail)}
            </span>
          </span>
          <span className={styles.rowStack}>
            {job.technologies.map((tool) => (
              <span
                key={tool.name}
                className={`${styles.stackChip} ${
                  tool.matched === false ? styles.stackChipMissing : ""
                }`}
              >
                {tool.name}
              </span>
            ))}
          </span>
          <span className={styles.rowReason}>{job.match?.reason ?? ""}</span>
          <span className={styles.rowScore}>
            {job.match ? (
              <>
                <span className={styles.scoreTrack}>
                  <span
                    className={styles.scoreFill}
                    style={{
                      width: `${job.match.total}%`,
                      background: fillColor(job.match.total),
                    }}
                  />
                </span>
                <span className={styles.scoreValue}>{job.match.total}</span>
              </>
            ) : (
              // 점수를 아직 내지 않았다. 0으로 그리면 "안 맞는다"는 거짓말이 된다.
              <span className={styles.scoreValue}>—</span>
            )}
          </span>
          <span className={deadlineClass(job)}>{deadlineLabel(job)}</span>
          <Icon
            name="bookmark-simple"
            weight={job.interest ? "fill" : "regular"}
            size={15}
            color={job.interest ? "var(--ex-espresso)" : "var(--ex-border-strong)"}
            style={{ flexShrink: 0 }}
          />
        </Link>
      ))}
    </div>
  );
}
