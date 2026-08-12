import { notFound } from "next/navigation";

import { PortfolioPage } from "@/components/portfolio/PortfolioPage";
import { ApiError } from "@/lib/api/client";
import { portfolios } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

import { selectLayoutAction } from "./layout-actions";
import styles from "./page.module.css";

/**
 * 지면 후보 비교.
 *
 * 03 화면의 알맹이다 — 같은 내용을 서로 다른 지면 3안으로 나란히 놓고 고른다.
 * 미리보기는 축소한 실제 지면이지 더미가 아니다(§8.3 T7.1.1).
 *
 * 후보는 추출 한 번이 문장과 함께 만든다. 아직 만들지 않았으면 고를 것이 없다.
 */
export default async function LayoutCandidatesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await requireSession();

  let portfolio;
  let layouts;
  try {
    [portfolio, layouts] = await Promise.all([
      portfolios.get(session.accessToken, slug).then(({ data }) => data),
      portfolios.layouts(session.accessToken, slug).then(({ data }) => data),
    ]);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) notFound();
    throw error;
  }

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>지면 3안</h1>
        <p className={styles.note}>
          {portfolio.title} · 같은 내용을 서로 다른 지면으로 세웠습니다
        </p>
      </header>

      {layouts.candidates.length === 0 ? (
        <p className={styles.empty}>
          아직 지면을 만들지 않았습니다. 추출을 돌리면 후보 3안이 함께 만들어집니다.
        </p>
      ) : (
        <div className={styles.grid}>
          {layouts.candidates.map((candidate, index) => {
            const selected = candidate.id === layouts.selectedId;
            return (
              <section key={candidate.id} className={styles.candidate}>
                <div className={styles.candidateHead}>
                  <span className={styles.candidateNo}>{String(index + 1).padStart(2, "0")}</span>
                  <span className={styles.candidateName}>{candidate.spec.type.display}</span>
                  <span className={styles.candidateMeta}>
                    {candidate.spec.rhythm.density} · {candidate.spec.type.measure}ch
                  </span>
                </div>
                <p className={styles.rationale}>{candidate.spec.rationale}</p>
                <div className={styles.frame}>
                  {/* 실제 지면을 그대로 축소한다. 더미 미리보기는 판단 근거가 못 된다. */}
                  <div className={styles.scaled}>
                    <PortfolioPage portfolio={portfolio} spec={candidate.spec} />
                  </div>
                </div>
                <form action={selectLayoutAction}>
                  <input type="hidden" name="portfolioId" value={portfolio.id} />
                  <input type="hidden" name="layoutId" value={candidate.id} />
                  <button
                    type="submit"
                    className={selected ? styles.chosen : styles.choose}
                    disabled={selected}
                  >
                    {selected ? "이 지면을 쓰는 중" : "이 지면으로"}
                  </button>
                </form>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
