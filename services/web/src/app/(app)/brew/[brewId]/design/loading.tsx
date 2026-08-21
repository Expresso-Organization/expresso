import { SkelRegion } from "@/components/shell/Skeleton";

import { BrewSkeleton, SkelLines } from "../BrewSkeleton";
import styles from "./page.module.css";

/** 03b 디자인 선택 — 템플릿 지면과 322px 고른 것 패널. 지면은 surface-50이다. */
export default function Loading() {
  return (
    <BrewSkeleton step="design" tinted>
      <SkelRegion label="템플릿을 불러오는 중" className={styles.body}>
        <div className={styles.left}>
          <SkelLines count={8} />
        </div>
        <div className={styles.right}>
          <SkelLines count={5} from={88} />
        </div>
      </SkelRegion>
    </BrewSkeleton>
  );
}
