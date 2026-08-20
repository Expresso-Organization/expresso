import { RouteNotFound } from "@/components/shell/RouteFallbacks";

export default function NotFound() {
  return (
    <RouteNotFound
      title="그 카테고리는 없습니다"
      body="이름이 바뀌었거나 지워졌을 수 있습니다. 사이드바에서 다시 골라 주세요."
      backHref="/home"
      backLabel="홈으로"
    />
  );
}
