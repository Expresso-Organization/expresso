import { StandaloneNotice } from "@/components/shell/StandaloneNotice";

export default function NotFound() {
  return (
    <StandaloneNotice
      title="페이지를 찾을 수 없습니다"
      body="주소가 바뀌었거나 잘못 입력됐을 수 있습니다."
      backHref="/home"
      backLabel="홈으로"
    />
  );
}
