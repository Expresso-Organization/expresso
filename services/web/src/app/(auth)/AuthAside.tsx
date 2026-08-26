import { LogoMark, Wordmark } from "@/components/brand/Logo";

import styles from "./auth.module.css";

/**
 * 10 · 10b 좌측 브랜드 패널. 문구만 화면마다 다르다.
 *
 * `data-theme="dark"`로 고정한 이유는 이 패널이 **앱 테마와 무관하게 늘
 * 어둡기** 때문입니다. 지면이 그러데이션으로 박혀 있으니 그 위의 글자도
 * 따라 뒤집히면 안 됩니다. 고정해 두면 안쪽 CSS는 여느 자리와 똑같이 역할
 * 토큰만 쓰면 됩니다.
 */
export function AuthAside({
  eyebrow,
  headline,
  lede,
}: {
  eyebrow: string;
  headline: React.ReactNode;
  lede: string;
}) {
  return (
    <div className={styles.aside} data-theme="dark">
      <div className={styles.ring1} aria-hidden="true" />
      <div className={styles.ring2} aria-hidden="true" />

      <div className={styles.asideBrand}>
        <LogoMark size={26} tone="dark" />
        <Wordmark size={17} tone="dark" />
      </div>

      <div className={styles.asideCopy}>
        <div className={styles.eyebrow}>{eyebrow}</div>
        <div className={styles.headline}>{headline}</div>
        <div className={styles.lede}>{lede}</div>
      </div>

      <div className={styles.stats}>
        <div>
          <div className={styles.statValue}>12,400</div>
          <div className={styles.statLabel}>만들어진 포트폴리오</div>
        </div>
        <div>
          <div className={styles.statValue}>4.2일</div>
          <div className={styles.statLabel}>평균 완성까지</div>
        </div>
        <div>
          <div className={styles.statValue}>31%</div>
          <div className={styles.statLabel}>서류 통과율 상승</div>
        </div>
      </div>
    </div>
  );
}
