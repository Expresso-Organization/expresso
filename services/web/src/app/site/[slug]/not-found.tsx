import { StandaloneNotice } from "@/components/shell/StandaloneNotice";

export default function NotFound() {
  return (
    <StandaloneNotice
      title="그 사이트를 찾을 수 없습니다"
      body="주소가 바뀌었거나 아직 배포되지 않았습니다."
      backHref="/home"
      backLabel="홈으로"
    />
  );
}
