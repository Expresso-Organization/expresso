"use client";

import { RouteError } from "@/components/shell/RouteError";

export default function Error(props: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <RouteError
      {...props}
      title="배포 화면을 불러오지 못했습니다"
      body="배포된 사이트는 영향을 받지 않았습니다. 다시 시도해 주세요."
      backHref="/home"
      backLabel="홈으로"
    />
  );
}
