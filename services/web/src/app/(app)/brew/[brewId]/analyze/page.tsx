import type { RequirementCoverage } from "@expresso/contracts";
import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Icon } from "@/components/ui/Icon";
import { ApiError } from "@/lib/api/client";
import { brews, jobAnalyses } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

import { BrewFrame } from "../BrewFrame";
import { Reanalyze } from "./Reanalyze";
import styles from "./page.module.css";

/**
 * 01 공고 분석.
 *
 * 요건도 근거 문장도 §8.3 공고 분석 계약이 낸 것이다. 화면이 하는 일은 그것을
 * 내 기록과 나란히 놓는 것뿐이다 — **덮는 것과 비어 있는 것**을 가르면 다음
 * 대화에서 무엇을 물어야 하는지가 정해진다.
 */

const COVERAGE_LABEL = {
  covered: "기록 있음",
  partial: "보강 필요",
  missing: "기록 없음",
} as const;

const COVERAGE_CLASS = {
  covered: styles.coverageHave,
  partial: styles.coverageWeak,
  missing: styles.coverageNone,
} as const;

const KIND_LABEL = { must: "필수", nice: "우대", tone: "톤" } as const;

const AXIS_LABEL = {
  technology: "기술",
  impact: "성과",
  role: "역할",
  conditions: "조건",
} as const;

const STAGE_LABEL = {
  queued: "차례를 기다리는 중",
  extracting: "요건을 뽑는 중",
  validating: "원문과 맞춰 보는 중",
  covering: "내 기록과 대조하는 중",
  done: "분석 끝",
  failed: "분석 실패",
} as const;

/** 무엇을 걸었고 무엇이 비었나. 세어서 문장으로 만든다 — 지어내지 않는다. */
function summarize(requirements: RequirementCoverage[]): string {
  if (requirements.length === 0) return "아직 뽑아낸 요건이 없습니다.";
  const kinds = ["must", "nice", "tone"] as const;
  const kindPart = kinds
    .map((kind) => ({ kind, count: requirements.filter((one) => one.kind === kind).length }))
    .filter(({ count }) => count > 0)
    .map(({ kind, count }) => `${KIND_LABEL[kind]} ${count}`)
    .join(" · ");
  const axes = (Object.keys(AXIS_LABEL) as (keyof typeof AXIS_LABEL)[])
    .map((axis) => ({ axis, count: requirements.filter((one) => one.axis === axis).length }))
    .filter(({ count }) => count > 0)
    .map(({ axis, count }) => `${AXIS_LABEL[axis]} ${count}`)
    .join(" · ");
  const covered = requirements.filter((one) => one.coverage === "covered").length;
  const open = requirements.length - covered;

  return `${kindPart} 요건을 걸었습니다${axes ? ` — ${axes}` : ""}. `
    + `내 기록이 ${covered}개를 덮고, ${open}개가 아직 비어 있습니다.`;
}

