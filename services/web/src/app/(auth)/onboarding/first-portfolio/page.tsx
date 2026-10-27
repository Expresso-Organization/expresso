import Link from "next/link";

import { analyzePostingAction } from "@/app/(app)/brew/new/new-brew-actions";
import { CompanyAvatar } from "@/components/ui/CompanyAvatar";
import { Icon } from "@/components/ui/Icon";
import { homeEngagement } from "@/lib/app-data";
import { requireSession } from "@/lib/require-session";

import { OnboardingShell, onboardingStyles as styles } from "../OnboardingShell";

const NEXT_STEPS = [
  {
    title: "목록에서 공고를 고릅니다",
    note: "요구 역량을 뽑고 내 기록으로 덮이는 곳을 표시합니다",
  },
  {
    title: "빈 곳만 질문으로 묻습니다",
    note: "답하는 내용은 그대로 새 기록이 됩니다",
  },
  {
    title: "무엇을 쓸지 먼저 정합니다",
    note: "섹션과 근거를 확정한 뒤에 문장을 만듭니다",
  },
  {
    title: "템플릿을 고르고 생성합니다",
    note: "주소를 발급해 바로 공개할 수 있습니다",
  },
];

/**
 * 10e 첫 포트폴리오.
 *
 * 공고 카드는 홈과 같은 추천(`GET /home`의 `recommendedJobs`)이고, 누르면 01
 * 「바로 시작」과 같은 액션으로 그 공고의 분석을 시작한다. 추천이 없으면 카드
 * 자리를 비우고 공고 목록으로 보낸다.
 */
export default async function OnboardingFirstPortfolioPage() {
  const session = await requireSession();
  const { data: home } = await homeEngagement(session.accessToken);
  const recordTotal = session.categories.reduce(
    (sum, category) => sum + category.recordCount,
    0,
  );
  const candidates = home.recommendedJobs.slice(0, 3);

  return (
    <OnboardingShell
      step={3}
      wide
      footRight={
        <>
          <Link href="/home" className={styles.ghost}>
            홈으로 가기
          </Link>
          <Link href="/brew/new" className={styles.primary}>
            공고 골라 시작하기
          </Link>
        </>
      }
    >
      {recordTotal > 0 ? (
        <div className={styles.readyTitle}>기록 {recordTotal}건이 준비됐습니다</div>
      ) : null}
      {candidates.length > 0 ? (
        <>
          <h1 className={styles.title}>이제 한 곳을 골라 뽑아 봅니다</h1>
          <p className={styles.lede}>
            내 기록으로 일치도를 계산한 공고입니다. 하나를 고르면 분석 → 인터뷰 →
            생성까지 이어집니다.
          </p>

          <div className={styles.jobCards}>
            {candidates.map((job) => (
              <form key={job.id} action={analyzePostingAction}>
                <input type="hidden" name="jobPostingId" value={job.id} />
                <button type="submit" className={styles.jobCard}>
                  <CompanyAvatar
                    company={{ name: job.company, logoUrl: job.companyLogoUrl }}
                    className={styles.jobAvatar}
                  />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className={styles.jobCompany} style={{ display: "block" }}>
                      {job.company}
                    </span>
                    <span className={styles.jobRole} style={{ display: "block" }}>
                      {job.title}
                    </span>
                  </span>
                  <span className={styles.jobScoreWrap}>
                    <span className={styles.jobScore} style={{ display: "block" }}>
                      {job.score}
                    </span>
                    <span className={styles.jobScoreLabel} style={{ display: "block" }}>
                      일치도
                    </span>
                  </span>
                </button>
              </form>
            ))}
          </div>

          <p className={styles.timeNote}>중간에 멈춰도 이어서 할 수 있습니다.</p>
        </>
      ) : (
        <>
          <h1 className={styles.title}>공고를 골라 첫 포트폴리오를 만듭니다</h1>
          <p className={styles.lede}>
            아직 내 기록에 맞춰 추천할 공고가 없습니다. 공고 목록에서 직접 고르거나,
            내 커리어에 경험을 먼저 적어 두면 일치도로 골라 드립니다.
          </p>
        </>
      )}

      <div className={styles.nextLabel}>WHAT HAPPENS NEXT</div>
      <div className={styles.nextGrid}>
        {NEXT_STEPS.map((step, index) => (
          <div key={step.title} className={styles.nextCard}>
            <div className={styles.nextNo}>{String(index + 1).padStart(2, "0")}</div>
            <div className={styles.nextTitle}>{step.title}</div>
            <div className={styles.nextNote}>{step.note}</div>
          </div>
        ))}
      </div>

      <div className={styles.altCard}>
        <Icon name="folder-open" size={18} color="var(--ex-fg-muted)" />
        <div style={{ minWidth: 0 }}>
          <div className={styles.altTitle}>먼저 기록부터 다듬고 싶다면</div>
          <div className={styles.altNote}>내 커리어로 이동해 자유롭게 정리하십시오</div>
        </div>
        <Link href="/career/experience" className={styles.altAction}>
          내 커리어로
        </Link>
      </div>
    </OnboardingShell>
  );
}
