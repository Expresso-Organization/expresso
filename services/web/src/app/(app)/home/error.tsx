"use client";

import { RouteError } from "@/components/shell/RouteError";

export default function Error(props: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <RouteError
      {...props}
      title="홈을 불러오지 못했습니다"
      body="잠시 뒤 다시 시도해 주세요. 계속 같으면 요청 번호와 함께 알려 주세요."
      backHref="/home"
      backLabel="새로고침"
    />
  );
}
