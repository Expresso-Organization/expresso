import { SkelRegion } from "@/components/shell/Skeleton";

import { BrewSkeleton, SkelLines } from "../BrewSkeleton";
import styles from "./page.module.css";

/** 01c 공고 분석 — 왼쪽 본문과 468px 요건 패널. */
export default function Loading() {
  return (
    <BrewSkeleton step="analyze">
      <SkelRegion label="공고 분석을 불러오는 중" className={styles.body}>
        <div className={styles.left}>
          <SkelLines count={9} />
        </div>
        <div className={styles.right}>
          <SkelLines count={6} from={88} />
        </div>
      </SkelRegion>
    </BrewSkeleton>
  );
}
