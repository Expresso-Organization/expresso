import { Skel, skelKeys } from "@/components/shell/Skeleton";

import { BrewSkeleton } from "../BrewSkeleton";
import styles from "./page.module.css";

/**
 * 02 재료 고르기 — 왼쪽 기록 표와 396px 고른 재료 레일.
 *
 * 표는 다섯 칸 격자(제목 · 카테고리 · 시기 · 상태 · 매칭)를 그대로 쓴다.
 * 담을 수 있는 만큼은 요금제가 정하고 기록 수는 사람마다 다르므로, 줄 수는
 * 표가 한 화면에 담는 만큼(1440×900에서 열다섯 줄)으로 둔다 — 적게 세우면
 * 표 아래가 빈 채로 남고, 나머지는 표 안쪽 스크롤이다.
 *
 * 제작 모드는 둘(에이전트 · 함께)로 고정이다.
 */
export default function Loading() {
  return (
    <BrewSkeleton step="materials" label="재료를 불러오는 중">
      <div className={styles.body}>
        <div className={styles.left}>
          <div className={styles.head}>
            <Skel w={34} h={34} radius={9} />
            <Skel w={152} h={19} />
            <Skel w={124} h={11} style={{ marginLeft: "auto" }} />
          </div>
          <div className={styles.blurb}>
            <Skel h={12} style={{ marginBottom: 9 }} />
            <Skel w="62%" h={12} />
          </div>

          <div className={styles.tabs}>
            {skelKeys(3).map((tab) => (
              <Skel key={tab} w={62} h={12} style={{ marginBottom: 9 }} />
            ))}
            <div className={styles.tabsRight}>
              <Skel w={72} h={11} />
              <Skel w={58} h={11} />
            </div>
          </div>

          <div className={styles.table}>
            <div className={`${styles.row} ${styles.headRow}`}>
              {skelKeys(5).map((cell) => (
                <div key={cell} className={styles.headCell}>
                  <Skel w={cell === 0 ? 44 : 36} h={11} />
                </div>
              ))}
            </div>
            {skelKeys(15).map((row) => (
              <div key={row} className={styles.row}>
                <div className={styles.titleCell}>
                  <Skel w={15} h={15} radius={4} />
                  <Skel w={`${72 - (row % 5) * 8}%`} h={12} />
                </div>
                <div className={styles.cell}>
                  <Skel w="70%" h={11} />
                </div>
                <div className={styles.cell}>
                  <Skel w="80%" h={11} />
                </div>
                <div className={styles.cell}>
                  <Skel w={46} h={17} radius={6} />
                </div>
                <div className={styles.scoreCell}>
                  <Skel grow h={5} radius={999} />
                  <Skel w={18} h={11} />
                </div>
              </div>
            ))}
          </div>

          <div className={styles.footNote}>
            <Skel w={228} h={11} />
            <Skel w={196} h={11} />
          </div>
        </div>

        <aside className={styles.rail}>
          <div style={{ flexShrink: 0 }}>
            <div className={styles.railHead}>
              <Skel w={116} h={13} />
              <Skel w={72} h={11} style={{ marginLeft: "auto" }} />
            </div>
            <div className={styles.mixCard}>
              <div className={styles.mixBar}>
                {skelKeys(4).map((slot) => (
                  <Skel key={slot} grow h={6} radius={999} />
                ))}
              </div>
              <div className={styles.mixList}>
                {skelKeys(4).map((row) => (
                  <div key={row} className={styles.mixRow}>
                    <Skel w={7} circle />
                    <Skel w={`${58 - row * 7}%`} h={11} />
                    <Skel w={14} h={11} style={{ marginLeft: "auto" }} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className={styles.railSection}>
            <div className={styles.modeHead}>
              <Skel w={38} h={9} />
              <Skel w={104} h={13} />
            </div>
            <div className={styles.modes}>
              {skelKeys(2).map((mode) => (
                <div key={mode} className={styles.mode}>
                  <Skel w={15} h={15} radius="50%" style={{ marginTop: 2 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Skel w="52%" h={12} style={{ marginBottom: 7 }} />
                    <Skel w="86%" h={11} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </BrewSkeleton>
  );
}
