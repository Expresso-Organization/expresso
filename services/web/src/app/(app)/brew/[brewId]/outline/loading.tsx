import { SkelRegion } from "@/components/shell/Skeleton";

import { BrewSkeleton, SkelLines } from "../BrewSkeleton";
import styles from "./page.module.css";

/** 03 레시피 — 한 단에 섹션이 위에서 아래로 쌓인다. */
export default function Loading() {
  return (
    <BrewSkeleton step="outline">
      <SkelRegion label="레시피를 불러오는 중" className={styles.body}>
        <SkelLines count={11} />
      </SkelRegion>
    </BrewSkeleton>
  );
}
