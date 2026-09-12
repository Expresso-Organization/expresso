"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from "react";

import { Skel, skelKeys } from "@/components/shell/Skeleton";
import { Icon } from "@/components/ui/Icon";
import { BROWSE_QUERY_PLACEHOLDER } from "@/lib/sample/jobs";

import { searchHref } from "./search-href";
import styles from "./page.module.css";

interface SearchState {
  pending: boolean;
  visible: boolean;
  slow: boolean;
  cancelled: boolean;
  completed: boolean;
  submit: (query: string) => void;
  cancel: () => void;
}
const SearchContext = createContext<SearchState | null>(null);
function useSearch() {
  const context = useContext(SearchContext);
  if (!context) throw new Error("JobSearchFlow is required");
  return context;
}

/** 기존 서버 화면을 유지한 채 같은 /jobs 경로의 검색 전환만 관리합니다. */
export function JobSearchFlow({
  listQuery,
  children,
}: {
  listQuery: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [cancelled, setCancelled] = useState(false);
  const [visible, setVisible] = useState(false);
  const [slow, setSlow] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const pending = isPending && !cancelled;
  useEffect(() => setCancelled(false), [listQuery]);

  useEffect(() => {
    if (!pending) {
      setVisible(false);
      setSlow(false);
      return;
    }
    const appearance = window.setTimeout(() => setVisible(true), 180);
    const delayed = window.setTimeout(() => setSlow(true), 5_000);
    return () => {
      window.clearTimeout(appearance);
      window.clearTimeout(delayed);
    };
  }, [pending, cancelled]);

  function submit(query: string) {
    setHasSearched(true);
    setCancelled(false);
    startTransition(() => {
      const href = searchHref(listQuery, query);
      const current = listQuery ? `/jobs?${listQuery}` : "/jobs";
      if (href === current) router.refresh();
      else router.push(href, { scroll: false });
    });
  }
  function cancel() {
    setCancelled(true);
    setHasSearched(false);
    // 새 탐색으로 대기 중 탐색을 대체해 이전 응답이 화면을 덮지 않게 합니다.
    startTransition(() =>
      router.replace((listQuery ? `/jobs?${listQuery}` : "/jobs") as Route, {
        scroll: false,
      }),
    );
  }

  return (
    <SearchContext.Provider
      value={{
        pending,
        visible,
        slow,
        cancelled,
        completed: hasSearched && !pending && !cancelled,
        submit,
        cancel,
      }}
    >
      <div className={styles.content}>{children}</div>
    </SearchContext.Provider>
  );
}

/** 탐색/검색 화면에 이미 있던 마크업과 CSS를 그대로 사용합니다. */
export function JobSearchInput({
  query = "",
  children,
}: {
  query?: string;
  children?: ReactNode;
}) {
  const { pending, visible, slow, cancelled, submit, cancel } = useSearch();
  const [draft, setDraft] = useState(query);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => setDraft(query), [query]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      cancel();
      return;
    }
    if (draft.trim().length < 2) {
      input.current?.setCustomValidity("검색어를 두 글자 이상 입력해 주세요.");
      input.current?.reportValidity();
      return;
    }
    submit(draft);
  }
  const form = (
    <form
      className={query ? styles.queryRow : styles.searchBar}
      action="/jobs"
      onSubmit={onSubmit}
    >
      <Icon name="sparkle" size={18} color="var(--ex-accent-text)" />
      <input
        ref={input}
        name="q"
        value={draft}
        onChange={(event) => {
          event.currentTarget.setCustomValidity("");
          setDraft(event.target.value);
        }}
        className={query ? styles.queryText : styles.searchInput}
        placeholder={query ? undefined : BROWSE_QUERY_PLACEHOLDER}
        aria-label="공고 검색"
        minLength={2}
        maxLength={200}
        required
        readOnly={pending}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          if (event.nativeEvent.isComposing || event.keyCode === 229) {
            event.preventDefault();
            return;
          }
          if (event.metaKey || event.ctrlKey) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
      />
      {query && !pending ? (
        <Link
          href="/jobs"
          className={styles.queryClear}
          aria-label="검색 초기화"
        >
          <Icon name="x" size={15} />
        </Link>
      ) : !query && !pending ? (
        <span className={styles.searchShortcut}>⌘↵</span>
      ) : null}
      <button
        type="submit"
        className={`${styles.querySubmit} ${pending ? styles.searchStop : ""}`}
      >
        {pending ? (
          <>
            <Icon name="stop" size={12} />
            중지
          </>
        ) : query ? (
          "검색"
        ) : (
          "찾기"
        )}
      </button>
    </form>
  );
  const progress =
    visible || cancelled ? (
      <div className={styles.searchProgress} role="status" aria-live="polite">
        {cancelled ? (
          <Icon name="pause" size={14} />
        ) : (
          <span className={styles.searchSpinner}>
            <Icon name="circle-notch" size={15} />
          </span>
        )}
        <span>
          {cancelled
            ? "검색을 중지했습니다. 조건을 바꿔 다시 검색할 수 있습니다."
            : slow
              ? "검색이 조금 길어지고 있습니다. 계속 찾고 있습니다."
              : "입력한 조건으로 공고를 찾고 있습니다."}
        </span>
      </div>
    ) : null;

  return query ? (
    <div className={styles.queryCard}>
      {form}
      {pending ? progress : children}
      {cancelled ? progress : null}
    </div>
  ) : (
    <div className={styles.searchEntry}>
      {form}
      {progress}
    </div>
  );
}

