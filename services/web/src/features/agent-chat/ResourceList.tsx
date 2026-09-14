"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { CareerRecordListResponseSchema, JobPostingListResponseSchema, PortfolioListResponseSchema } from "@expresso/contracts";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { GlideMenu } from "@/components/ui/GlideMenu";
import sidebar from "@/components/shell/Sidebar.module.css";
import styles from "./AgentChat.module.css";

export type ResourceKind = "records" | "jobs" | "portfolios";
type ListItem = { id: string; title: string; description: string; href: string };
const labels = { records: "커리어 기록", jobs: "채용 공고", portfolios: "내 포트폴리오" };
const icons = { records: "notebook", jobs: "target", portfolios: "browsers" };
export function ResourceList({ kind, chatId }: { kind: ResourceKind; chatId: string | null }) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ListItem[]>([]);
  const [page, setPage] = useState<string | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true); setError(false);
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ limit: "20" });
      if (query.trim()) params.set("q", query.trim());
      if (page) params.set(kind === "jobs" ? "page" : "cursor", page);
      if (kind === "jobs") params.set("sort", "recent");
      void (async () => {
        try {
          const response = await fetch(`/api/agent/resources/${kind}?${params}`, { signal: abort.signal, cache: "no-store" });
          if (!response.ok) throw new Error("목록 조회 실패");
          const payload: unknown = await response.json();
          let rows: ListItem[]; let nextPage: string | null;
          if (kind === "records") {
            const result = CareerRecordListResponseSchema.parse(payload);
            rows = result.data.map(item => ({ id: item.id, title: item.title || "제목 없는 기록", description: new Date(item.updatedAt).toLocaleDateString("ko-KR"), href: `/career/records/${item.id}` }));
            nextPage = result.page.hasNextPage ? result.page.nextCursor : null;
          } else if (kind === "jobs") {
            const result = JobPostingListResponseSchema.parse(payload);
            rows = result.data.map(item => ({ id: item.id, title: item.title, description: [item.company.name, item.location].filter(Boolean).join(" · "), href: `/jobs/${item.id}` }));
            nextPage = result.page.hasNextPage ? String(result.page.page + 1) : null;
          } else {
            const result = PortfolioListResponseSchema.parse(payload);
            rows = result.data.map(item => ({ id: item.id, title: item.title, description: ({ draft: "초안", published: "공개", unlisted: "비공개" })[item.status], href: `/edit/${item.id}` }));
            nextPage = result.page.hasNextPage ? result.page.nextCursor : null;
          }
          if (abort.signal.aborted) return;
          setItems(previous => page ? [...previous, ...rows.filter(row => !previous.some(item => item.id === row.id))] : rows);
          setNext(nextPage);
        } catch { if (!abort.signal.aborted) setError(true); }
        finally { if (!abort.signal.aborted) setLoading(false); }
      })();
    }, query ? 250 : 0);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [kind, query, page, retry]);
  return <div className={styles.resourceList}>
    <h2>{labels[kind]}</h2>
    {kind !== "portfolios" ? <div className={styles.search}><Icon name="magnifying-glass" size={16} /><input type="search" aria-label={`${labels[kind]} 검색`} placeholder={`${labels[kind]} 검색`} maxLength={200} value={query} onChange={event => { setQuery(event.target.value); setPage(null); setItems([]); setNext(null); }} /></div> : null}
    <nav className={styles.resourceResults} aria-label={`${labels[kind]} 목록`} aria-busy={loading}>
      <GlideMenu className={sidebar.navGroup}>{items.map(item => <Link data-row title={item.title} className={`${sidebar.row} ${sidebar.portfolioItem} ${styles.sidebarResult}`} key={item.id} href={`${item.href}${kind !== "portfolios" && chatId ? `?chat=${encodeURIComponent(chatId)}` : ""}` as never}><Icon name={icons[kind]} size={16} /><span><strong>{item.title}</strong><small>{item.description}</small></span><Icon name="arrow-up-right" size={13} /></Link>)}</GlideMenu>
      {loading ? <div role="status" aria-label="목록 불러오는 중"><Skeleton className={styles.listSkeleton} /><Skeleton className={styles.listSkeleton} /></div> : null}
      {error ? <div role="alert" className={styles.listNotice}><p>목록을 불러오지 못했습니다.</p><Button variant="outline" onClick={() => setRetry(value => value + 1)}>다시 시도</Button></div> : null}
      {!loading && !error && !items.length ? <p className={styles.noResults}>{query.trim() ? "검색 결과가 없습니다." : `${labels[kind]} 목록이 비어 있습니다.`}</p> : null}
      {!loading && !error && next ? <Button variant="ghost" onClick={() => setPage(next)}>더 보기</Button> : null}
    </nav>
  </div>;
}
