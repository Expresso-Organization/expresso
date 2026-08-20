"use client";

import { RouteError } from "@/components/shell/RouteError";

export default function Error(props: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <RouteError
      {...props}
      title="이 단계를 불러오지 못했습니다"
      body="여기까지 고른 것은 저장돼 있습니다. 다시 시도하면 이어서 진행합니다."
      backHref="/brew/new"
      backLabel="새로 시작"
    />
  );
}
