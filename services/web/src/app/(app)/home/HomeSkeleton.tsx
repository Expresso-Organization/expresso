import { Skel, SkelRegion, skelKeys } from "@/components/shell/Skeleton";

import styles from "./page.module.css";

/**
 * 홈에서 **기다리는 자리**의 뼈대.
 *
 * 격자와 여백은 화면과 같은 `page.module.css`에서 나온다 — 여기서 값을 다시
 * 적으면 화면이 바뀔 때 조용히 어긋난다. 이 파일이 정하는 것은 "무엇이 몇 개
 * 오는가"뿐이고, 그 수는 화면이 실제로 자르는 만큼이다.
 */

/** 영역 2·3 — 추천 공고 3건(`slice(0, 3)`)과 진행 중 1건(`slice(0, 1)`). */
export function MidRowSkeleton() {
  return (
    <SkelRegion label="추천 공고를 불러오는 중" className={styles.midRow}>
      <div className={styles.card}>
        <div className={styles.cardHead}>
          <Skel w={126} h={14} />
          <Skel w={64} h={26} radius={8} />
          <Skel w={88} h={11} style={{ marginLeft: "auto" }} />
        </div>
        {skelKeys(3).map((row) => (
          <div key={row} className={styles.jobRow}>
            <Skel w={28} circle />
            <div className={styles.jobBody}>
              <div className={styles.jobHead}>
                <Skel w={`${58 - row * 7}%`} h={13} />
              </div>
            </div>
            <Skel w={62} h={34} radius={9} />
          </div>
        ))}
      </div>

      <div className={styles.sideColumn}>
        <div className={styles.plainCard}>
          <div className={styles.draftHead}>
            <Skel w={62} h={21} radius={999} />
          </div>
          <Skel w={168} h={15} style={{ marginTop: 12 }} />
          <Skel w={132} h={11} style={{ marginTop: 9 }} />
          <Skel h={38} radius={10} style={{ marginTop: 16 }} />
        </div>
      </div>
    </SkelRegion>
  );
}

/** 영역 4 — 내 포트폴리오. 격자가 3열이라 한 줄이 세 칸이다. */
export function PortfolioGridSkeleton() {
  return (
    <SkelRegion label="포트폴리오를 불러오는 중">
      <div className={styles.sectionHead}>
        <Skel w={82} h={14} />
        <Skel w={96} h={11} />
      </div>
      <div className={styles.portfolioGrid}>
        {skelKeys(3).map((card) => (
          <div
            key={card}
            className={styles.categoryCard}
            style={{ alignItems: "flex-start", flexDirection: "column", gap: "6px" }}
          >
            <Skel w={`${72 - card * 9}%`} h={13} />
            <Skel w="58%" h={11} />
            <Skel w="44%" h={11} />
          </div>
        ))}
      </div>
    </SkelRegion>
  );
}

/**
 * 내 커리어 요약 — 기본 분류 7개(`0002_seed.sql`)가 4열 격자에 두 줄로 앉는다.
 * 사용자가 분류를 더 만들면 그만큼 길어지지만, 기다리는 동안 알 수 있는 것은
 * 모두가 가지고 시작하는 7개까지다.
 */
export function CareerGridSkeleton() {
  return (
    <SkelRegion label="커리어 요약을 불러오는 중">
      <div className={styles.sectionHead}>
        <Skel w={64} h={14} />
        <Skel w={70} h={11} />
      </div>
      <div className={styles.categoryGrid}>
        {skelKeys(7).map((card) => (
          <div key={card} className={styles.categoryCard}>
            <Skel w={30} h={30} radius={8} />
            <Skel w="62%" h={12} />
            <Skel w={22} h={20} />
          </div>
        ))}
      </div>
    </SkelRegion>
  );
}
