"use client";

import type { CareerCategory, CareerPropertyDefinitionV2, CareerPropertyValueV2, CareerRecord, CareerRecordListItem, CareerViewConfiguration } from "@expresso/contracts";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DocumentPanel } from "@/app/(app)/career/[categorySlug]/DocumentPanel";
import { Icon } from "@/components/ui/Icon";
import type { AiPromptRequest } from "@/features/career-editor/ai/AiProposalPanel";

import { AiRecordInterview, type AiInterviewResult } from "./AiRecordInterview";
import { BoardView } from "./BoardView";
import { GalleryView } from "./GalleryView";
import { ListView } from "./ListView";
import { QuickFilterBar, type CareerQuickFilter, matchesQuickFilter } from "./QuickFilterBar";
import { TableView } from "./TableView";
import { TimelineView } from "./TimelineView";
import { ViewToolbar } from "./ViewToolbar";
import { displayValue, propertyKey, rawValue } from "./view-types";
import styles from "./views.module.css";

export interface CareerViewPage { data: CareerRecord[]; page: { hasNextPage: boolean; nextCursor: string | null } }
export interface CareerViewShellProps { category: CareerCategory; initialView: CareerViewConfiguration; initialPage: CareerViewPage }

function listItem(record: CareerRecord): CareerRecordListItem {
  return { ...record, categoryKey: "", isEmpty: record.title === "" && record.bodyMd === "" && Object.keys(record.properties).length === 0, periodFrom: null, periodTo: null, linkCount: 0, usedInCount: 0 };
}

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

function comparable(value: unknown): string | number | null {
  const next = unwrap(value);
  if (next === null || next === undefined || next === "") return null;
  if (typeof next === "number") return next;
  if (typeof next === "object" && "start" in next) return String((next as { start: unknown }).start);
  return Array.isArray(next) ? next.map(String).join(" ").toLocaleLowerCase("ko") : String(next).toLocaleLowerCase("ko");
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
      const key = propertyKey(category, sort.propertyId);
      const leftValue = comparable(key === "title" ? left.title : key ? rawValue(left, key) : null);
      const rightValue = comparable(key === "title" ? right.title : key ? rawValue(right, key) : null);
      if (leftValue === rightValue) continue;
      if (leftValue === null) return sort.nulls === "first" ? -1 : 1;
      if (rightValue === null) return sort.nulls === "first" ? 1 : -1;
      const result = typeof leftValue === "number" && typeof rightValue === "number" ? leftValue - rightValue : String(leftValue).localeCompare(String(rightValue), "ko");
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
  const key = propertyKey(category, leaf.propertyId);
  const actual = key === "title" ? record.title : key ? rawValue(record, key) : null;
  const actualLabel = displayValue(actual);
  const operand = comparable(leaf.operand);
  const value = comparable(actual);
  if (leaf.operator === "is_empty") return actualLabel === "—";
  if (leaf.operator === "is_not_empty") return actualLabel !== "—";
  if (leaf.operator === "contains" || leaf.operator === "not_contains") {
    const included = String(value ?? "").includes(String(operand ?? ""));
    return leaf.operator === "contains" ? included : !included;
  }
  if (leaf.operator === "eq" || leaf.operator === "neq") return leaf.operator === "eq" ? value === operand : value !== operand;
  if (value === null || operand === null) return false;
  if (leaf.operator === "gt") return value > operand;
  if (leaf.operator === "gte") return value >= operand;
  if (leaf.operator === "lt") return value < operand;
  if (leaf.operator === "lte") return value <= operand;
  return true;
}

