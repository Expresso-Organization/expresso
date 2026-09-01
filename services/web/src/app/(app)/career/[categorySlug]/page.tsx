import type { CareerCategory, CareerRecordSort, CareerViewConfiguration } from "@expresso/contracts";
import type { Route } from "next";
import { notFound } from "next/navigation";

import { AppBody, DocumentHeader } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { career } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

import { CareerBrowser } from "./CareerBrowser";
import { LegacyCareerBrowser } from "./LegacyCareerBrowser";
import { careerEditorV2Enabled } from "@/features/career-editor/feature-flag";

const SORTS: Record<string, CareerRecordSort> = {
  updated_desc: "updated_desc",
  updated_asc: "updated_asc",
  title_asc: "title_asc",
  period_desc: "period_desc",
  period_asc: "period_asc",
};

/** §6.3 뷰에 맞는 기본 정렬 — 타임라인은 기간 순이다. */
function defaultSortFor(view: string): CareerRecordSort {
  return view === "timeline" ? "period_desc" : "updated_desc";
}
function editedLabel(updatedAt: string | undefined): string {
  if (!updatedAt) return "아직 편집 없음";
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(updatedAt).getTime()) / 60_000));
  if (minutes < 1) return "방금 편집";
  if (minutes < 60) return `${minutes}분 전 편집`;
  if (minutes < 1_440) return `${Math.floor(minutes / 60)}시간 전 편집`;
  if (minutes < 2_880) return "어제 편집";
  return `${Math.floor(minutes / 1_440)}일 전 편집`;
}

function fallbackView(category: CareerCategory): CareerViewConfiguration {
  const definitions = category.propertySchemaV2 ?? Object.entries(category.propertySchema).flatMap(([key, item], order) => item.id ? [{ id: item.id, key, name: item.label, type: item.type === "tags" ? "multi_select" as const : item.type === "boolean" ? "checkbox" as const : item.type, required: item.required, system: item.system, config: {}, order, version: 1, deletedAt: null }] : []);
  const date = definitions.find((item) => item.type === "date");
  const type = category.defaultView === "timeline" && !date ? "table" : category.defaultView;
  const now = new Date().toISOString();
  return { id: `local-${category.id}`, categoryId: category.id, name: "기본 뷰", type, version: 1, order: 0, filter: null, sorts: [], groupPropertyId: null, groupOrder: [], visiblePropertyIds: definitions.map((item) => item.id), propertyOrder: definitions.map((item) => item.id), columnWidths: {}, gallery: type === "gallery" ? { coverPropertyId: null, previewPropertyIds: definitions.slice(0, 3).map((item) => item.id) } : null, board: type === "board" ? { hiddenGroupIds: [], cardOrder: {} } : null, timeline: type === "timeline" && date ? { startPropertyId: date.id, endPropertyId: null, axisStart: null, axisEnd: null } : null, createdAt: now, updatedAt: now };
}

export default async function CareerCategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ categorySlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { categorySlug } = await params;
  const query = await searchParams;
  const session = await requireSession();

  const category = session.categories.find((item) => item.key === categorySlug);
  if (!category) notFound();

  const sortParam = typeof query.sort === "string" ? SORTS[query.sort] : undefined;
  const sort = sortParam ?? defaultSortFor(category.defaultView);
  const search = typeof query.q === "string" ? query.q : undefined;

  const records = await career.records(session.accessToken, {
    categoryId: category.id,
    sort,
    ...(search ? { q: search } : {}),
    limit: 50,
  });
  const v2Enabled = careerEditorV2Enabled();
  const savedViews = v2Enabled ? await career.viewConfigurations(session.accessToken, category.id) : null;

  return (
    <>
      <DocumentHeader
        crumbs={[{ label: "내 커리어", href: "/career/experience" as Route }, category.name]}
        actions={
          <>
            <span style={{ fontSize: "12px", color: "var(--ex-fg-muted)" }}>{v2Enabled ? editedLabel(records.data[0]?.updatedAt) : `기록 ${category.recordCount}건`}</span>
            <span style={{ fontSize: "12.5px", color: "var(--ex-fg-body)" }}>
              공유
            </span>
            <Icon
              name="clock-counter-clockwise"
              size={16}
              color="var(--ex-fg-muted)"
            />
            <Icon name="dots-three" size={16} color="var(--ex-fg-muted)" />
          </>
        }
      />
      <AppBody>
        {v2Enabled ? <CareerBrowser category={category} records={records.data} initialView={savedViews?.data[0] ?? fallbackView(category)} /> : <LegacyCareerBrowser category={category} records={records.data} summary={records.summary} />}
      </AppBody>
    </>
  );
}
