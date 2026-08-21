import { AppBody, AppHeader } from "@/components/shell/AppShell";
import { Skel, SkelRegion, skelKeys } from "@/components/shell/Skeleton";

import styles from "./page.module.css";

/**
 * 06 공고 탐색이 목록을 기다리는 동안.
 *
 * 제목은 비운다 — `q`가 있으면 "공고 검색", 없으면 "공고 탐색"인데
 * `loading.tsx`는 searchParams를 받지 않는다. 둘 중 하나를 골라 적으면 절반은
 * 틀린 말이 잠깐 보인다.
 *
 * 검색 줄은 조건 칩이 붙는 검색 지면 대신 **탐색 지면의 한 줄**을 세운다.
 * 목록 행은 한 쪽에 오는 만큼(`pageSize` 20건) 그린다 — 결과 카드는 높이를
 * 다 쓰므로 적게 그리면 아래가 빈 채로 남는다.
 */
export default function Loading() {
  return (
    <>
      <AppHeader
        title={<Skel w={82} h={16} />}
        actions={
          <>
            <Skel w={118} h={12} />
            <Skel w={92} h={12} />
          </>
        }
      />
      <AppBody>
        <SkelRegion label="공고를 불러오는 중" className={styles.content}>
          <div className={styles.searchBar}>
            <Skel w={18} circle />
            <Skel grow h={15} />
            <Skel w={70} h={38} radius={999} />
          </div>

          <div className={styles.categoryTabs}>
            {skelKeys(5).map((tab) => (
              <Skel key={tab} w={56 + (tab % 3) * 14} h={12} style={{ marginBottom: 10 }} />
            ))}
          </div>

          <div className={styles.columns}>
            <div className={styles.results}>
              <div className={styles.resultsHead}>
                <Skel w={104} h={13} />
                <Skel w={128} h={11} />
              </div>
              <div className={styles.rows}>
                {skelKeys(20).map((row) => (
                  <div key={row} className={styles.row}>
                    <Skel w={30} h={30} radius={8} />
                    <span className={styles.rowTitle}>
                      <Skel w={`${72 - (row % 4) * 10}%`} h={13} />
                      <Skel w="34%" h={11} style={{ marginTop: 6 }} />
                    </span>
                    <Skel w={64} h={11} />
                    <Skel w={38} h={13} />
                  </div>
                ))}
              </div>
              <div className={styles.resultsFoot}>
                <Skel w={132} h={11} />
                <Skel w={148} h={26} radius={8} />
                <span />
              </div>
            </div>

            <aside className={styles.rail}>
              {skelKeys(2).map((card) => (
                <div key={card} className={styles.railCard}>
                  <Skel w={140} h={13} />
                  <Skel h={11} style={{ marginTop: 12 }} />
                  <Skel w="78%" h={11} style={{ marginTop: 7 }} />
                  <Skel w="56%" h={11} style={{ marginTop: 7 }} />
                </div>
              ))}
            </aside>
          </div>
        </SkelRegion>
      </AppBody>
    </>
  );
}
