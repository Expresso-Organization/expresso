import { AnalyzeSkeletonBody } from "./analyze/AnalyzeSkeletonBody";
import { BrewSkeleton } from "./BrewSkeleton";

/**
 * 마법사 바깥에서 들어올 때 — 아직 어느 단계인지 모른다.
 *
 * 단계별 `loading.tsx`가 각자 자기 칸을 칠하지만, 이 경계는 그보다 먼저 서서 주소의 단계를
 * 알 수 없다. 어느 칸도 칠하지 않고 첫 단계(공고 분석)의 뼈대를 쓴다.
 */
export default function Loading() {
  return (
    <BrewSkeleton label="제작 화면을 불러오는 중">
      <AnalyzeSkeletonBody />
    </BrewSkeleton>
  );
}
