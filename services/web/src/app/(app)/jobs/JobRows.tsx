import type { JobPostingSummary } from "@expresso/contracts";
import type { Route } from "next";
import Link from "next/link";

import { Icon } from "@/components/ui/Icon";

import { CompanyAvatar } from "@/components/ui/CompanyAvatar";
import { detailHref } from "./list-query";
import styles from "./page.module.css";

/** 게이지 채움은 점수 구간으로 갈린다 (정의서 00b). */
function fillColor(score: number): string {
  if (score >= 90) return "var(--ex-fg)";
  if (score >= 82) return "var(--ex-fg-body)";
  return "var(--ex-border-firm)";
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

/** 행에 그리는 기술 칩 수의 상한. 정의서 00b의 공고 행은 모두 칩 3개다. */
const STACK_LIMIT = 3;

/**
 * 칩 이름에 쓸 수 있는 글자 폭. 영문 한 글자를 1, 한글처럼 넓은 글자를 2로 센다.
 *
 * 1440px 화면에서 목록은 804px이고, 제목 · 점수 · 마감 · 북마크 · 여백을 빼면
 * 칩 열에 약 250px이 남는다. 「+N」 칩(약 36px)과 칩 사이 간격, 칩 안쪽 여백(칩마다
 * 16px)을 빼면 이름 글자에 약 160px이다. 12px(`--ex-text-2xs`) 영문은 한 글자에
 * 약 6.3px("Hugging Face" 12자가 74px)이므로 25자다.
 */
const STACK_TEXT_BUDGET = 25;

function textUnits(name: string): number {
  let units = 0;
  for (const char of name) units += char.charCodeAt(0) > 0x7f ? 2 : 1;
  return units;
}

/**
 * 앞에서부터 칩으로 그릴 기술과 「+N」으로 접을 기술. 순서는 공고 원문 그대로다.
 *
 * 개수 제한이 없으면 기술을 20개 넘게 적은 공고 한 행이 목록보다 넓어져
 * 목록 전체에 가로 스크롤이 생긴다. 개수만 막으면 이름이 긴 칩 세 개가 칩 열을
 * 넘쳐 이름이 잘리므로, 글자 폭이 예산을 넘는 칩부터는 통째로 접는다.
 * 첫 칩은 길어도 그린다 — 칩 열보다 넓으면 CSS가 말줄임표로 줄인다.
 */
export function splitStack<T extends { name: string }>(
  technologies: readonly T[],
): { shown: T[]; hidden: T[] } {
  let used = 0;
  let count = 0;
  for (const tool of technologies.slice(0, STACK_LIMIT)) {
    used += textUnits(tool.name);
    if (count > 0 && used > STACK_TEXT_BUDGET) break;
    count += 1;
  }
  return { shown: technologies.slice(0, count), hidden: technologies.slice(count) };
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
  return [job.company.name, job.location ?? job.workType, nearbyLabel(job), last]
    .filter((part, index, parts) => part && parts.indexOf(part) === index)
    .join(" · ");
}

/**
 * 장소로 찾았을 때 그 장소가 아닌 공고에 붙는 거리. 그 장소의 공고(0km)는
 * 원문이 이미 장소를 말하므로 붙이지 않는다.
 */
function nearbyLabel(job: JobPostingSummary): string | null {
  if (!job.nearby || job.nearby.distanceKm === 0) return null;
  return `근처 약 ${Math.max(1, Math.round(job.nearby.distanceKm))}km`;
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
          <StackChips technologies={job.technologies} />
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
            color={job.interest ? "var(--ex-accent-text)" : "var(--ex-border-firm)"}
            className={styles.rowMark}
          />
        </Link>
      ))}
    </div>
  );
}

/** 행의 기술 칩. 앞의 몇 개만 그리고 나머지는 「+N」 칩 하나로 접는다. */
function StackChips({ technologies }: { technologies: JobPostingSummary["technologies"] }) {
  const { shown, hidden } = splitStack(technologies);
  const hiddenNames = hidden.map((tool) => tool.name).join(" · ");
  return (
    <span className={styles.rowStack}>
      {shown.map((tool) => (
        <span
          key={tool.name}
          className={`${styles.stackChip} ${
            tool.matched === false ? styles.stackChipMissing : ""
          }`}
        >
          {tool.name}
        </span>
      ))}
      {hidden.length > 0 ? (
        <span
          className={`${styles.stackChip} ${styles.stackChipMore}`}
          title={hiddenNames}
        >
          +{hidden.length}
        </span>
      ) : null}
    </span>
  );
}
