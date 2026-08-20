import { RouteNotFound } from "@/components/shell/RouteFallbacks";

export default function NotFound() {
  return (
    <RouteNotFound
      title="그 공고 분석을 찾을 수 없습니다"
      body="분석이 만료됐거나 주소가 잘못됐습니다. 공고를 다시 넣어 주세요."
      backHref="/brew/new"
      backLabel="공고 다시 넣기"
    />
  );
}
