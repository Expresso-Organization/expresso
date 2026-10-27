"use client";

import type { JobSearchCondition } from "@expresso/contracts";
import { useActionState } from "react";

import { Icon } from "@/components/ui/Icon";

import { saveSearchAction, type SaveSearchState } from "./jobs-actions";
import styles from "./page.module.css";

/**
 * 00b 「이 검색 저장」.
 *
 * 서버는 같은 검색을 막지 않고 한 줄 더 만든다. 그래서 이미 저장한 검색이면
 * 처음부터 「저장한 검색」으로 그리고 누를 수 없게 둔다(`saved`). 저장하면
 * 그 자리에서 같은 상태로 바뀐다.
 */
export function SaveSearchButton({
  query,
  conditions,
  saved,
}: {
  query: string;
  conditions: JobSearchCondition[];
  saved: boolean;
}) {
  const [state, action, pending] = useActionState(
    async (_previous: SaveSearchState) => saveSearchAction(query, conditions),
    { saved, error: null },
  );

  return (
    <form action={action} className={styles.parsedSaveForm}>
      {state.error && !pending ? (
        <span role="status" className={styles.parsedSaveError}>
          {state.error}
        </span>
      ) : null}
      <button
        type="submit"
        className={styles.parsedSave}
        disabled={state.saved || pending}
        aria-pressed={state.saved}
      >
        <Icon name={state.saved ? "check" : "floppy-disk"} size={14} />
        {state.saved ? "저장한 검색" : pending ? "저장하는 중" : "이 검색 저장"}
      </button>
    </form>
  );
}
