"use client";

import { RouteError } from "@/components/shell/RouteError";

export default function Error(props: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <RouteError
      {...props}
      title="설정을 불러오지 못했습니다"
      body="잠시 뒤 다시 시도해 주세요."
      backHref="/home"
      backLabel="홈으로"
    />
  );
}
