import type { CareerRecordSort } from "@expresso/contracts";
import { notFound } from "next/navigation";

import { AppBody, DocumentHeader } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { career } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

import { CareerBrowser } from "./CareerBrowser";

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

  return (
    <>
      <DocumentHeader
        crumbs={["내 커리어", category.name]}
        actions={
          <>
            <span style={{ fontSize: "12px", color: "var(--ex-slate-500)" }}>
              기록 {category.recordCount}건
            </span>
            <span style={{ fontSize: "12.5px", color: "var(--ex-slate-700)" }}>
              공유
            </span>
            <Icon
              name="clock-counter-clockwise"
              size={16}
              color="var(--ex-slate-500)"
            />
            <Icon name="dots-three" size={16} color="var(--ex-slate-500)" />
          </>
        }
      />
      <AppBody>
        <CareerBrowser
          category={category}
          records={records.data}
          summary={records.summary}
        />
      </AppBody>
    </>
  );
}
