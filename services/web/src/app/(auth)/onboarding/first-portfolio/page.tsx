import Link from "next/link";

import { Icon } from "@/components/ui/Icon";

import { OnboardingShell, onboardingStyles as styles } from "../OnboardingShell";

/** 방금 만든 기록으로 일치도를 계산한 결과. */
const CANDIDATES = [
  {
    id: "toss",
    initial: "토",
    company: "토스",
    role: "정산 플랫폼 백엔드",
    reason: "정산 경험 2건이 요건과 정확히 맞습니다",
    score: 92,
    selected: true,
  },
  {
    id: "daangn",
    initial: "당",
    company: "당근",
    role: "서버 엔지니어",
    reason: "대용량 처리 경험은 있으나 근거가 얕습니다",
    score: 78,
    selected: false,
  },
  {
    id: "kakao",
    initial: "카",
    company: "카카오",
    role: "플랫폼 백엔드",
    reason: "요건 3개 중 1개가 비어 있습니다",
    score: 71,
    selected: false,
  },
];

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

export default function OnboardingFirstPortfolioPage() {
  return (
    <OnboardingShell
      step={4}
      wide
      footRight={
        <>
          <Link href="/home" className={styles.ghost}>
            홈으로 가기
          </Link>
          <Link href="/brew/toss/analyze" className={styles.primary}>
            토스 공고로 시작하기
          </Link>
        </>
      }
    >
      <div className={styles.readyTitle}>기록 12건이 준비됐습니다</div>
      <h1 className={styles.title}>이제 한 곳을 골라 뽑아 봅니다</h1>
      <p className={styles.lede}>
        방금 만든 기록으로 일치도를 계산했습니다. 하나를 고르면 분석 → 인터뷰 →
        생성까지 이어집니다.
      </p>

      <div className={styles.jobCards} role="radiogroup" aria-label="시작할 공고">
        {CANDIDATES.map((job) => (
          <button
            key={job.id}
            type="button"
            role="radio"
            aria-checked={job.selected}
            className={`${styles.jobCard} ${job.selected ? styles.jobCardOn : ""}`}
          >
            <span className={styles.jobAvatar}>{job.initial}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className={styles.jobCompany} style={{ display: "block" }}>
                {job.company}
              </span>
              <span className={styles.jobRole} style={{ display: "block" }}>
                {job.role}
              </span>
              <span className={styles.jobReason} style={{ display: "block" }}>
                {job.reason}
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
        ))}
      </div>

      <p className={styles.timeNote}>
        질문 6개에 답하면 평균 12분. 중간에 멈춰도 이어서 할 수 있습니다.
      </p>

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
        <Icon name="folder-open" size={18} color="var(--ex-slate-500)" />
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
