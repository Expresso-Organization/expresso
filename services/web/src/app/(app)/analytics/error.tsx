"use client";

import { RouteError } from "@/components/shell/RouteError";

export default function Error(props: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <RouteError
      {...props}
      title="분석을 불러오지 못했습니다"
      body="방문 기록은 그대로입니다. 화면을 그리는 중에만 실패했습니다."
      backHref="/home"
      backLabel="홈으로"
    />
  );
}