export function CareerViewShell({ category: initialCategory, initialView, initialPage }: CareerViewShellProps) {
  const router = useRouter();
  const [category, setCategory] = useState(initialCategory);
  const [view, setView] = useState(initialView);
  const [records, setRecords] = useState(() => initialPage.data.map(listItem));
  const [page, setPage] = useState(initialPage.page);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [quickFilter, setQuickFilter] = useState<CareerQuickFilter>("all");
  const [interview, setInterview] = useState<{ mode: "create" | "fill"; targetId?: string } | null>(null);
  const [aiRequest, setAiRequest] = useState<AiPromptRequest | null>(null);
  const [cellIssues, setCellIssues] = useState<Map<string, string>>(new Map());
  const recordsRef = useRef(records);
  const recordQueues = useRef(new Map<string, Promise<void>>());
  const pendingCells = useRef(new Map<string, { recordId: string; definition: CareerPropertyDefinitionV2; value: CareerPropertyValueV2 | null; revision: number }>());
  const failedCells = useRef(new Map<string, { recordId: string; definition: CareerPropertyDefinitionV2; value: CareerPropertyValueV2 | null }>());
  const revision = useRef(0);

  useEffect(() => { recordsRef.current = records; }, [records]);

  const replaceRecords = useCallback((updater: (current: CareerRecordListItem[]) => CareerRecordListItem[]) => {
    const next = updater(recordsRef.current);
    recordsRef.current = next;
    setRecords(next);
  }, []);

  function applyCell(record: CareerRecordListItem, definition: CareerPropertyDefinitionV2, value: CareerPropertyValueV2 | null): CareerRecordListItem {
    if (definition.key === "title") return { ...record, title: value?.type === "title" ? value.value : "" };
    const properties = { ...record.properties };
    if (value === null) delete properties[definition.key];
    else properties[definition.key] = value;
    return { ...record, properties };
  }

  function applyPending(record: CareerRecordListItem): CareerRecordListItem {
    let next = record;
    for (const pending of pendingCells.current.values()) if (pending.recordId === record.id) next = applyCell(next, pending.definition, pending.value);
    return next;
  }

  async function saveCell(pending: { recordId: string; definition: CareerPropertyDefinitionV2; value: CareerPropertyValueV2 | null; revision: number }) {
    const key = `${pending.recordId}:${pending.definition.id}`;
    async function attempt(base: CareerRecordListItem, retry: boolean): Promise<CareerRecordListItem> {
      const optimistic = applyPending(base);
      const body = pending.definition.key === "title"
        ? { title: optimistic.title }
        : { properties: optimistic.properties };
      const response = await fetch(`/api/career/records/${pending.recordId}`, { method: "PATCH", headers: { "content-type": "application/json", "if-match": `"v${base.version}"` }, body: JSON.stringify(body) });
      if ((response.status === 409 || response.status === 412) && retry) {
        const latestResponse = await fetch(`/api/career/records/${pending.recordId}`);
        if (!latestResponse.ok) throw new Error("최신 기록을 불러오지 못했습니다.");
        const latestPayload = await latestResponse.json() as { data: CareerRecord };
        return attempt(listItem(latestPayload.data), false);
      }
      if (!response.ok) throw new Error(response.status === 409 || response.status === 412 ? "다른 곳에서 바뀐 값과 충돌했습니다." : "값을 저장하지 못했습니다.");
      const payload = await response.json() as { data: CareerRecord };
      return listItem(payload.data);
    }

    const base = recordsRef.current.find((record) => record.id === pending.recordId);
    if (!base) return;
    try {
      const saved = await attempt(base, true);
      if (pendingCells.current.get(key)?.revision === pending.revision) pendingCells.current.delete(key);
      failedCells.current.delete(key);
      setCellIssues((current) => { if (!current.has(key)) return current; const next = new Map(current); next.delete(key); return next; });
      replaceRecords((current) => current.map((record) => record.id === saved.id ? applyPending({ ...record, ...saved }) : record));
    } catch (error) {
      if (pendingCells.current.get(key)?.revision !== pending.revision) return;
      pendingCells.current.delete(key);
      failedCells.current.set(key, { recordId: pending.recordId, definition: pending.definition, value: pending.value });
      const message = error instanceof Error ? error.message : "값을 저장하지 못했습니다.";
      setCellIssues((current) => new Map(current).set(key, message));
      const latestResponse = await fetch(`/api/career/records/${pending.recordId}`).catch(() => null);
      if (latestResponse?.ok) {
        const latestPayload = await latestResponse.json() as { data: CareerRecord };
        replaceRecords((current) => current.map((record) => record.id === pending.recordId ? applyPending(listItem(latestPayload.data)) : record));
      }
    }
  }

  const commitCell = useCallback(async (recordId: string, definition: CareerPropertyDefinitionV2, value: CareerPropertyValueV2 | null) => {
    const key = `${recordId}:${definition.id}`;
    const pending = { recordId, definition, value, revision: ++revision.current };
    pendingCells.current.set(key, pending);
    failedCells.current.delete(key);
    setCellIssues((current) => { if (!current.has(key)) return current; const next = new Map(current); next.delete(key); return next; });
    replaceRecords((current) => current.map((record) => record.id === recordId ? applyCell(record, definition, value) : record));
    const previous = recordQueues.current.get(recordId) ?? Promise.resolve();
    const queued = previous.catch(() => undefined).then(() => saveCell(pending));
    recordQueues.current.set(recordId, queued);
    await queued;
  }, [replaceRecords]);

  const retryCell = useCallback((recordId: string, propertyId: string) => {
    const failed = failedCells.current.get(`${recordId}:${propertyId}`);
    if (failed) void commitCell(failed.recordId, failed.definition, failed.value);
  }, [commitCell]);

  const visibleRecords = useMemo(() => sortedRecords(records.filter((record) => matchesSavedFilter(record, view.filter, category) && matchesQuickFilter(record, category.key, quickFilter)), view, category), [category, quickFilter, records, view]);
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
    onCreate: (initialProperties?: Record<string, unknown>, options?: { open?: boolean }) => create(initialProperties ? { properties: initialProperties } : {}, options),
    onFillMissing: (recordId: string) => setInterview({ mode: "fill", targetId: recordId }),
    onToggle: (id: string) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }),
    onViewChange: (next: CareerViewConfiguration) => void updateView(next),
    onCellCommit: commitCell,
    onCellRetry: retryCell,
    onDuplicateRecord: duplicateRecord,
    onDeleteRecord: deleteRecord,
    cellIssues,
  };

  async function create(draft: { title?: string; bodyMd?: string; properties?: Record<string, unknown> } = {}, options: { open?: boolean } = {}): Promise<CareerRecordListItem | null> {
    const response = await fetch("/api/career/records", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ categoryId: category.id, title: draft.title ?? "", properties: draft.properties ?? {}, bodyMd: draft.bodyMd ?? "" }) });
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
    return create({ title: source.title ? `${source.title} 복제` : "", bodyMd: source.bodyMd, properties: source.properties }, { open: false });
  }

  async function deleteRecord(recordId: string): Promise<void> {
    const previous = recordsRef.current;
    replaceRecords((current) => current.filter((record) => record.id !== recordId));
    setSelected((current) => { const next = new Set(current); next.delete(recordId); return next; });
    if (activeId === recordId) setActiveId(null);
    const response = await fetch(`/api/career/records/${recordId}`, { method: "DELETE" });
    if (!response.ok) { replaceRecords(() => previous); setMessage("기록을 삭제하지 못했습니다."); }
  }

  async function completeInterview(result: AiInterviewResult) {
    const current = interview;
    setInterview(null);
    if (!current) return;
    if (current.mode === "create") {
      const item = await create({ title: result.title, bodyMd: result.bodyMd });
      if (item) setAiRequest({ id: crypto.randomUUID(), recordId: item.id, prompt: result.prompt, displayPrompt: `인터뷰 답변으로 ${category.name} 기록 정리` });
      return;
    }
    if (!current.targetId) return;
    setActiveId(current.targetId);
    setAiRequest({ id: crypto.randomUUID(), recordId: current.targetId, prompt: result.prompt, displayPrompt: "인터뷰 답변으로 성과 구체화" });
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
    for (const record of records.filter((item) => selected.has(item.id))) {
      const response = await fetch(`/api/career/records/${record.id}`, { method: "PATCH", headers: { "content-type": "application/json", "if-match": `"v${record.version}"` }, body: JSON.stringify({ status }) });
      if (response.ok) { const payload = await response.json() as { data: CareerRecord }; setRecords((current) => current.map((item) => item.id === record.id ? { ...item, ...payload.data } : item)); }
    }
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
      <ViewToolbar category={category} view={view} onChange={updateView} onCreate={() => void create()} onAiCreate={() => setInterview({ mode: "create" })} onDuplicate={duplicate} />
      {records.length ? <QuickFilterBar records={records} categoryKey={category.key} value={quickFilter} onChange={setQuickFilter} /> : null}
      {selected.size ? <div className={styles.bulk} role="toolbar" aria-label="선택한 기록 작업"><span>{selected.size}개 선택</span><button onClick={() => void bulkStatus("draft")}>초안</button><button onClick={() => void bulkStatus("organized")}>정리됨</button><button onClick={() => void bulkStatus("verified")}>검증됨</button></div> : null}
      {message ? <p role="status" className={styles.message}>{message}</p> : null}
      {visibleRecords.length ? renderer : <div className={styles.emptyFilter}><strong>조건에 맞는 기록이 없습니다.</strong><button type="button" onClick={() => setQuickFilter("all")}>전체 기록 보기</button></div>}
      {page.hasNextPage ? <button className={styles.more} onClick={() => void more()}>더 보기</button> : null}
    </main>
    <DocumentPanel record={active} category={category} onClose={() => setActiveId(null)} aiRequest={aiRequest?.recordId === active?.id ? aiRequest : null} onAiRequestHandled={() => setAiRequest(null)} {...(active ? { onExpand: () => router.push(`/career/records/${active.id}` as never) } : {})} />
    {interview ? <AiRecordInterview mode={interview.mode} categoryName={category.name} recordTitle={records.find((record) => record.id === interview.targetId)?.title ?? ""} onCancel={() => setInterview(null)} onComplete={(result) => void completeInterview(result)} /> : null}
  </div>;
}
