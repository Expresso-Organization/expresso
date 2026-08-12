import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppHeader, AppShell } from "@/components/shell/AppShell";
import { Sidebar } from "@/components/shell/Sidebar";
import { Icon } from "@/components/ui/Icon";
import { ApiError } from "@/lib/api/client";
import { jobAnalyses } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

import { refreshAnalysisAction } from "../new-brew-actions";
import { StartBrew } from "./StartBrew";
import styles from "../page.module.css";

/** 분석이 지나는 자리. `job_analysis.progress_stage`가 그대로 문장이 된다. */
const STAGE = {
  queued: "차례를 기다리는 중",
  extracting: "요건을 뽑는 중",
  validating: "원문과 맞춰 보는 중",
  covering: "내 기록과 대조하는 중",
  done: "분석 끝",
  failed: "분석 실패",
} as const;

/**
 * 공고를 읽는 동안 기다리는 자리.
 *
 * 이 한 칸이 없어서 붙여넣기와 제작 시작을 곧장 이을 수 없었다 —
 * `POST /brews`는 분석이 `done`이 아니면 409로 막는다. 재료 순위를 공고
 * 요건으로 매기기 때문이고, 그 요건은 워커가 뽑는다.
 */
export default async function AnalyzingPage({
  params,
  searchParams,
}: {
  params: Promise<{ jobAnalysisId: string }>;
  searchParams: Promise<{ length?: string }>;
}) {
  const session = await requireSession();
  const { jobAnalysisId } = await params;
  const length = (await searchParams).length ?? "single";

  let result;
  try {
    result = (await jobAnalyses.get(session.accessToken, jobAnalysisId)).data;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) notFound();
    throw error;
  }

  const { analysis } = result;
  const running = analysis.status === "queued" || analysis.status === "running";

  return (
    <AppShell
      sidebar={
        <Sidebar
          active="new-portfolio"
          categories={session.categories}
          displayName={session.user.displayName}
          quotaUsed={session.quota.used}
          quotaLimit={session.quota.limit}
        />
      }
      header={<AppHeader title="새 포트폴리오" />}
    >
      <div className={styles.wait}>
        <div className={styles.waitCard}>
          <span className={`${styles.waitBadge} ${running ? "ex-anim-bob" : ""}`}>
            <Icon
              name={analysis.status === "failed" ? "warning" : "magnifying-glass"}
              weight="fill"
              size={17}
              color="var(--ex-bean-50, #fbf6f1)"
            />
          </span>

          {running ? (
            <>
              <h1 className={styles.waitTitle}>공고를 읽는 중</h1>
              <p className={styles.waitNote}>
                무엇을 요구하는지 뽑아내고 내 기록과 맞춰 봅니다. 이 화면을 닫아도
                계속됩니다.
              </p>
              <div className={styles.waitStage}>
                <span className={styles.waitDot} />
                <span>{STAGE[analysis.stage]}</span>
              </div>
              <form action={refreshAnalysisAction}>
                <input type="hidden" name="jobAnalysisId" value={jobAnalysisId} />
                <button type="submit" className={styles.waitGhost}>새로고침</button>
              </form>
            </>
          ) : analysis.status === "failed" ? (
            <>
              <h1 className={styles.waitTitle}>공고를 읽지 못했습니다</h1>
              <p className={styles.waitNote}>
                {analysis.failure ? `분석이 ${analysis.failure.code}로 멈췄습니다. ` : ""}
                공고 원문을 다시 확인하고 새로 시작해 주세요.
              </p>
              <Link href={"/brew/new" as Route} className={styles.waitAction}>
                다시 시작하기
              </Link>
            </>
          ) : (
            <>
              <h1 className={styles.waitTitle}>다 읽었습니다</h1>
              <p className={styles.waitNote}>
                요건 {result.requirements.length}개를 뽑았습니다. 이제 공고에 맞춰
                재료 순위를 매깁니다 — 정리된 기록이 한 건도 없으면 시작할 수
                없습니다.
              </p>
              <StartBrew jobAnalysisId={jobAnalysisId} lengthPreset={length} />
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
