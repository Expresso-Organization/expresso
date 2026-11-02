import { Skel, SkelRegion, skelKeys } from "@/components/shell/Skeleton";

import styles from "./page.module.css";

/**
 * 홈에서 **기다리는 자리**의 뼈대.
 *
 * 격자와 여백은 화면과 같은 `page.module.css`에서 나온다 — 여기서 값을 다시
 * 적으면 화면이 바뀔 때 조용히 어긋난다. 이 파일이 정하는 것은 "무엇이 몇 개
 * 오는가"뿐이고, 그 수는 화면이 실제로 자르는 만큼이다.
 */

/**
 * 공고 카드(`roleJobs`의 `limit: 5`). 오른쪽 차트 카드는 배포한 사이트가 있어야
 * 서므로, 기다리는 동안에는 공고 카드만 한 줄을 다 쓴다.
 */
export function MidRowSkeleton() {
  return (
    <SkelRegion label="공고를 불러오는 중" className={`${styles.midRow} ${styles.midRowSingle}`}>
      <div className={styles.card}>
        <div className={styles.cardHead}>
          <Skel w={132} h={26} radius={8} />
          <Skel w={28} h={11} style={{ marginLeft: "auto" }} />
        </div>
        {skelKeys(5).map((row) => (
          <div key={row} className={styles.jobRow}>
            <Skel w={28} h={28} radius={8} />
            <div className={styles.jobBody}>
              <Skel w={`${58 - row * 6}%`} h={13} />
              <Skel w="34%" h={11} style={{ marginTop: 8 }} />
            </div>
            <Skel w={62} h={34} radius={9} />
          </div>
        ))}
      </div>
    </SkelRegion>
  );
}

/** 내 포트폴리오 — 카드 다섯과 「새 포트폴리오」 칸(`GRID_ITEMS`). 썸네일 자리는 16:10이다. */
export function PortfolioGridSkeleton() {
  return (
    <SkelRegion label="포트폴리오를 불러오는 중">
      <div className={styles.sectionHead}>
        <Skel w={82} h={14} />
      </div>
      <div className={styles.portfolioGrid}>
        {skelKeys(3).map((card) => (
          <div key={card} className={styles.portfolioCard}>
            <div className={styles.portfolioThumb} />
            <div className={styles.portfolioBody}>
              <Skel w={`${72 - card * 9}%`} h={13} />
              <Skel w="58%" h={11} />
              <Skel w="44%" h={11} style={{ marginTop: 8 }} />
            </div>
          </div>
        ))}
      </div>
    </SkelRegion>
  );
}
