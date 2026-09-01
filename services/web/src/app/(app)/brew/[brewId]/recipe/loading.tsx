import { Skel, skelKeys } from "@/components/shell/Skeleton";

import { BrewSkeleton } from "../BrewSkeleton";
import styles from "./Workbench.module.css";

/** 02 레시피 — 상단 한 줄과 두 영역. 자리는 응답 전에도 그대로 선다. */
export default function Loading() {
  return (
    <BrewSkeleton step="recipe" tinted label="레시피를 여는 중">
      <div className={styles.workbench}>
        <div className={styles.topBar}>
          <Skel w={200} h={20} />
          <Skel w={82} h={26} radius={999} />
          <Skel w={96} h={26} radius={999} />
          <Skel w={140} h={26} radius={999} />
        </div>
        <div className={styles.panes}>
          <div className={styles.rail}>
            <div className={styles.railBlock}>
              <Skel w={48} h={13} />
              {skelKeys(3).map((row) => (
                <Skel key={row} h={26} radius={7} style={{ marginTop: 6 }} />
              ))}
            </div>
            <div className={styles.railBlock} data-grow="1">
              <Skel w={72} h={13} />
              <Skel h={30} radius={8} style={{ marginTop: 8 }} />
            </div>
          </div>
          <div className={styles.sheet}>
            <div className={styles.doc}>
              {skelKeys(3).map((row) => (
                <Skel key={row} h={148} radius={10} style={{ marginBottom: 22 }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </BrewSkeleton>
  );
}
