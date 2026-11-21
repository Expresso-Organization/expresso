"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import { Skel, skelKeys } from "@/components/shell/Skeleton";
import { searchHref } from "./search-href";
import styles from "./page.module.css";

const SearchContext = createContext({ pending: false, visible: false, slow: false });

/** 검색 폼을 클라이언트 탐색에 연결하고 기존 조건과 서버 결과를 유지합니다. */
export function JobSearchFlow({ listQuery, children }: { listQuery: string; children: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [visible, setVisible] = useState(false);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!pending) { setVisible(false); setSlow(false); return; }
    const appearance = window.setTimeout(() => setVisible(true), 180);
    const delayed = window.setTimeout(() => setSlow(true), 5_000);
    return () => { window.clearTimeout(appearance); window.clearTimeout(delayed); };
  }, [pending]);
  function submit(event: FormEvent<HTMLDivElement>) {
    if (!(event.target instanceof HTMLFormElement) || event.target.getAttribute("action") !== "/jobs") return;
    const query = new FormData(event.target).get("q");
    if (typeof query !== "string") return;
    event.preventDefault();
    if (pending) return;
    const href = searchHref(listQuery, query);
    startTransition(() => {
      if (href === (listQuery ? `/jobs?${listQuery}` : "/jobs")) router.refresh();
      else router.push(href, { scroll: false });
    });
  }
  return <SearchContext.Provider value={{ pending, visible, slow }}><div className={styles.content} onSubmitCapture={submit}>{children}</div></SearchContext.Provider>;
}

export function JobSearchProgress() {
  const { visible, slow } = useContext(SearchContext);
  return visible ? <div className={styles.searchProgress} role="status" aria-live="polite"><span className={styles.searchSpinner}><Icon name="circle-notch" size={15} /></span><span>{slow ? "검색이 조금 길어지고 있습니다. 계속 찾고 있습니다." : "입력한 조건으로 공고를 찾고 있습니다."}</span></div> : null;
}

export function JobSearchResults({ children }: { children: ReactNode }) {
  const { pending, visible } = useContext(SearchContext);
  return <div className={`${styles.results} ${styles.searchResults}`} aria-busy={pending}>
    <div className={styles.searchExistingResults} inert={pending} aria-hidden={visible || undefined} style={visible ? { visibility: "hidden" } : undefined}>{children}</div>
    {visible ? <div className={styles.searchCover} aria-hidden="true"><div className={styles.resultsHead}><span className={styles.resultsCount}>공고 검색 중</span></div><div className={styles.rows}>{skelKeys(12).map((row) => <div className={styles.row} key={row}><Skel w={30} h={30} radius={8} /><span className={styles.rowTitle}><Skel w={`${72 - row % 4 * 10}%`} h={13} /><Skel w="54%" h={11} style={{ marginTop: 6 }} /></span><Skel w={64} h={11} /></div>)}</div></div> : null}
  </div>;
}

export function JobSearchEmpty({ clearHref }: { clearHref: import("next").Route }) {
  return <div className={styles.searchEmpty}><Icon name="magnifying-glass" size={24} color="var(--ex-fg-subtle)" /><h2>조건에 맞는 공고가 없습니다</h2><p>검색어를 짧게 바꾸거나 필터를 줄여 다시 찾아보세요.</p><Link href={clearHref}>전체 공고 보기 <Icon name="arrow-right" size={12} /></Link></div>;
}
