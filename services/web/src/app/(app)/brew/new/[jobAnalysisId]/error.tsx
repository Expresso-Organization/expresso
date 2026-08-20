"use client";

import { RouteError } from "@/components/shell/RouteError";

export default function Error(props: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <RouteError
      {...props}
      title="분석 결과를 불러오지 못했습니다"
      body="공고 분석은 남아 있습니다. 다시 시도해 주세요."
      backHref="/brew/new"
      backLabel="공고 다시 넣기"
    />
  );
}
