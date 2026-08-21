import { BrewSkeleton, SkelLines } from "./BrewSkeleton";
import { SkelRegion } from "@/components/shell/Skeleton";

import styles from "./analyze/page.module.css";

/**
 * 마법사 바깥에서 들어올 때 — 아직 어느 단계인지 모른다.
 *
 * 단계별 `loading.tsx`가 각자 자기 칸을 칠하지만, 이 경계는 그보다 바깥이라
 * 주소의 단계를 알 수 없다. 어느 칸도 칠하지 않고 여섯 칸의 자리만 세운다.
 * 무대는 첫 단계(공고 분석)의 두 단 구조를 쓴다 — 마법사는 여기서 시작한다.
 */
export default function Loading() {
  return (
    <BrewSkeleton>
      <SkelRegion label="제작 화면을 불러오는 중" className={styles.body}>
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
