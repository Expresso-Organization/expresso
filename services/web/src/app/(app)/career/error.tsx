"use client";

import { RouteError } from "@/components/shell/RouteError";

export default function Error(props: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <RouteError
      {...props}
      title="기록을 불러오지 못했습니다"
      body="적어 둔 기록은 그대로 있습니다. 다시 시도하면 같은 목록을 다시 가져옵니다."
      backHref="/home"
      backLabel="홈으로"
    />
  );
}
