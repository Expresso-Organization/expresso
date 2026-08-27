import { Skel, skelKeys } from "@/components/shell/Skeleton";

import { BrewSkeleton } from "../BrewSkeleton";
import styles from "./page.module.css";

/**
 * 02b AI 대화 — 대화 카드와 380px 근거 패널. 지면은 surface-50이다.
 *
 * 대화 카드는 위에서부터 머리말 · 실타래 · 입력창이다. 실타래에는 방금 답한
 * 것 하나와 지금 묻는 것 하나가 보인다 — 앞선 질문은 접히므로 뼈대도 그
 * 접힌 줄까지만 세운다.
 *
 * 질문 개수는 공고가 정한다. 머리말의 진행 칸은 몇 개가 될지 모르므로 칸을
 * 나누지 않고 한 줄로 둔다.
 */
export default function Loading() {
  return (
    <BrewSkeleton step="counter" tinted label="대화를 불러오는 중">
      <div className={styles.body}>
        <div className={styles.card}>
          <div className={styles.head}>
            <Skel w={24} circle />
            <Skel w={52} h={13} />
            <Skel w={186} h={11} />
            <div className={styles.headRight}>
              <Skel w={96} h={6} radius={999} />
              <Skel w={34} h={11} />
            </div>
          </div>

          <div className={styles.thread}>
            {/* 접힌 줄의 실선은 글이 아니라 장식이다 — 그대로 그린다. */}
            <div className={styles.collapse}>
              <span className={styles.collapseLine} />
              <Skel w={104} h={11} />
              <span className={styles.collapseLine} />
            </div>

            <div className={styles.aiRow}>
              <Skel w={26} circle />
              <div className={styles.aiBubble} style={{ flex: 1, minWidth: 0 }}>
                <Skel h={12} style={{ marginBottom: 8 }} />
                <Skel w="64%" h={12} />
              </div>
            </div>

            <div className={styles.recordChip}>
              <Skel w={14} h={14} radius={4} />
              <Skel w={216} h={12} />
              <Skel w={32} h={11} style={{ marginLeft: "auto" }} />
            </div>

            <div className={styles.questionRow}>
              <Skel w={26} circle />
              <div style={{ flex: 1, minWidth: 0 }}>
                <Skel w={26} h={10} style={{ marginBottom: 10 }} />
                <Skel w="88%" h={20} style={{ marginBottom: 8 }} />
                <Skel w="54%" h={20} style={{ marginBottom: 12 }} />
                <Skel w="72%" h={11} />
              </div>
            </div>
          </div>

          <div className={styles.composer}>
            <div className={styles.inputBox}>
              <Skel h={54} radius={8} />
              <div className={styles.inputActions}>
                <Skel w={288} h={11} />
                <Skel w={84} h={34} radius={9} style={{ marginLeft: "auto" }} />
              </div>
            </div>
          </div>
        </div>

        <aside className={styles.side}>
          <div className={styles.sideHead}>
            <div className={styles.sideHeadRow}>
              <Skel w={122} h={13} />
            </div>
            <Skel w={168} h={11} style={{ marginTop: 8 }} />
          </div>

          <div className={styles.sideBody}>
            <div className={styles.recordHead}>
              <Skel w={14} h={14} radius={4} />
              <Skel w={148} h={12} />
            </div>
            <Skel w="86%" h={11} style={{ marginTop: 9 }} />
            <Skel w={128} h={11} style={{ marginTop: 12 }} />

            <div className={styles.divider} />

            <div className={styles.listHead}>
              <Skel w={62} h={12} />
              <Skel w={14} h={11} />
              <Skel w={54} h={11} style={{ marginLeft: "auto" }} />
            </div>
            <div className={styles.finishedList}>
              {skelKeys(3).map((row) => (
                <div key={row} className={styles.finishedRow}>
                  <Skel w={13} h={13} radius={4} />
                  <Skel w={`${80 - row * 9}%`} h={11} />
                </div>
              ))}
            </div>

            <div className={`${styles.divider} ${styles.dividerTight}`} />

            <div className={styles.listHead}>
              <Skel w={62} h={12} />
              <Skel w={14} h={11} />
            </div>
            <div className={styles.remainingList}>
              {skelKeys(3).map((row) => (
                <div key={row} className={styles.remainingRow}>
                  <Skel w={16} h={10} style={{ marginTop: 2 }} />
                  <Skel w={`${76 - row * 8}%`} h={11} />
                </div>
              ))}
            </div>
          </div>

          <div className={styles.sideFoot}>
            <Skel w={132} h={11} />
            <Skel w={104} h={34} radius={9} style={{ marginLeft: "auto" }} />
          </div>
        </aside>
      </div>
    </BrewSkeleton>
  );
}
