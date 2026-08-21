import { SkelRegion } from "@/components/shell/Skeleton";

import { BrewSkeleton, SkelLines } from "../BrewSkeleton";
import styles from "./page.module.css";

/** 02 재료 고르기 — 한 단에 기록 표가 선다. */
export default function Loading() {
  return (
    <BrewSkeleton step="materials">
      <SkelRegion label="재료를 불러오는 중" className={styles.body}>
        <div className={styles.left}>
          <SkelLines count={12} />
        </div>
      </SkelRegion>
    </BrewSkeleton>
  );
}
