import { Skel, skelKeys } from "@/components/shell/Skeleton";

import { BrewSkeleton } from "../BrewSkeleton";
import styles from "./page.module.css";

/**
 * 03 레시피 — 위에 읽은 것 줄, 아래에 세 단(구성 236 · 문서 · 근거 320).
 *
 * 섹션 수는 레시피가 정한다. 왼쪽 구성 목록은 한 화면에 보이는 만큼 세우고
 * 나머지는 목록 안쪽 스크롤에 둔다. 오른쪽 요약은 세 줄로 고정이다 —
 * 문서·배치된 재료·담을 항목.
 */
export default function Loading() {
  return (
    <BrewSkeleton step="outline" tinted label="레시피를 불러오는 중">
      <div className={styles.body}>
        <div className={styles.topBar}>
          <Skel w={15} h={15} radius={4} />
          <Skel w={216} h={13} />
          <Skel w={62} h={9} style={{ marginLeft: 6 }} />
          <Skel w={104} h={20} radius={999} />
          <Skel w={82} h={20} radius={999} />
          <div className={styles.topRight}>
            <Skel w={128} h={28} radius={8} />
          </div>
        </div>

        <div className={styles.columns}>
          <aside className={`${styles.panel} ${styles.sections}`} aria-label="구성">
            <div className={styles.sectionsHead}>
              <Skel w={38} h={13} />
              <Skel w={52} h={11} />
              <Skel w={16} h={11} style={{ marginLeft: "auto" }} />
            </div>
            <div className={styles.sectionsList}>
              {skelKeys(7).map((row) => (
                <div key={row} className={styles.sectionRow}>
                  <Skel w={20} h={10} style={{ marginTop: 2 }} />
                  <div style={{ minWidth: 0 }}>
                    <Skel w={`${86 - (row % 4) * 12}%`} h={12} style={{ marginBottom: 7 }} />
                    <Skel w="64%" h={10} />
                  </div>
                </div>
              ))}
            </div>
            <div className={styles.sectionsFoot}>
              <Skel w={96} h={11} />
            </div>
          </aside>

          <section className={`${styles.panel} ${styles.document}`} aria-label="컨텍스트 문서">
            <div className={styles.documentHead}>
              <div className={styles.documentTitleRow}>
                <Skel w={15} h={15} radius={4} />
                <Skel w={162} h={15} />
              </div>
              <div className={styles.documentSub} style={{ marginTop: 10 }}>
                <Skel w={54} h={9} />
                <Skel w={268} h={11} />
                <Skel w={92} h={20} radius={999} style={{ marginLeft: "auto" }} />
              </div>
            </div>

            <div className={styles.documentBody}>
              {skelKeys(4).map((block) => (
                <div key={block} className={styles.contextBlock}>
                  <div className={styles.contextLabel}>
                    <Skel w={48} h={11} style={{ marginBottom: 7 }} />
                    <Skel w={32} h={10} />
                  </div>
                  <div className={styles.contextValue}>
                    <Skel h={12} style={{ marginBottom: 9 }} />
                    <Skel w={`${88 - block * 11}%`} h={12} style={{ marginBottom: 9 }} />
                    <Skel w="52%" h={12} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <aside className={`${styles.panel} ${styles.rationale}`} aria-label="근거">
            <div className={styles.summary}>
              {skelKeys(3).map((row) => (
                <div key={row} className={styles.summaryRow}>
                  <Skel w={`${46 - row * 6}%`} h={11} />
                  <Skel w={42} h={11} style={{ marginLeft: "auto" }} />
                </div>
              ))}
            </div>

            <div className={styles.rationaleBody}>
              <div className={styles.rationaleHead}>
                <Skel w={104} h={13} />
              </div>
              {skelKeys(4).map((row) => (
                <div key={row} style={{ marginBottom: 14 }}>
                  <Skel w={`${72 - (row % 3) * 10}%`} h={12} style={{ marginBottom: 7 }} />
                  <Skel w="90%" h={11} />
                </div>
              ))}
            </div>

            <div className={styles.rationaleFoot}>
              <Skel h={11} style={{ marginBottom: 12 }} />
              <Skel h={38} radius={10} />
            </div>
          </aside>
        </div>
      </div>
    </BrewSkeleton>
  );
}
