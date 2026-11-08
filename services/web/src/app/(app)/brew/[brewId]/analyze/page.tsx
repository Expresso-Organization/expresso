import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ApiError } from "@/lib/api/client";
import { brews, jobAnalyses } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

import { BrewFrame } from "../BrewFrame";
import { brewTitle } from "../brew-title";
import { CoverageMap } from "./CoverageMap";
import { Reanalyze } from "./Reanalyze";
import styles from "./page.module.css";

/**
 * 01 공고 분석.
 *
 * 요건도 근거 문장도 §8.3 공고 분석 계약이 낸 것이다. 화면이 하는 일은 그것을 내 기록과
 * 나란히 놓는 것뿐이다. 무엇이 덮이고 비었는지는 막대의 채움으로, 근거는 원문 위 표시로
 * 말한다. 같은 요건을 글로 다시 옮겨 적지 않는다.
 */

const STAGE_LABEL = {
  queued: "차례를 기다리는 중",
  extracting: "요건을 뽑는 중",
  validating: "원문과 맞춰 보는 중",
  covering: "내 기록과 대조하는 중",
  done: "분석 끝",
  failed: "분석 실패",
} as const;

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

  const covered = requirements.filter((one) => one.coverage === "covered").length;

  return (
    <BrewFrame
      brewId={brewId}
      step="analyze"
      portfolioTitle={brewTitle(brew)}
      situation={requirements.length > 0 ? `충족 ${covered} / ${requirements.length}` : STAGE_LABEL[analysis.stage]}
    >
      {analysis.failure ? (
        <p className={styles.failure}>
          분석이 실패했습니다({analysis.failure.code}).
          {analysis.failure.retryable ? " 다시 분석을 눌러 주세요." : " 공고 원문을 다시 확인해 주세요."}
        </p>
      ) : null}

      <div className={styles.body}>
        <CoverageMap
          requirements={requirements}
          sourceText={data.sourceText}
          head={
            <header key="posting" className={styles.posting}>
              <div className={styles.postingName}>
                <h1 className={styles.postingTitle}>{brew.posting?.title ?? "공고 없이 시작한 제작"}</h1>
                {brew.posting ? <span className={styles.postingCompany}>{brew.posting.companyName}</span> : null}
              </div>
              <Reanalyze brewId={brewId} jobAnalysisId={brew.jobAnalysisId} analyzing={analysis.status === "queued" || analysis.status === "running"} />
            </header>
          }
        />
      </div>

      <div className={styles.footer}>
        <div className={styles.footerActions}>
          <span className={styles.footerCount}>
            <b>{brew.materials.selected}</b> / {brew.materials.total}
          </span>
          <Link href={`/brew/${brewId}/materials` as Route} className={styles.brew}>
            담을 기록 고르기
          </Link>
        </div>
      </div>
    </BrewFrame>
  );
}