/** 결과 카드의 크기와 행 컴포넌트를 유지하고 대기하는 동안만 같은 자리에 스켈레톤을 얹습니다. */
export function JobSearchResults({ children }: { children: ReactNode }) {
  const { pending, visible, completed } = useSearch();
  return (
    <div
      className={`${styles.results} ${styles.searchResults} ${completed ? styles.searchArrived : ""}`}
      aria-busy={pending}
    >
      <div
        className={styles.searchExistingResults}
        inert={pending}
        aria-hidden={visible || undefined}
        style={visible ? { visibility: "hidden" } : undefined}
      >
        {children}
      </div>
      {visible ? (
        <div className={styles.searchCover} aria-hidden="true">
          <div className={styles.resultsHead}>
            <span className={styles.resultsCount}>공고 검색 중</span>
            <span className={styles.resultsNote}>
              조건에 맞는 결과를 불러옵니다
            </span>
          </div>
          <div className={styles.rows}>
            {skelKeys(20).map((row) => (
              <div className={styles.row} key={row}>
                <Skel w={30} h={30} radius={8} />
                <span className={styles.rowTitle}>
                  <Skel w={`${72 - (row % 4) * 10}%`} h={13} />
                  <Skel w="54%" h={11} style={{ marginTop: 6 }} />
                </span>
                <Skel w={64} h={11} />
                <Skel w={38} h={13} />
              </div>
            ))}
          </div>
          <div className={styles.resultsFoot}>
            <span className={styles.footText}>
              검색어와 필터는 그대로 유지됩니다
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function JobSearchRail({ children }: { children: ReactNode }) {
  const { pending } = useSearch();
  return (
    <aside
      className={`${styles.rail} ${pending ? styles.searchRailPending : ""}`}
      inert={pending}
    >
      {children}
    </aside>
  );
}

export function JobSearchEmpty() {
  return (
    <div className={styles.searchEmpty}>
      <Icon name="magnifying-glass" size={24} color="var(--ex-fg-subtle)" />
      <h2>조건에 맞는 공고가 없습니다</h2>
      <p>검색어를 짧게 바꾸거나 필터를 줄여 다시 찾아보세요.</p>
      <Link href="/jobs">
        전체 공고 보기 <Icon name="arrow-right" size={12} />
      </Link>
    </div>
  );
}
