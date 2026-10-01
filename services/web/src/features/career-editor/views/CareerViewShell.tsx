"use client";

import type { CareerCategory, CareerPropertyDefinitionV2, CareerRecord, CareerRecordListItem, CareerViewConfiguration, WritableCareerPropertyValue } from "@expresso/contracts";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { DocumentPanel } from "@/app/(app)/career/[categorySlug]/DocumentPanel";
import { Icon } from "@/components/ui/Icon";
import { careerRecordListItem as listItem, useCareerRecordMutations } from "@/features/career-editor/properties/useCareerRecordMutations";

import { BoardView } from "./BoardView";
import { GalleryView } from "./GalleryView";
import { ListView } from "./ListView";
import { QuickFilterBar, type CareerQuickFilter, matchesQuickFilter } from "./QuickFilterBar";
import { TableView } from "./TableView";
import { TimelineView } from "./TimelineView";
import { ViewToolbar } from "./ViewToolbar";
import { displayValue, propertyDefinition, rawValue } from "./view-types";
import styles from "./views.module.css";

export interface CareerViewPage { data: CareerRecord[]; page: { hasNextPage: boolean; nextCursor: string | null } }
export interface CareerViewShellProps { category: CareerCategory; initialView: CareerViewConfiguration; initialPage: CareerViewPage }

const BLURB: Record<string, string> = {
  experience: "대화로 꺼낸 순간들을 문서로 관리합니다. 직접 쓰거나, 바리스타에게 질문을 받아 채울 수 있습니다.",
  project: "무엇을 만들었고 무엇이 달라졌는지. 성과 수치가 비어 있으면 AI가 먼저 물어봅니다.",
  education_history: "학교와 회사를 시간순으로. 각 항목 안에서 무엇을 했는지는 프로젝트·경험과 연결됩니다.",
  certification_award: "발급 기관과 취득일, 증빙까지 한 곳에 둡니다.",
  academic_writing: "논문 · 기술 글 · 발표를 한 곳에. 외부 링크의 조회와 인용은 자동으로 따라옵니다.",
  activity_leadership: "조직에서 맡은 역할과 규모를 남깁니다.",
  skill_tool: "직접 고르지 않아도 됩니다. 기록에 등장한 도구를 세어 자동으로 채웠고, 숙련도는 근거 개수로 계산합니다.",
};
const CATEGORY_ICON: Record<string, string> = { experience: "chat-circle-dots", project: "briefcase", education_history: "graduation-cap", certification_award: "certificate", academic_writing: "article", activity_leadership: "users-three", skill_tool: "code" };

function unwrap(value: unknown): unknown {
  return value && typeof value === "object" && "value" in value ? (value as { value: unknown }).value : value;
}

interface ComparableValue { kind: "decimal" | "text"; value: string }
const plainDecimalPattern = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;

function comparable(value: unknown, number = false): ComparableValue | null {
  const next = unwrap(value);
  if (next === null || next === undefined || next === "") return null;
  const text = typeof next === "object" && "start" in next
    ? String((next as { start: unknown }).start)
    : Array.isArray(next) ? next.map(String).join(" ") : String(next);
  return { kind: number && plainDecimalPattern.test(text) ? "decimal" : "text", value: text.toLocaleLowerCase("ko") };
}

function compareDecimal(left: string, right: string): number {
  const parts = (value: string) => {
    const negative = value.startsWith("-");
    const unsigned = negative ? value.slice(1) : value;
    const [integer = "0", fraction = ""] = unsigned.split(".");
    return { negative, integer: integer.replace(/^0+(?=\d)/, ""), fraction: fraction.replace(/0+$/, "") };
  };
  const leftParts = parts(left);
  const rightParts = parts(right);
  if (leftParts.negative !== rightParts.negative) return leftParts.negative ? -1 : 1;
  const direction = leftParts.negative ? -1 : 1;
  if (leftParts.integer.length !== rightParts.integer.length) return (leftParts.integer.length - rightParts.integer.length) * direction;
  const integerComparison = leftParts.integer.localeCompare(rightParts.integer);
  if (integerComparison) return integerComparison * direction;
  const width = Math.max(leftParts.fraction.length, rightParts.fraction.length);
  return leftParts.fraction.padEnd(width, "0").localeCompare(rightParts.fraction.padEnd(width, "0")) * direction;
}

function compareValues(left: ComparableValue, right: ComparableValue): number {
  if (left.kind === "decimal" && right.kind === "decimal") return compareDecimal(left.value, right.value);
  return left.value.localeCompare(right.value, "ko");
}

