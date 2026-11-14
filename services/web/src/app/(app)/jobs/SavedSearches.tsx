"use client";

import type { SavedJobSearch } from "@expresso/contracts";
import Link from "next/link";
import { useActionState } from "react";

import { Icon } from "@/components/ui/Icon";

import { deleteSavedSearchAction, type DeleteSavedSearchState } from "./jobs-actions";
import { savedSearchQuery } from "./saved-search";
import styles from "./page.module.css";

/**
 * 00b · 06 오른쪽 「저장한 검색」. 「이 검색 저장」으로 남긴 검색을 저장한 조건 그대로 다시 열고,
 * 필요 없는 것은 지운다. 저장은 10개까지라 지울 자리가 없으면 더 저장할 수 없다.
 */
export function SavedSearches({ saved }: { saved: readonly SavedJobSearch[] }) {
  if (saved.length === 0) return null;
  return (
    <div className={styles.railCard}>
      <div className={styles.railTitle}>저장한 검색 {saved.length}</div>
      <div className={styles.recentList}>
        {saved.map((search) => (
          <SavedSearchRow key={search.id} search={search} />
        ))}
      </div>
    </div>
  );
}

function SavedSearchRow({ search }: { search: SavedJobSearch }) {
  const [state, action, pending] = useActionState(
    async (_previous: DeleteSavedSearchState) => deleteSavedSearchAction(search.id),
    { error: null },
  );
  const enabled = search.conditions.filter((condition) => condition.enabled).length;
  return (
    <div className={styles.savedRow}>
      <Link href={{ pathname: "/jobs", query: savedSearchQuery(search) }} className={styles.recentRow}>
        <Icon name="floppy-disk" size={14} color="var(--ex-fg-muted)" />
        <span className={styles.recentText}>{search.name}</span>
        {enabled > 0 ? <span className={styles.recentCount}>조건 {enabled}</span> : null}
      </Link>
      <form action={action}>
        <button type="submit" className={styles.railHeadAction} disabled={pending} aria-label={`${search.name} 지우기`}>
          {pending ? "지우는 중" : "지우기"}
        </button>
      </form>
      {state.error && !pending ? (
        <p role="status" className={styles.railError}>
          {state.error}
        </p>
      ) : null}
    </div>
  );
}
