import { Skel, skelKeys } from "@/components/shell/Skeleton";

import { BrewSkeleton } from "../BrewSkeleton";
import styles from "./Workbench.module.css";

/**
 * 02 레시피 — 제작 의도 줄과 세 영역. 자리는 응답 전에도 그대로 선다.
 */
export default function Loading() {
  return (
    <BrewSkeleton step="recipe" tinted label="블루프린트를 여는 중">
      <div className={styles.workbench}>
        <div className={styles.intentBar}>
          <div className={styles.intentHead}>
            <Skel w={62} h={12} />
            <Skel w={220} h={20} />
            <Skel w={160} h={26} radius={999} style={{ marginLeft: "auto" }} />
          </div>
        </div>
        <div className={styles.panes}>
          <div className={styles.recordsPane}>
            <Skel w={82} h={13} />
            <Skel h={30} radius={8} style={{ marginTop: 10 }} />
            {skelKeys(4).map((row) => (
              <Skel key={row} h={72} radius={10} style={{ marginTop: 8 }} />
            ))}
          </div>
          <div className={styles.canvas}>
            {skelKeys(2).map((row) => (
              <Skel key={row} h={188} radius={12} />
            ))}
          </div>
          <div className={styles.inspector}>
            <Skel w={72} h={13} />
            {skelKeys(5).map((row) => (
              <Skel key={row} h={44} radius={8} style={{ marginTop: 10 }} />
            ))}
          </div>
        </div>
      </div>
    </BrewSkeleton>
  );
}
