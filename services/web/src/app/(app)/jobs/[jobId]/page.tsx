import type { JobPostingDetail, JobRequirement } from "@expresso/contracts";
import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppShell, DocumentHeader } from "@/components/shell/AppShell";
import { Sidebar } from "@/components/shell/Sidebar";
import { Icon } from "@/components/ui/Icon";
import { ApiError } from "@/lib/api/client";
import { jobs as jobsApi } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

import { backToListHref } from "../list-query";
import { analyzePostingAction } from "../../brew/new/new-brew-actions";
import { CompanyAvatar } from "@/components/ui/CompanyAvatar";
import { mendEmphasis } from "@/components/ui/mend-emphasis";
import { StackChip, StackMarkdown } from "@/components/ui/StackMarkdown";
import { findStacks, resolveStack } from "@/components/ui/stacks";
import styles from "./page.module.css";

/** §3.5 요건 충족 / 약함 / 없음은 아이콘이 고정 매핑이다. */
const COVERAGE = {
  covered: {
    icon: "check-circle",
    weight: "fill" as const,
    color: "var(--ex-success-text)",
    label: "있음",
    row: "",
    note: "",
  },
  partial: {
    icon: "warning-circle",
    weight: "fill" as const,
    color: "var(--ex-warning-text)",
    label: "약함",
    row: styles.requirementPartial ?? "",
    note: styles.requirementNotePartial ?? "",
  },
  missing: {
    icon: "circle-dashed",
    weight: "regular" as const,
    color: "var(--ex-danger-text)",
    label: "없음",
    row: styles.requirementMissing ?? "",
    note: styles.requirementNoteMissing ?? "",
  },
} as const;

