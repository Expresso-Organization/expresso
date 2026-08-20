import { RouteNotFound } from "@/components/shell/RouteFallbacks";

export default function NotFound() {
  return (
    <RouteNotFound
      title="그 공고를 찾을 수 없습니다"
      body="내려갔거나 주소가 잘못됐습니다. 목록에서 다시 골라 주세요."
      backHref="/jobs"
      backLabel="공고 목록"
    />
  );
}
