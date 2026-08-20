"use client";

import { RouteError } from "@/components/shell/RouteError";

export default function Error(props: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <RouteError
      {...props}
      title="공고를 불러오지 못했습니다"
      body="검색 조건은 주소에 남아 있습니다. 다시 시도하면 같은 조건으로 다시 찾습니다."
      backHref="/home"
      backLabel="홈으로"
    />
  );
}
