import { Skel, skelKeys } from "@/components/shell/Skeleton";

import { BrewSkeleton } from "./BrewSkeleton";
import styles from "./analyze/page.module.css";

/**
 * 마법사 바깥에서 들어올 때 — 아직 어느 단계인지 모른다.
 *
 * 단계별 `loading.tsx`가 각자 자기 칸을 칠하지만, 이 경계는 그보다 바깥이라
 * 주소의 단계를 알 수 없다. 어느 칸도 칠하지 않고 여섯 칸의 자리만 세운다.
 *
 * 무대는 첫 단계(공고 분석)의 두 단과 다음 단계 줄을 쓴다 — 마법사는 여기서
 * 시작하고, 여섯 화면 중 넷이 이 두 단 얼개를 공유한다.
 */
export default function Loading() {
  return (
    <BrewSkeleton label="제작 화면을 불러오는 중">
      <div className={styles.body}>
        <div className={styles.left}>
          <div className={styles.head}>
            <Skel w={148} h={19} />
          </div>
          <div className={styles.sourceCard}>
            <Skel w={15} h={15} radius={4} />
            <Skel w={212} h={13} />
            <Skel w={124} h={11} />
          </div>
          {skelKeys(6).map((row) => (
            <div key={row} className={styles.requirement}>
              <Skel w={14} h={10} style={{ marginTop: 2 }} />
              <div className={styles.requirementBody}>
                <div className={styles.requirementHead}>
                  <Skel w={`${44 - (row % 3) * 8}%`} h={13} />
                  <Skel w={68} h={11} />
                </div>
                <Skel w={`${88 - (row % 4) * 9}%`} h={11} />
              </div>
            </div>
          ))}
        </div>
        <div className={styles.right}>
          <div className={styles.rightHead}>
            <Skel w={128} h={16} />
          </div>
          {skelKeys(5).map((quote) => (
            <div key={quote} className={styles.quote}>
              <Skel h={12} style={{ marginBottom: 8 }} />
              <Skel w={`${82 - (quote % 3) * 14}%`} h={12} />
            </div>
          ))}
        </div>
      </div>

      <div className={styles.footer}>
        <Skel w={17} h={17} radius={4} />
        <Skel w={268} h={12} />
        <div className={styles.footerActions}>
          <Skel w={132} h={38} radius={10} />
        </div>
      </div>
    </BrewSkeleton>
  );
}
