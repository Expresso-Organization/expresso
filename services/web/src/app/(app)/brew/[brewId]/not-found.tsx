import { RouteNotFound } from "@/components/shell/RouteFallbacks";

export default function NotFound() {
  return (
    <RouteNotFound
      title="그 작업을 찾을 수 없습니다"
      body="지워졌거나 주소가 잘못됐습니다. 공고를 넣어 새로 시작할 수 있습니다."
      backHref="/brew/new"
      backLabel="새로 시작"
    />
  );
}
