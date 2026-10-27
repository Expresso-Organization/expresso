import { notFound } from "next/navigation";

import { career } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

import { CareerBrowser } from "./CareerBrowser";

function editedLabel(updatedAt: string | undefined): string {
  if (!updatedAt) return "아직 편집 없음";
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(updatedAt).getTime()) / 60_000));
  if (minutes < 1) return "방금 편집";
  if (minutes < 60) return `${minutes}분 전 편집`;
  if (minutes < 1_440) return `${Math.floor(minutes / 60)}시간 전 편집`;
  if (minutes < 2_880) return "어제 편집";
  return `${Math.floor(minutes / 1_440)}일 전 편집`;
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

  // 필터 · 정렬 · 검색은 뷰가 화면에서 적용한다. 서버는 최근 편집 순으로 한 쪽씩 준다.
  const [records, savedViews] = await Promise.all([
    career.records(session.accessToken, { categoryId: category.id, sort: "updated_desc", limit: 100 }),
    career.viewConfigurations(session.accessToken, category.id),
  ]);

  return (
    <CareerBrowser
      category={category}
      records={records.data}
      page={records.page}
      views={savedViews.data}
      viewId={typeof query.view === "string" ? query.view : null}
      search={typeof query.q === "string" ? query.q.slice(0, 200) : ""}
      editedLabel={editedLabel(records.data[0]?.updatedAt)}
    />
  );
}
