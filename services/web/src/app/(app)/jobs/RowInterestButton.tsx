"use client";

import { useActionState, useOptimistic } from "react";

import { Icon } from "@/components/ui/Icon";

import {
  toggleInterestAction,
  type InterestState,
} from "./[jobId]/interest-actions";
import styles from "./page.module.css";

/**
 * 목록 행 끝의 관심 공고 북마크.
 *
 * 상세 머리의 `InterestButton`과 같은 서버 액션을 쓴다. 누르는 즉시 아이콘을
 * 바꾸고, 서버가 답하면 새로 그린 `interested`로 맞춘다. 실패하면 원래 모양으로
 * 돌아가고 아이콘을 경고색으로 바꿔 이름에 실패 사유를 싣는다 — 행이 좁아
 * 문구를 따로 놓을 자리가 없다.
 */
export function RowInterestButton({
  jobPostingId,
  interested,
}: {
  jobPostingId: string;
  interested: boolean;
}) {
  const [shown, setShown] = useOptimistic(interested);
  const [state, action, pending] = useActionState(
    async (_previous: InterestState, formData: FormData) => {
      setShown(!interested);
      return toggleInterestAction(formData);
    },
    { error: null },
  );

  const failed = state.error !== null && !pending;
  const label = failed ? (state.error ?? "") : shown ? "관심 공고에서 빼기" : "관심 공고에 담기";
  return (
    <form action={action} className={styles.rowInterestForm}>
      <input type="hidden" name="jobPostingId" value={jobPostingId} />
      <input type="hidden" name="next" value={interested ? "remove" : "save"} />
      <button
        type="submit"
        className={styles.rowInterest}
        aria-label={label}
        title={label}
        aria-pressed={shown}
        disabled={pending}
      >
        <Icon
          name="bookmark-simple"
          weight={shown ? "fill" : "regular"}
          size={15}
          color={
            failed
              ? "var(--ex-status-danger-text)"
              : shown
                ? "var(--ex-accent-text)"
                : "var(--ex-border-firm)"
          }
        />
      </button>
    </form>
  );
}
