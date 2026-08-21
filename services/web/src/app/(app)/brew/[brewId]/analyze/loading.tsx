import { Skel, skelKeys } from "@/components/shell/Skeleton";

import { BrewSkeleton } from "../BrewSkeleton";
import styles from "./page.module.css";

/**
 * 01c 공고 분석 — 왼쪽 본문과 468px 원문 패널, 그 아래 76px 다음 단계 줄.
 *
 * 요건 여섯 줄은 자리를 채우려고 고른 수가 아니라, 왼쪽 단이 한 화면에 담는
 * 만큼이다. 실제 개수는 공고마다 다르고 스크롤 안에서 이어진다.
 */
export default function Loading() {
  return (
    <BrewSkeleton step="analyze" label="공고 분석을 불러오는 중">
      <div className={styles.body}>
        <div className={styles.left}>
          <div className={styles.head}>
            <Skel w={148} h={19} />
          </div>

          <div className={styles.sourceCard}>
            <Skel w={15} h={15} radius={4} />
            <Skel w={212} h={13} />
            <Skel w={124} h={11} />
            <Skel w={78} h={28} radius={8} style={{ marginLeft: "auto" }} />
          </div>

          <div className={styles.block}>
            <div className={styles.blockHead}>
              <Skel w={122} h={16} />
              <Skel w={52} h={17} radius={6} />
            </div>
            <Skel h={12} style={{ marginBottom: 8 }} />
            <Skel w="74%" h={12} />
          </div>

          <div style={{ flexShrink: 0 }}>
            <div className={styles.requirementsHead}>
              <Skel w={146} h={16} />
              <Skel w={168} h={11} style={{ marginLeft: "auto" }} />
            </div>
            {skelKeys(6).map((row) => (
              <div key={row} className={styles.requirement}>
                <Skel w={14} h={10} style={{ marginTop: 2 }} />
                <div className={styles.requirementBody}>
                  <div className={styles.requirementHead}>
                    <Skel w={`${44 - (row % 3) * 8}%`} h={13} />
                    <Skel w={68} h={11} />
                    <Skel w={54} h={18} radius={6} style={{ marginLeft: "auto" }} />
                  </div>
                  <Skel w={`${88 - (row % 4) * 9}%`} h={11} />
                </div>
              </div>
            ))}
          </div>

          <div className={styles.readBar}>
            <Skel w={16} h={16} radius={4} />
            <Skel grow h={11} />
          </div>
        </div>

        <div className={styles.right}>
          <div className={styles.rightHead}>
            <Skel w={128} h={16} />
            <Skel w={18} h={12} />
          </div>
          <Skel w={196} h={11} style={{ marginBottom: 12 }} />

          <div style={{ flexShrink: 0 }}>
            {skelKeys(5).map((quote) => (
              <div key={quote} className={styles.quote}>
                <Skel h={12} style={{ marginBottom: 8 }} />
                <Skel w={`${82 - (quote % 3) * 14}%`} h={12} />
              </div>
            ))}
          </div>

          <div className={styles.preview}>
            <Skel w={19} h={19} radius={5} style={{ marginTop: 1 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <Skel w="72%" h={13} style={{ marginBottom: 9 }} />
              <Skel h={11} style={{ marginBottom: 6 }} />
              <Skel w="58%" h={11} />
            </div>
          </div>
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
