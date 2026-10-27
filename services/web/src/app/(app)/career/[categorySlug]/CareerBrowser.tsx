"use client";

import type { CareerCategory, CareerRecordListItem, CareerViewConfiguration } from "@expresso/contracts";
import type { Route } from "next";
import { useState } from "react";

import { AppBody, DocumentHeader } from "@/components/shell/AppShell";
import { CareerViewShell } from "@/features/career-editor/views/CareerViewShell";
import { CategoryMenu } from "@/features/career-editor/views/CategoryMenu";

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
      crumbs={[{ label: "내 커리어", href: "/career/experience" as Route }, category.name]}
      actions={<>
        <span style={{ fontSize: "12px", color: "var(--ex-fg-muted)" }}>{editedLabel}</span>
        <CategoryMenu categoryName={category.name} onOpenTrash={() => setTrashOpen(true)} />
      </>}
    />
    <AppBody>
      <CareerViewShell key={category.id} category={category} initialViews={views} initialViewId={viewId} initialPage={{ data: [...records], page }} initialSearch={search} trashOpen={trashOpen} onTrashClose={() => setTrashOpen(false)} />
    </AppBody>
  </>;
}
