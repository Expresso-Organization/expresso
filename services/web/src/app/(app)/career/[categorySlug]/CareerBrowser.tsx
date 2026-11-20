"use client";

import type { CareerCategory, CareerRecordListItem, CareerViewConfiguration } from "@expresso/contracts";
import type { Route } from "next";
import { useState } from "react";

import { AppBody, DocumentHeader } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { CareerViewShell } from "@/features/career-editor/views/CareerViewShell";
import { CategoryMenu } from "@/features/career-editor/views/CategoryMenu";
import styles from "@/features/career-editor/views/views.module.css";

export function CareerBrowser({ category, records, page, views, viewId, search, editedLabel }: {
  category: CareerCategory;
  records: readonly CareerRecordListItem[];
  page: { hasNextPage: boolean; nextCursor: string | null };
  views: readonly CareerViewConfiguration[];
  viewId: string | null;
  search: string;
  editedLabel: string;
}) {
  const [trashOpen, setTrashOpen] = useState(false);
  return <>
    <DocumentHeader
      crumbs={[{ label: "내 커리어", href: "/career" as Route }, category.name]}
      actions={<>
        {category.archivedAt !== null ? <span className={styles.archivedBadge}><Icon name="archive" size={11} />보관됨</span> : null}
        <span style={{ fontSize: "var(--ex-text-2xs)", color: "var(--ex-fg-muted)" }}>{editedLabel}</span>
        <CategoryMenu category={category} onOpenTrash={() => setTrashOpen(true)} />
      </>}
    />
    <AppBody>
      <CareerViewShell key={category.id} category={category} initialViews={views} initialViewId={viewId} initialPage={{ data: [...records], page }} initialSearch={search} trashOpen={trashOpen} onTrashClose={() => setTrashOpen(false)} />
    </AppBody>
  </>;
}
