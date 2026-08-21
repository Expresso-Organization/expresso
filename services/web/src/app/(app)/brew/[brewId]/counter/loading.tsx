import { SkelRegion } from "@/components/shell/Skeleton";

import { BrewSkeleton, SkelLines } from "../BrewSkeleton";
import styles from "./page.module.css";

/** 02b AI 대화 — 대화 카드와 380px 옆 패널. */
export default function Loading() {
  return (
    <BrewSkeleton step="counter">
      <SkelRegion label="대화를 불러오는 중" className={styles.body}>
        <div className={styles.card} style={{ padding: "20px 22px" }}>
          <SkelLines count={8} />
        </div>
        <div className={styles.side} style={{ padding: "18px 20px" }}>
          <SkelLines count={5} from={86} />
        </div>
      </SkelRegion>
    </BrewSkeleton>
  );
}