export default async function JobDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ jobId: string }>;
  /** 목록이 실어 보낸 조건. 돌아갈 때 그대로 되살린다. */
  searchParams: Promise<{ from?: string }>;
}) {
  const { jobId } = await params;
  const { from } = await searchParams;
  // 주소창에 노출되는 값이라 믿지 않는다 — 아는 조건만 골라 다시 조립한다.
  const backHref = backToListHref(from);
  const session = await requireSession();

  let job: JobPostingDetail;
  try {
    job = (await jobsApi.posting(session.accessToken, jobId)).data;
  } catch (error) {
    // 없는 id도, UUID가 아닌 id(400)도 화면에서는 똑같이 없는 페이지다.
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) {
      notFound();
    }
    throw error;
  }

  // 요건은 공고에 붙는다 — 내가 해석한 적이 없어도 보인다. 커버리지만
  // 사람마다 다르고, 대조 전이면 null이다.
  const musts = job.criteria.filter((item) => item.kind === "must");
  const coveredCount = musts.filter((item) => item.coverage === "covered").length;
  const comparedCount = musts.filter((item) => item.coverage !== null).length;
  const haveStack = job.technologies.filter((tool) => tool.matched === true).length;
  const firstMissing = musts.find((item) => item.coverage === "missing");
  const rows = facts(job);
  // 뽑아 놓은 것이 하나라도 있나. 없으면 원문을 펴서 보여준다.
  const hasStructure = job.duties.length > 0
    || job.preferred.length > 0
    || job.hiringProcess.length > 0
    || musts.length > 0
    || job.technologies.length > 0;

  return (
    <AppShell
      sidebar={
        <Sidebar
          active="jobs"
          categories={session.categories}
          displayName={session.user.displayName}
          quotaUsed={session.quota.used}
          quotaLimit={session.quota.limit}
        />
      }
      header={
        <DocumentHeader
          crumbs={[
            { label: "공고 탐색", href: backHref },
            `${job.company.name} · ${job.title}`,
          ]}
          actions={
            <>
              <button type="button" className={styles.headAction}>
                <Icon
                  name="bookmark-simple"
                  weight={job.interest ? "fill" : "regular"}
                  size={14}
                  color={job.interest ? "var(--ex-espresso)" : "var(--ex-slate-500)"}
                />
                {job.interest ? "관심 공고" : "관심 공고에 담기"}
              </button>
              <Icon name="arrow-square-out" size={16} color="var(--ex-slate-500)" />
            </>
          }
        />
      }
    >
      <div className={styles.body}>
        <div className={styles.left}>
          {/*
            * 목록으로 돌아가는 길을 지면 안에도 둔다.
            *
            * 빵부스러기는 46px 헤더 왼쪽 끝에 12.5px로 서 있어서, 본문을 읽던
            * 눈이 거기까지 올라가지 않는다. 제목 바로 위가 다 읽고 나서 손이
            * 가는 자리다.
            *
            * 브라우저 뒤로가기가 아니라 **목록 주소**로 간다 — 주소를 직접
            * 열었거나 알림에서 들어온 사람에게도 같은 자리로 데려다준다.
            */}
          <Link href={backHref} className={styles.backToList}>
            <Icon name="arrow-left" size={13} />
            목록으로 돌아가기
          </Link>
          <h1 className={styles.role}>{job.title}</h1>
          <div className={styles.team}>
            <CompanyAvatar company={job.company} className={styles.companyMark} fit="line" />
            {[job.company.name, job.team].filter(Boolean).join(" · ")}
            {deadlineText(job) ? (
              <span className={styles.deadline}>{deadlineText(job)}</span>
            ) : null}
          </div>

          {/*
            * 노션의 페이지 속성처럼 한 줄에 하나씩 세운다.
            *
            * 칸을 나눈 표는 **비어 있는 칸이 그대로 구멍으로 보인다** — 다섯
            * 칸에 셋만 차면 남은 둘이 빈 상자로 남았다. 줄로 세우면 값이 있는
            * 것만 세우고 나머지는 없던 줄로 둘 수 있다.
            */}
          {rows.length > 0 ? (
            <dl className={styles.facts}>
              {rows.map((fact) => (
                <div key={fact.label} className={styles.fact}>
                  <dt className={styles.factLabel}>
                    <Icon name={fact.icon} size={14} color="var(--ex-slate-400)" />
                    {fact.label}
                  </dt>
                  <dd className={styles.factValue}>{fact.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          {job.duties.length > 0 ? (
            <div className={styles.section}>
              <div className={styles.blockTitle}>주요 업무</div>
              {job.duties.map((duty) => (
                <div key={duty.group} className={styles.dutyGroup}>
                  <div className={styles.dutyGroupTitle}>{duty.group}</div>
                  {duty.items.map((item) => (
                    <div key={item} className={styles.dutyItem}>
                      <span className={styles.dutyBullet}>–</span>
                      <span className={styles.dutyText}>{item}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : null}

          {job.technologies.length > 0 ? (
            <div className={styles.section}>
              <div className={styles.blockTitle}>기술 스택</div>
              <div className={styles.stackRow}>
                {job.technologies.map((tool) =>
                  tool.matched === true ? (
                    <span key={tool.name} className={styles.stackHave}>
                      <Icon name="check" size={11} color="var(--ex-success-text)" />
                      {tool.name}
                    </span>
                  ) : (
                    <span key={tool.name} className={styles.stackMissing}>
                      {tool.name}
                    </span>
                  ),
                )}
              </div>
              <div className={styles.stackNote}>
                {job.match
                  ? `표시된 ${haveStack}개는 내 기록에 이미 있는 것입니다`
                  : "아직 내 기록과 대조하지 않았습니다"}
              </div>
            </div>
          ) : null}

          {musts.length > 0 ? (
            <div className={styles.section}>
              <div className={styles.blockTitleRow}>
                <span className={styles.blockTitle} style={{ marginBottom: 0 }}>
                  자격 요건
                </span>
                <span className={styles.blockTitleNote}>
                  {comparedCount === 0
                    ? `${musts.length}개 · 아직 대조하지 않았습니다`
                    : `${musts.length}개 중 ${coveredCount}개 충족`}
                </span>
              </div>
              {musts.map((requirement) => (
                <RequirementRow key={requirement.id} requirement={requirement} />
              ))}
            </div>
          ) : null}

          {job.preferred.length > 0 ? (
            <div className={styles.section}>
              <div className={styles.blockTitle}>우대 사항</div>
              <div className={styles.preferredList}>
                {job.preferred.map((item) => {
                  const state = item.coverage ? COVERAGE[item.coverage] : null;
                  return (
                    <div key={item.label} className={styles.preferredItem}>
                      {state ? (
                        <Icon
                          name={state.icon}
                          weight={state.weight}
                          size={13}
                          color={state.color}
                          style={{ flexShrink: 0 }}
                        />
                      ) : null}
                      <span className={styles.preferredLabel}>{item.label}</span>
                      {state ? (
                        <span
                          className={styles.preferredState}
                          style={{ color: state.color }}
                        >
                          {state.label}
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {job.hiringProcess.length > 0 ? (
            <div className={styles.section}>
              <div className={styles.blockTitle}>
                전형 절차{job.processNote ? ` · ${job.processNote}` : ""}
              </div>
              <div className={styles.processRow}>
                {job.hiringProcess.map((step, index) => (
                  <span key={step.label} className={styles.processStep}>
                    <span className={styles.processNo}>
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    {step.label}
                    {index < job.hiringProcess.length - 1 ? (
                      <Icon name="caret-right" size={10} color="var(--ex-border-strong)" />
                    ) : null}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {/*
            * 공고 원문.
            *
            * 위의 절들은 **뽑아 놓은 것**을 그린다 — 주요 업무 · 우대 사항 ·
            * 전형 절차는 사람이 심었거나 분석이 채운 칸이다. 모아 온 공고는
            * 아직 그 칸이 비어 있어서, 이게 없으면 3,883자짜리 공고를 열고도
            * **빈 화면**을 본다.
            *
            * 뽑아 놓은 것이 있으면 접어 두고, 없으면 펴 둔다. 여기 온 사람이
            * 하려던 일은 공고를 읽는 것이다.
            */}
          {job.descriptionRaw ? (
            <details className={styles.rawSection} open={!hasStructure}>
              <summary className={styles.rawSummary}>
                공고 원문
                <span className={styles.rawNote}>
                  {hasStructure
                    ? `${job.descriptionRaw.length.toLocaleString("ko-KR")}자`
                    : "아직 요건을 뽑지 않아 원문 그대로 보여드립니다"}
                </span>
              </summary>
              {/* 글자 수는 원문의 것을 세고, 그리는 것만 편다 — 위의 `1,234자`가
                  우리가 손댄 길이를 말하면 안 된다. */}
              <StackMarkdown className={styles.rawBody}>
                {mendEmphasis(job.descriptionRaw)}
              </StackMarkdown>
            </details>
          ) : null}

          {job.notice ? <p className={styles.notice}>{job.notice}</p> : null}
        </div>

        <aside className={styles.rail}>
          {job.match ? (
            <div className={styles.matchCard}>
              {/*
                큰 숫자는 요건 충족률이고, 오른쪽 내역이 그 분자·분모다.
                요건 원문의 충족 · 약함 · 없음 3단 판정은 아래 "자격 요건"
                절이 따로 보여준다 — 정밀도가 다른 별개의 읽기다.
              */}
              <div className={styles.matchHead}>
                <div>
                  <div className={styles.matchLabel}>내 기록과의 일치</div>
                  <div className={styles.matchScoreRow}>
                    <span className={styles.matchScore}>{job.match.total}</span>
                    <span className={styles.matchUnit}>%</span>
                  </div>
                </div>
                <div className={styles.matchTally}>
                  <div className={`${styles.legendItem} ${styles.legendCovered}`}>
                    충족 {job.match.covered}
                  </div>
                  <div className={styles.legendItem}>
                    미충족 {job.match.required - job.match.covered}
                  </div>
                  <div className={styles.legendItem}>요건 {job.match.required}개</div>
                </div>
              </div>
              <div className={styles.matchBar}>
                <span
                  className={styles.matchSlot}
                  style={{ flex: job.match.covered, background: "var(--ex-success)" }}
                />
                <span
                  className={styles.matchSlot}
                  style={{
                    flex: job.match.required - job.match.covered,
                    background: "var(--ex-line-200)",
                  }}
                />
              </div>
              {job.rank ? (
                <div className={styles.matchRank}>
                  비슷한 공고 {job.rank.total}건 중 <b>{job.rank.position}번째로 가까운</b>{" "}
                  공고입니다.
                </div>
              ) : null}
            </div>
          ) : null}

          {firstMissing ? (
            <div className={styles.railCardBrew}>
              <div className={styles.railTitle}>빠진 재료 하나</div>
              <p className={`${styles.railBody} ${styles.railBodyBrew}`}>
                {firstMissing.label}만 기록이 없습니다. {job.match?.nextAction}
              </p>
              <form action={analyzePostingAction}>
                <input type="hidden" name="jobPostingId" value={job.id} />
                <button type="submit" className={styles.railCta}>
                  질문 3개로 채우기
                </button>
              </form>
            </div>
          ) : null}

          {job.company.brandColors.length > 0 || job.company.toneSummary ? (
            <div className={styles.railCard}>
              <div className={styles.railTitle}>이 회사의 톤</div>
              {job.company.brandColors.length > 0 ? (
                <div className={styles.palette}>
                  {job.company.brandColors.map((color) => (
                    <span key={color} className={styles.swatch}>
                      <span className={styles.swatchChip} style={{ background: color }} />
                      <span className={styles.swatchHex}>{color}</span>
                    </span>
                  ))}
                </div>
              ) : null}
              {job.company.toneSummary ? (
                <div className={styles.toneRow}>
                  <span className={styles.toneKey}>공고 말투</span>
                  <span>{job.company.toneSummary}</span>
                </div>
              ) : null}
              {job.company.toneImpression ? (
                <div className={styles.toneRow} style={{ marginTop: "6px" }}>
                  <span className={styles.toneKey}>인상</span>
                  <span>{job.company.toneImpression}</span>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className={styles.railCard}>
            <div className={styles.railTitle}>
              이 공고로 만들면 이 기록들이 먼저 올라갑니다
            </div>
            {job.topRecords.length > 0 ? (
              job.topRecords.map((record, index) => (
                <div key={record.id} className={styles.topRecord}>
                  <span className={styles.topRecordNo}>
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className={styles.topRecordTitle}>{record.title}</span>
                </div>
              ))
            ) : (
              <div className={styles.topRecord}>
                <span className={styles.topRecordTitle}>
                  아직 이 공고를 해석하지 않았습니다
                </span>
              </div>
            )}
            {/* 공고는 이미 있다. 새로 생기는 것은 내 분석과 제작뿐이다. */}
            <form action={analyzePostingAction}>
              <input type="hidden" name="jobPostingId" value={job.id} />
              <button type="submit" className={styles.brew}>
                이 공고로 포트폴리오 만들기
              </button>
            </form>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}

function RequirementRow({ requirement }: { requirement: JobRequirement }) {
  // 대조한 적이 없으면 판정 색도 근거 줄도 붙이지 않는다.
  const state = requirement.coverage ? COVERAGE[requirement.coverage] : null;
  return (
    <div className={`${styles.requirement} ${state?.row ?? ""}`}>
      <Icon
        name={state?.icon ?? "circle"}
        weight={state?.weight ?? "regular"}
        size={15}
        color={state?.color ?? "var(--ex-slate-300)"}
        style={{ flexShrink: 0, marginTop: "1px" }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className={styles.requirementLabel}>{requirement.label}</div>
        <div className={`${styles.requirementNote} ${state?.note ?? ""}`}>
          {state === null
            ? "아직 내 기록과 대조하지 않았습니다"
            : requirement.coveredBy.length > 0
              ? requirement.coveredBy.map((record) => record.title).join(" · ")
              : "기록에 없습니다 · 질문 3개로 채울 수 있습니다"}
        </div>
      </div>
    </div>
  );
}

/** "8월 12일 마감 · D-9" · "채용 시 마감". 마감일이 없으면 공고의 문구를 쓴다. */
/**
 * 마감. **모르면 null이다.**
 *
 * 예전에는 마감 시각이 없으면 "상시"라고 했다. 그건 우리가 모른다는 뜻이지
 * 공고가 상시 채용이라는 뜻이 아니다 — 모아 온 공고는 Greenhouse가 마감을 거의
 * 주지 않아 전부 "상시"가 됐다. 지원자가 그 말을 믿고 미루면 우리 잘못이다.
 */
function deadlineText(job: JobPostingDetail): string | null {
  if (job.expiresAt === null) return job.deadlineNote;
  const date = new Date(job.expiresAt);
  const label = `${date.getMonth() + 1}월 ${date.getDate()}일 마감`;
  return job.daysLeft !== null && job.daysLeft >= 0 ? `${label} · D-${job.daysLeft}` : label;
}

/**
 * 공고의 속성.
 *
 * **값이 있는 것만 선다.** 빈 줄은 아예 만들지 않는다.
 *
 * 전에는 빈 줄마다 왜 비었는지를 적었다 — "아직 뽑지 않았습니다" · "본문에서
 * 찾지 못했습니다" · "출처가 알려 주지 않았습니다". 그 말들이 정확하기는 했지만,
 * 여기 온 사람이 알고 싶은 것은 이 공고가 무엇을 말하는가지 우리 수집 상태가
 * 어디까지 왔는가가 아니다. 일곱 줄 중 넷이 우리 사정을 설명하고 있으면
 * 나머지 셋이 안 보인다.
 *
 * 우리가 어디까지 읽었는지는 `docs/API_GAPS.md`와 `facts_read_at`이 말한다.
 * 화면이 할 일이 아니다.
 */
function facts(job: JobPostingDetail): {
  label: string;
  value: React.ReactNode;
  icon: string;
}[] {
  const place = [job.location, job.workType].filter(Boolean).join(" · ");
  const stacks = mentionedStacks(job);
  const rows = [
    {
      label: "기술 스택",
      icon: "code",
      value:
        stacks.length > 0 ? (
          <span className={styles.factStacks}>
            {stacks.map((stack) => (
              <StackChip key={stack.key} slug={stack.slug}>
                {stack.label}
              </StackChip>
            ))}
          </span>
        ) : null,
    },
    { label: "경력", value: job.experienceLabel, icon: "user-focus" },
    { label: "고용 형태", value: job.employmentType, icon: "identification-badge" },
    { label: "근무지", value: place || null, icon: "map-pin" },
    { label: "연봉", value: job.salaryNote, icon: "coins" },
    { label: "마감", value: deadlineText(job), icon: "calendar-blank" },
    { label: "출처", value: job.sourceBoard, icon: "link-simple" },
  ];
  return rows.filter((row) => row.value !== null && row.value !== "");
}

/**
 * 이 공고가 말하는 스택.
 *
 * 두 군데서 온다. **본문에서 읽은 것**이 먼저다 — 모아 온 공고는 아직 요건을
 * 뽑지 않아서 이것뿐이고, 나온 차례가 곧 공고가 중요하게 여긴 차례다. 그 뒤에
 * **분석이 뽑아 둔 것** 중 본문에서 못 만난 이름을 덧붙인다.
 */
function mentionedStacks(
  job: JobPostingDetail,
): { key: string; slug: string | null; label: string }[] {
  const rows = new Map<string, { key: string; slug: string | null; label: string }>();
  // 본문과 같은 글자를 읽어야 한다. 프론트매터가 원문을, 본문이 편 것을 읽으면
  // 같은 화면의 칩 두 줄이 서로 다른 글을 보고 있는 셈이 된다.
  for (const found of findStacks(mendEmphasis(job.descriptionRaw ?? ""))) {
    rows.set(found.slug, { key: found.slug, slug: found.slug, label: found.text });
  }
  for (const tool of job.technologies) {
    const slug = resolveStack(tool.name);
    const key = slug ?? tool.name.toLowerCase();
    if (rows.has(key)) continue;
    rows.set(key, { key, slug, label: tool.name });
  }
  return [...rows.values()];
}
