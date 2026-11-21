import { RouteNotFound } from "@/components/shell/RouteFallbacks";

export default function NotFound() {
  return (
    <RouteNotFound
      title="그 작업을 찾을 수 없습니다"
      body="지워졌거나 주소가 잘못됐습니다. 새 포트폴리오를 시작할 수 있습니다."
      backHref="/home?new=portfolio"
      backLabel="새로 시작"
    />
  );
}