function sortedRecords(records: CareerRecordListItem[], view: CareerViewConfiguration, category: CareerCategory): CareerRecordListItem[] {
  if (!view.sorts.length) {
    if (!view.recordOrder.length) return records;
    const rank = new Map(view.recordOrder.map((id, index) => [id, index]));
    return records.map((record, index) => ({ record, index })).sort((left, right) => {
      const leftRank = rank.get(left.record.id);
      const rightRank = rank.get(right.record.id);
      if (leftRank === undefined && rightRank === undefined) return left.index - right.index;
      if (leftRank === undefined) return 1;
      if (rightRank === undefined) return -1;
      return leftRank - rightRank;
    }).map(({ record }) => record);
  }
  return [...records].sort((left, right) => {
    for (const sort of view.sorts) {
      const definition = propertyDefinition(category, sort.propertyId);
      const numeric = definition?.type === "number";
      const leftValue = comparable(definition?.key === "title" ? left.title : definition ? rawValue(left, definition) : null, numeric);
      const rightValue = comparable(definition?.key === "title" ? right.title : definition ? rawValue(right, definition) : null, numeric);
      if (leftValue?.kind === rightValue?.kind && leftValue?.value === rightValue?.value) continue;
      if (leftValue === null) return sort.nulls === "first" ? -1 : 1;
      if (rightValue === null) return sort.nulls === "first" ? 1 : -1;
      const result = compareValues(leftValue, rightValue);
      if (result) return sort.direction === "asc" ? result : -result;
    }
    return 0;
  });
}

function matchesSavedFilter(record: CareerRecordListItem, filter: unknown, category: CareerCategory): boolean {
  if (!filter || typeof filter !== "object") return true;
  if ("filters" in filter && Array.isArray((filter as { filters: unknown[] }).filters)) {
    const group = filter as { operator?: string; filters: unknown[] };
    return group.operator === "or" ? group.filters.some((item) => matchesSavedFilter(record, item, category)) : group.filters.every((item) => matchesSavedFilter(record, item, category));
  }
  if (!("propertyId" in filter) || !("operator" in filter)) return true;
  const leaf = filter as { propertyId: string; operator: string; operand?: unknown };
  const definition = propertyDefinition(category, leaf.propertyId);
  const actual = definition?.key === "title" ? record.title : definition ? rawValue(record, definition) : null;
  const actualLabel = displayValue(actual);
  const operand = comparable(leaf.operand, definition?.type === "number");
  const value = comparable(actual, definition?.type === "number");
  if (leaf.operator === "is_empty") return actualLabel === "—";
  if (leaf.operator === "is_not_empty") return actualLabel !== "—";
  if (leaf.operator === "contains" || leaf.operator === "not_contains") {
    const included = (value?.value ?? "").includes(operand?.value ?? "");
    return leaf.operator === "contains" ? included : !included;
  }
  if (leaf.operator === "eq" || leaf.operator === "neq") {
    const equal = value !== null && operand !== null && compareValues(value, operand) === 0;
    return leaf.operator === "eq" ? equal : !equal;
  }
  if (value === null || operand === null) return false;
  const comparison = compareValues(value, operand);
  if (leaf.operator === "gt") return comparison > 0;
  if (leaf.operator === "gte") return comparison >= 0;
  if (leaf.operator === "lt") return comparison < 0;
  if (leaf.operator === "lte") return comparison <= 0;
  return true;
}

