"use client";

import {
  StandaloneNotice,
  standaloneNoticeStyles as styles,
} from "@/components/shell/StandaloneNotice";

/**
 * 구간 경계가 잡지 못한 예외의 마지막 그물.
 *
 * `error.message`는 내보내지 않는다 — 프로덕션에서는 어차피 가려지고,
 * 가려지지 않으면 내부 사정이 새어 나간다. 대신 서버 로그에서 찾을 수 있는
 * `digest`를 보여준다.
 */
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <StandaloneNotice
      title="화면을 그리지 못했습니다"
      body="잠시 뒤 다시 시도해 주세요. 계속 같으면 아래 요청 번호와 함께 알려 주세요."
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
