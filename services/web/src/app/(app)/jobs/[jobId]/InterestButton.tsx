"use client";

import { useActionState, useOptimistic } from "react";

import { Icon } from "@/components/ui/Icon";

import { toggleInterestAction, type InterestState } from "./interest-actions";
import styles from "./page.module.css";

/**
 * 06b 머리의 관심 공고 버튼.
 *
 * 누르는 즉시 아이콘과 문구를 바꾸고, 서버가 답하면 새로 그린 `interested`로
 * 맞춘다. 실패하면 `useOptimistic`이 원래 값으로 돌아가고 실패 문구를 남긴다.
 */
export function InterestButton({
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

  return (
    <form action={action} className={styles.interestForm}>
      <input type="hidden" name="jobPostingId" value={jobPostingId} />
      <input type="hidden" name="next" value={interested ? "remove" : "save"} />
      <button
        type="submit"
        className={styles.headAction}
        aria-pressed={shown}
        disabled={pending}
      >
        <Icon
          name="bookmark-simple"
          weight={shown ? "fill" : "regular"}
          size={14}
          color={shown ? "var(--ex-accent-text)" : "var(--ex-fg-muted)"}
        />
        {shown ? "관심 공고" : "관심 공고에 담기"}
      </button>
      {state.error && !pending ? (
        <span role="status" className={styles.interestError}>
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
