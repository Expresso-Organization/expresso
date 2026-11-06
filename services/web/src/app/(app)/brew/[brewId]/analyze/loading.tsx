import { BrewSkeleton } from "../BrewSkeleton";
import { AnalyzeSkeletonBody } from "./AnalyzeSkeletonBody";

export default function Loading() {
  return (
    <BrewSkeleton step="analyze" label="공고 분석을 불러오는 중">
      <AnalyzeSkeletonBody />
    </BrewSkeleton>
  );
}
