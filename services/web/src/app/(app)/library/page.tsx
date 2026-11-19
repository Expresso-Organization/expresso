import type { CareerCategory } from "@expresso/contracts";
import type { Route } from "next";
import Link from "next/link";

import { AppBody, AppHeader } from "@/components/shell/AppShell";
import { SearchAndNotifications } from "@/components/shell/HeaderActions";
import { SidebarCategories } from "@/components/shell/SidebarCategories";
import { Icon } from "@/components/ui/Icon";
import { requireSession } from "@/lib/require-session";

import { PendingPane, PortfoliosPane, RecordsPane, portfolioCount } from "./LibraryPanes";
import {
  KIND_ICON,
  KIND_LABEL,
  readSelection,
  selectionHref,
  type LibraryKind,
  type LibrarySelection,
} from "./library-model";
import styles from "./library.module.css";

/**
 * 라이브러리 — 내가 만든 것(포트폴리오 · 커리어 기록 · 준비 계획 · 파일)을 한곳에서 본다.
 *
 * 왼쪽 목록에서 고르고 오른쪽에서 본다. 커리어 기록의 분류는 목록 안에 한 칸 들여 놓는다.
 * 열면 포트폴리오가 먼저 보인다.
 */
export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const session = await requireSession();
  const categories = session.categories.filter((category) => category.archivedAt === null);
  const selection = readSelection(typeof query.s === "string" ? query.s : undefined, session.categories) ?? { kind: "portfolios" as const };
  const counts: Counts = {
    portfolios: await portfolioCount(session.accessToken),
    records: categories.reduce((sum, category) => sum + category.recordCount, 0),
  };

  return (
    <>
      <AppHeader title="라이브러리" actions={<SearchAndNotifications />} />
      <AppBody>
        <div className={styles.split}>
          <LibraryList categories={session.categories} selection={selection} counts={counts} />
          <div className={styles.pane}>
            {selection.kind === "portfolios" ? (
              <div className={styles.paneScroll}><PortfoliosPane accessToken={session.accessToken} /></div>
            ) : selection.kind === "records" ? (
              <RecordsPane accessToken={session.accessToken} category={selection.category} />
            ) : (
              <PendingPane kind={selection.kind} />
            )}
          </div>
        </div>
      </AppBody>
    </>
  );
}

type Counts = { portfolios: number; records: number };

/** 왼쪽 목록. 커리어 기록의 분류는 그 아래로 한 칸 들여 놓는다. */
function LibraryList({
  categories,
  selection,
  counts,
}: {
  categories: readonly CareerCategory[];
  selection: LibrarySelection;
  counts: Counts;
}) {
  const kind = (key: LibraryKind, count?: number) => (
    <Link
      href={selectionHref(key) as unknown as Route}
      className={styles.listRow}
      aria-current={selection.kind === key && key !== "records" ? "page" : undefined}
    >
      <Icon name={KIND_ICON[key]} weight={selection.kind === key ? "fill" : "regular"} size={15} />
      <span className={styles.listName}>{KIND_LABEL[key]}</span>
      {count === undefined ? null : <span className={styles.listCount}>{count}</span>}
    </Link>
  );
  return (
    <nav className={styles.list} aria-label="라이브러리 항목">
      {kind("portfolios", counts.portfolios)}
      {kind("records", counts.records)}
      <div className={styles.listNested}>
        <SidebarCategories
          categories={categories}
          hrefBase="/library?s="
          activeKey={selection.kind === "records" ? selection.category.key : null}
          heading={false}
        />
      </div>
      {kind("plans")}
      {kind("files")}
    </nav>
  );
}