export function CareerViewShell({ category: initialCategory, initialView, initialPage }: CareerViewShellProps) {
  const router = useRouter();
  const [category, setCategory] = useState(initialCategory);
  const [view, setView] = useState(initialView);
  const { records, setRecords, cellIssues, recordsRef, recordQueues, replaceRecords,
    applyPending, commitCell, retryCell, acceptRecord } = useCareerRecordMutations(initialPage.data.map(listItem));
  const [page, setPage] = useState(initialPage.page);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [quickFilter, setQuickFilter] = useState<CareerQuickFilter>("all");
  const visibleRecords = useMemo(() => sortedRecords(records.filter((record) => matchesSavedFilter(record, view.filter, category) && matchesQuickFilter(record, category, quickFilter)), view, category), [category, quickFilter, records, view]);
  const active = records.find((record) => record.id === activeId) ?? null;
  const focusId = activeId && visibleRecords.some((record) => record.id === activeId) ? activeId : visibleRecords[0]?.id ?? null;
  const common = {
    records: visibleRecords,
    view,
    category,
    activeId: focusId,
    openId: activeId,
    selectedIds: selected,
    onActivate: setActiveId,
    onCreate: (initialPropertyValues?: readonly WritableCareerPropertyValue[], options?: { open?: boolean }) =>
      create(initialPropertyValues ? { propertyValues: initialPropertyValues } : {}, options),
    onToggle: (id: string) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }),
    onViewChange: (next: CareerViewConfiguration) => void updateView(next),
    onCellCommit: commitCell,
    onCellRetry: retryCell,
    onDuplicateRecord: duplicateRecord,
    onDeleteRecord: deleteRecord,
    cellIssues,
  };

  async function create(draft: { createMode?: "duplicate"; title?: string; bodyMd?: string; properties?: Record<string, unknown>; propertyValues?: readonly WritableCareerPropertyValue[] } = {}, options: { open?: boolean } = {}): Promise<CareerRecordListItem | null> {
    const body = draft.createMode === "duplicate"
      ? { createMode: "duplicate", categoryId: category.id, title: draft.title ?? "", properties: draft.properties ?? {}, bodyMd: draft.bodyMd ?? "", ...(draft.propertyValues !== undefined ? { propertyValues: draft.propertyValues } : {}) }
      : draft.propertyValues
        ? { categoryId: category.id, propertyValues: draft.propertyValues }
        : { categoryId: category.id, title: draft.title ?? "", properties: draft.properties ?? {}, bodyMd: draft.bodyMd ?? "" };
    const response = await fetch("/api/career/records", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify(body) });
    if (!response.ok) { setMessage("기록을 만들지 못했습니다."); return null; }
    const payload = await response.json() as { data: CareerRecord };
    const item = listItem(payload.data);
    replaceRecords((current) => [item, ...current]);
    if (options.open !== false) setActiveId(item.id);
    return item;
  }

  async function duplicateRecord(recordId: string): Promise<CareerRecordListItem | null> {
    const source = recordsRef.current.find((record) => record.id === recordId);
    if (!source) return null;
    return create({ createMode: "duplicate", title: source.title ? `${source.title} 복제` : "", bodyMd: source.bodyMd, properties: source.properties, ...(source.propertyValues ? { propertyValues: source.propertyValues } : {}) }, { open: false });
  }

  async function deleteRecord(recordId: string): Promise<void> {
    const previous = recordsRef.current;
    const record = previous.find((item) => item.id === recordId);
    if (!record) return;
    replaceRecords((current) => current.filter((record) => record.id !== recordId));
    setSelected((current) => { const next = new Set(current); next.delete(recordId); return next; });
    if (activeId === recordId) setActiveId(null);
    const response = await fetch(`/api/career/records/${recordId}`, {
      method: "DELETE",
      headers: { "if-match": `"v${record.version}"` },
    });
    if (!response.ok) { replaceRecords(() => previous); setMessage("기록을 삭제하지 못했습니다."); }
  }

  async function updateView(next: CareerViewConfiguration, categoryVersion = category.version) {
    const previous = view;
    setView(next);
    const body = { name: next.name, type: next.type, filter: next.filter, sorts: next.sorts, groupPropertyId: next.groupPropertyId, groupOrder: next.groupOrder, recordOrder: next.recordOrder, visiblePropertyIds: next.visiblePropertyIds, propertyOrder: next.propertyOrder, columnWidths: next.columnWidths, gallery: next.gallery, board: next.board, timeline: next.timeline };
    const local = next.id.startsWith("local-");
    const response = await fetch(local ? `/api/career/categories/${category.id}/view-configurations` : `/api/career/view-configurations/${next.id}`, { method: local ? "POST" : "PATCH", headers: { "content-type": "application/json", "if-match": `"v${local ? categoryVersion : previous.version}"` }, body: JSON.stringify(body) });
    if (!response.ok) { setView(previous); setMessage("뷰 변경을 저장하지 못했습니다."); return; }
    const payload = await response.json() as { data: CareerViewConfiguration };
    setView(payload.data);
  }

  async function duplicate() {
    if (view.id.startsWith("local-")) { setMessage("뷰를 먼저 저장해 주세요."); return; }
    const response = await fetch(`/api/career/view-configurations/${view.id}/duplicate`, { method: "POST", headers: { "content-type": "application/json", "if-match": `"v${view.version}"` }, body: JSON.stringify({ name: `${view.name} 복제` }) });
    setMessage(response.ok ? "뷰를 복제했습니다." : "뷰를 복제하지 못했습니다.");
  }

  async function bulkStatus(status: CareerRecord["status"]) {
    await Promise.all(records.filter((item) => selected.has(item.id)).map(async (selectedRecord) => {
      async function save(): Promise<void> {
        async function attempt(base: CareerRecordListItem, retry: boolean): Promise<CareerRecordListItem> {
          const response = await fetch(`/api/career/records/${selectedRecord.id}`, { method: "PATCH", headers: { "content-type": "application/json", "if-match": `"v${base.version}"` }, body: JSON.stringify({ status }) });
          if ((response.status === 409 || response.status === 412) && retry) {
            const latestResponse = await fetch(`/api/career/records/${selectedRecord.id}`);
            if (!latestResponse.ok) throw new Error("최신 기록을 불러오지 못했습니다.");
            const latestPayload = await latestResponse.json() as { data: CareerRecord };
            const latest = listItem(latestPayload.data);
            replaceRecords((current) => current.map((record) => record.id === latest.id ? applyPending(latest) : record));
            return attempt(latest, false);
          }
          if (!response.ok) throw new Error("상태를 저장하지 못했습니다.");
          const payload = await response.json() as { data: CareerRecord };
          replaceRecords((current) => current.map((record) => record.id === selectedRecord.id ? applyPending({ ...record, ...listItem(payload.data) }) : record));
          return listItem(payload.data);
        }
        const current = recordsRef.current.find((record) => record.id === selectedRecord.id);
        if (current) await attempt(current, true);
      }
      const previous = recordQueues.current.get(selectedRecord.id) ?? Promise.resolve();
      const queued = previous.catch(() => undefined).then(save);
      recordQueues.current.set(selectedRecord.id, queued);
      await queued;
    }));
    setSelected(new Set());
  }

  async function more() {
    if (!page.nextCursor || view.id.startsWith("local-")) return;
    const response = await fetch(`/api/career/view-configurations/${view.id}/query?cursor=${encodeURIComponent(page.nextCursor)}&limit=50`);
    if (!response.ok) return;
    const payload = await response.json() as CareerViewPage;
    setRecords((current) => [...current, ...payload.data.map(listItem)]);
    setPage(payload.page);
  }

  const renderer = view.type === "table" ? <TableView {...common} onCategoryChange={(nextCategory, nextView) => { setCategory(nextCategory); if (nextView) void updateView(nextView, nextCategory.version); }} /> : view.type === "list" ? <ListView {...common} /> : view.type === "gallery" ? <GalleryView {...common} /> : view.type === "board" ? <BoardView {...common} /> : <TimelineView {...common} />;

  return <div className={styles.shell}>
    <main className={styles.viewArea}>
      <div className={styles.categoryIntro}><span className={styles.categoryIcon}><Icon name={CATEGORY_ICON[category.key] ?? "file-text"} weight="fill" size={18} /></span><h1>{category.name}</h1><span className={styles.caret} aria-hidden="true" /></div>
      <p className={styles.categoryBlurb}>{BLURB[category.key] ?? "이 카테고리의 기록입니다."}</p>
      <ViewToolbar category={category} view={view} onChange={updateView} onCreate={() => void create()} onDuplicate={duplicate} />
      {records.length ? <QuickFilterBar records={records} category={category} value={quickFilter} onChange={setQuickFilter} /> : null}
      {selected.size ? <div className={styles.bulk} role="toolbar" aria-label="선택한 기록 작업"><span>{selected.size}개 선택</span><button onClick={() => void bulkStatus("draft")}>초안</button><button onClick={() => void bulkStatus("organized")}>정리됨</button><button onClick={() => void bulkStatus("verified")}>검증됨</button></div> : null}
      {message ? <p role="status" className={styles.message}>{message}</p> : null}
      {visibleRecords.length ? renderer : <div className={styles.emptyFilter}><strong>조건에 맞는 기록이 없습니다.</strong><button type="button" onClick={() => setQuickFilter("all")}>전체 기록 보기</button></div>}
      {page.hasNextPage ? <button className={styles.more} onClick={() => void more()}>더 보기</button> : null}
    </main>
    <DocumentPanel record={active} category={category} onClose={() => setActiveId(null)} onRecordCommit={commitCell} onRecordAccepted={acceptRecord} {...(active ? { onExpand: () => router.push(`/career/records/${active.id}` as never) } : {})} />
  </div>;
}
