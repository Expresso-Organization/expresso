import { Skel, skelKeys } from "@/components/shell/Skeleton";

import styles from "./page.module.css";

/** 01 공고 분석의 뼈대 — 머리, 충족 막대와 요건, 원문, 바닥. 실제 개수는 공고마다 다르다. */
export function AnalyzeSkeletonBody() {
  return (
    <>
      <div className={styles.body}>
        <div className={styles.left}>
          <Skel h={10} radius={2} style={{ marginBottom: 28 }} />
          {skelKeys(6).map((row) => (
            <div key={row} className={styles.row}>
              <Skel w={14} h={14} radius={7} />
              <Skel w={`${72 - (row % 3) * 12}%`} h={14} />
              <Skel w={28} h={12} />
              <Skel w={16} h={16} radius={8} />
            </div>
          ))}
        </div>
        <div className={styles.right}>
          <div className={styles.posting}>
            <div className={styles.postingName}>
              <Skel w="62%" h={15} />
              <Skel w={72} h={11} style={{ marginTop: 6 }} />
            </div>
            <Skel w={72} h={32} radius={8} />
          </div>
          {skelKeys(12).map((row) => (
            <Skel key={row} w={`${94 - (row % 4) * 11}%`} h={12} style={{ marginBottom: 12 }} />
          ))}
        </div>
      </div>
      <div className={styles.footer}>
        <div className={styles.footerActions}>
          <Skel w={56} h={20} />
          <Skel w={148} h={44} radius={999} />
        </div>
      </div>
    </>
  );
}
