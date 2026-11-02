import { RouteNotFound } from "@/components/shell/RouteFallbacks";

export default function RecordNotFound() {
  return (
    <RouteNotFound
      title="그 기록은 없습니다"
      body="휴지통으로 옮겼거나 지웠을 수 있습니다. 휴지통은 카테고리 화면의 「…」 메뉴에 있습니다."
      backHref="/career/experience"
      backLabel="내 커리어로"
    />
  );
}
