"use client";

import {
  StandaloneNotice,
  standaloneNoticeStyles as styles,
} from "@/components/shell/StandaloneNotice";

/** Next 16의 재시도 콜백 이름은 `reset`이 아니라 `retry`다. */
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <StandaloneNotice
      title="편집기를 불러오지 못했습니다"
      body="저장된 내용은 그대로입니다. 다시 시도하면 마지막 상태부터 다시 엽니다."
      backHref="/home"
      backLabel="홈으로"
      digest={error.digest}
    >
      <button type="button" className={styles.action} onClick={() => retry()}>
        다시 시도
      </button>
    </StandaloneNotice>
  );
}
