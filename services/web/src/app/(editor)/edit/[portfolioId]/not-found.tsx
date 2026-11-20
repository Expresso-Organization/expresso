import { StandaloneNotice } from "@/components/shell/StandaloneNotice";

export default function NotFound() {
  return (
    <StandaloneNotice
      title="그 포트폴리오를 찾을 수 없습니다"
      body="지워졌거나 주소가 잘못됐습니다."
      backHref="/home"
      backLabel="홈으로"
    />
  );
}