export default async function AnalyzePage({
  params,
}: {
  params: Promise<{ brewId: string }>;
}) {
  const { brewId } = await params;
  const session = await requireSession();

  let brew;
  try {
    brew = (await brews.get(session.accessToken, brewId)).data;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) notFound();
    throw error;
  }
  const { data } = await jobAnalyses.get(session.accessToken, brew.jobAnalysisId);
  const { analysis, requirements } = data;

  const open = requirements.filter((one) => one.coverage !== "covered");
  /**
   * 요건을 글머리표로 나열한 공고는 요건 문장이 곧 원문이라 인용이 라벨과 같다.
   * 같은 말을 두 번 보여주지 않는다 — 인용은 **더 말해 주는 것이 있을 때만** 낸다.
   */
  const quoted = requirements.filter((one) => one.sourceSpan.quote.trim() !== one.label.trim());

  return (
    <BrewFrame brewId={brewId} step="analyze" situation="예상 3분">
      <div className={styles.body}>
        <div className={styles.left}>
          <div className={styles.head}>
            <span className={styles.headTitle}>어디에 지원하나요</span>
          </div>

          <div className={styles.sourceCard}>
            <Icon name="file-text" size={15} color="var(--ex-slate-500)" />
            <span className={styles.sourceTitle}>{brew.posting?.title ?? "공고 없이 시작한 제작"}</span>
            <span className={styles.sourceMeta}>
              {brew.posting?.companyName ?? "목표 없음"}
              {analysis.resultVersion > 0 ? ` · 분석 v${analysis.resultVersion}` : ""}
              {analysis.status === "done" ? "" : ` · ${STAGE_LABEL[analysis.stage]}`}
            </span>
            <Reanalyze
              brewId={brewId}
              jobAnalysisId={brew.jobAnalysisId}
              disabled={analysis.status !== "done"}
            />
          </div>

          {analysis.failure ? (
            <p className={styles.failure}>
              분석이 실패했습니다({analysis.failure.code}).
              {analysis.failure.retryable ? " 다시 분석을 눌러 주세요." : " 공고 원문을 다시 확인해 주세요."}
            </p>
          ) : null}

          <div className={styles.block}>
            <div className={styles.blockHead}>
              <span className={styles.blockTitle}>이 공고가 건 조건</span>
              <span className={styles.aiTag}>AI 분석</span>
            </div>
            <p className={styles.summary}>{summarize(requirements)}</p>
          </div>

          <div style={{ flexShrink: 0 }}>
            <div className={styles.requirementsHead}>
              <span className={styles.blockTitle}>요구 역량과 내 기록</span>
              <span className={styles.requirementsNote}>
                {requirements.length}개 중 {requirements.length - open.length}개는 이미 쓸 수 있습니다
              </span>
            </div>
            {requirements.map((requirement, index) => (
              <div key={requirement.requirementId} className={styles.requirement}>
                <span className={styles.requirementNo}>
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className={styles.requirementBody}>
                  <div className={styles.requirementHead}>
                    <span className={styles.requirementLabel}>{requirement.label}</span>
                    <span className={styles.requirementMentions}>
                      {KIND_LABEL[requirement.kind]}
                      {requirement.axis ? ` · ${AXIS_LABEL[requirement.axis]}` : ""}
                    </span>
                    <span className={`${styles.coverage} ${COVERAGE_CLASS[requirement.coverage]}`}>
                      {COVERAGE_LABEL[requirement.coverage]}
                    </span>
                  </div>
                  {requirement.sourceSpan.quote.trim() === requirement.label.trim() ? null : (
                    <div className={styles.requirementQuote}>
                      {requirement.sourceSpan.quote}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {requirements.length === 0 ? (
              <p className={styles.summary}>
                아직 요건이 없습니다. {STAGE_LABEL[analysis.stage]}입니다.
              </p>
            ) : null}
          </div>

          <div className={styles.readBar}>
            <Icon name="books" size={16} color="var(--ex-slate-400)" />
            <span className={styles.readBarText}>
              요건은 모두 공고 원문에서 그대로 잘라 왔습니다 — 원문에 없는 인용은 버립니다
              {analysis.analyzedAt
                ? ` · ${analysis.analyzedAt.slice(0, 10).replaceAll("-", ".")} 분석`
                : ""}
            </span>
          </div>
        </div>

        <div className={styles.right}>
          <div className={styles.rightHead}>
            <span className={styles.rightTitle}>공고에서 읽은 문장</span>
            <span className={styles.rightCount}>{quoted.length}</span>
          </div>
          <div className={styles.rightNote}>표시된 부분이 위 분석의 근거입니다</div>

          <div style={{ flexShrink: 0 }}>
            {quoted.map((requirement) => (
              <p key={requirement.requirementId} className={styles.quote}>
                {requirement.sourceSpan.quote}
              </p>
            ))}
            {quoted.length === 0 && requirements.length > 0 ? (
              <p className={styles.rightNote}>
                이 공고는 요건을 문장 그대로 나열했습니다 — 왼쪽 목록이 곧 원문입니다.
              </p>
            ) : null}
          </div>

          {open.length > 0 ? (
            <div className={styles.preview}>
              <Icon
                name="chat-teardrop-dots"
                size={19}
                color="var(--ex-espresso)"
                style={{ flexShrink: 0, marginTop: "1px" }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className={styles.previewTitle}>
                  비어 있는 {open.length}가지는 대화에서 채웁니다
                </div>
                <div className={styles.previewBody}>
                  {open.map(({ label }) => label).join(" · ")} — 다음 대화의 질문이 여기에
                  배정됩니다.
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className={styles.footer}>
        <Icon name="target" size={17} color="var(--ex-espresso)" />
        <span className={styles.footerText}>
          이 분석 결과로 {brew.materials.total}건 중{" "}
          <b style={{ color: "var(--ex-ink-900)" }}>{brew.materials.selected}건</b>을
          골라두었습니다
        </span>
        <div className={styles.footerActions}>
          <Link href={`/brew/${brewId}/materials` as Route} className={styles.brew}>
            담을 기록 고르기
          </Link>
        </div>
      </div>
    </BrewFrame>
  );
}
