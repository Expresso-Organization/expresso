"use client";

import type { CareerCategory, CareerPropertyDefinitionV2, CareerPropertyValueV2, CareerRecord, CareerRecordListItem, CareerRecordStatus, CareerViewConfiguration } from "@expresso/contracts";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DocumentPanel } from "@/app/(app)/career/[categorySlug]/DocumentPanel";
import { Icon } from "@/components/ui/Icon";
import type { AiPromptRequest } from "@/features/career-editor/ai/AiProposalPanel";
import { CAREER_CATEGORY_ICONS } from "@/lib/career-category-icons";

import { AiRecordInterview, type AiInterviewResult } from "./AiRecordInterview";
import { BoardView } from "./BoardView";
import { GalleryView } from "./GalleryView";
import { ListView } from "./ListView";
import { QuickFilterBar, type CareerQuickFilter, matchesQuickFilter } from "./QuickFilterBar";
import { TableView } from "./TableView";
import { TimelineView } from "./TimelineView";
import { TrashDialog } from "./TrashDialog";
import { ViewToolbar } from "./ViewToolbar";
import { STATUS_LABELS, VIEW_TYPE_LABELS, activeDefinitions, availableViewTypes, defaultViewDraft, isLocalView, localDefaultViews, matchesFilter, matchesSearch, sortRecords, uniqueViewName, viewBody, withType, type CareerViewType, type ViewDraft } from "./view-logic";
import styles from "./views.module.css";

export interface CareerViewPage { data: CareerRecord[]; page: { hasNextPage: boolean; nextCursor: string | null } }
export interface CareerViewShellProps {
  category: CareerCategory;
  /** 카테고리의 저장 뷰 전체. 비어 있으면 화면 정의서의 기본 탭을 저장하지 않은 뷰로 보인다. */
  initialViews: readonly CareerViewConfiguration[];
  initialViewId?: string | null | undefined;
  initialPage: CareerViewPage;
  initialSearch?: string | undefined;
  trashOpen?: boolean | undefined;
  onTrashClose?: (() => void) | undefined;
}

const PAGE_SIZE = 100;

/** 목록 전용 칸은 기록 응답에 없다. 이미 가진 값은 덮지 않는다. */
function listItem(record: CareerRecord | CareerRecordListItem): CareerRecordListItem {
  return { categoryKey: "", isEmpty: record.title === "" && record.bodyMd === "" && Object.keys(record.properties).length === 0, periodFrom: null, periodTo: null, linkCount: 0, usedInCount: 0, ...record };
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

type Notice = { text: string; action?: { label: string; run(): void } };

export function CareerViewShell({ category: initialCategory, initialViews, initialViewId, initialPage, initialSearch = "", trashOpen = false, onTrashClose }: CareerViewShellProps) {
  const router = useRouter();
  const [category, setCategory] = useState(initialCategory);
  const [views, setViews] = useState<CareerViewConfiguration[]>(() => initialViews.length ? [...initialViews].sort((left, right) => left.order - right.order) : localDefaultViews(initialCategory));
  const [activeViewId, setActiveViewId] = useState(() => views.some((view) => view.id === initialViewId) ? initialViewId! : views[0]!.id);
  const [records, setRecords] = useState(() => initialPage.data.map(listItem));
  const [page, setPage] = useState(initialPage.page);
  const [search, setSearch] = useState(initialSearch);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<Notice | null>(null);
  const [quickFilter, setQuickFilter] = useState<CareerQuickFilter>("all");
  const [interview, setInterview] = useState<{ mode: "create" | "fill"; targetId?: string } | null>(null);
  const [aiRequest, setAiRequest] = useState<AiPromptRequest | null>(null);
  const [cellIssues, setCellIssues] = useState<Map<string, string>>(new Map());
  const recordsRef = useRef(records);
  const viewsRef = useRef(views);
  const categoryRef = useRef(category);
  const recordQueues = useRef(new Map<string, Promise<void>>());
  const pendingCells = useRef(new Map<string, { recordId: string; definition: CareerPropertyDefinitionV2; value: CareerPropertyValueV2 | null; revision: number }>());
  const failedCells = useRef(new Map<string, { recordId: string; definition: CareerPropertyDefinitionV2; value: CareerPropertyValueV2 | null }>());
  const revision = useRef(0);
  const viewSaves = useRef(new Map<string, { inFlight: boolean; next: CareerViewConfiguration | null }>());
  const materializing = useRef<Promise<void> | null>(null);
  const localIds = useRef(new Map<string, string>());

  const activeViewIdRef = useRef(activeViewId);
  useEffect(() => { recordsRef.current = records; }, [records]);
  useEffect(() => { activeViewIdRef.current = activeViewId; }, [activeViewId]);
  const view = views.find((item) => item.id === activeViewId) ?? views[0]!;

  // 새로고침해도 같은 탭 · 같은 검색어로 열리게 주소에 남긴다.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (isLocalView(view)) url.searchParams.delete("view"); else url.searchParams.set("view", view.id);
    if (search) url.searchParams.set("q", search); else url.searchParams.delete("q");
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url);
  }, [search, view]);

  const replaceRecords = useCallback((updater: (current: CareerRecordListItem[]) => CareerRecordListItem[]) => {
    const next = updater(recordsRef.current);
    recordsRef.current = next;
    setRecords(next);
  }, []);

  const replaceViews = useCallback((updater: (current: CareerViewConfiguration[]) => CareerViewConfiguration[]) => {
    const next = updater(viewsRef.current);
    viewsRef.current = next;
    setViews(next);
  }, []);

  const replaceCategory = useCallback((next: CareerCategory) => {
    categoryRef.current = next;
    setCategory(next);
  }, []);

  const mergeRecord = useCallback((saved: CareerRecord) => {
    replaceRecords((current) => current.map((record) => record.id === saved.id && saved.version >= record.version ? { ...record, ...saved } : record));
  }, [replaceRecords]);

  // ── 기록 칸 저장 ──────────────────────────────────────────────────

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

  async function latestRecord(recordId: string): Promise<CareerRecord | null> {
    const response = await fetch(`/api/career/records/${recordId}`).catch(() => null);
    if (!response?.ok) return null;
    return (await response.json() as { data: CareerRecord }).data;
  }

  /** 같은 기록의 저장은 차례로 보낸다. 버전이 어긋나면 최신 기록을 읽어 한 번 더 보낸다. */
  function enqueue(recordId: string, task: () => Promise<void>): Promise<void> {
    const previous = recordQueues.current.get(recordId) ?? Promise.resolve();
    const queued = previous.catch(() => undefined).then(task);
    recordQueues.current.set(recordId, queued);
    return queued;
  }

  async function patchRecord(recordId: string, body: (base: CareerRecordListItem) => Record<string, unknown>): Promise<CareerRecord> {
    async function attempt(base: CareerRecordListItem, retry: boolean): Promise<CareerRecord> {
      const response = await fetch(`/api/career/records/${recordId}`, { method: "PATCH", headers: { "content-type": "application/json", "if-match": `"v${base.version}"` }, body: JSON.stringify(body(base)) });
      if ((response.status === 409 || response.status === 412) && retry) {
        const latest = await latestRecord(recordId);
        if (!latest) throw new Error("최신 기록을 불러오지 못했습니다.");
        return attempt({ ...base, ...latest }, false);
      }
      if (!response.ok) throw new Error(response.status === 409 || response.status === 412 ? "다른 곳에서 바뀐 값과 충돌했습니다." : "값을 저장하지 못했습니다.");
      return (await response.json() as { data: CareerRecord }).data;
    }
    const base = recordsRef.current.find((record) => record.id === recordId);
    if (!base) throw new Error("기록을 찾지 못했습니다.");
    return attempt(base, true);
  }

  async function saveCell(pending: { recordId: string; definition: CareerPropertyDefinitionV2; value: CareerPropertyValueV2 | null; revision: number }) {
    const key = `${pending.recordId}:${pending.definition.id}`;
    try {
      const saved = await patchRecord(pending.recordId, (base) => { const optimistic = applyPending(base); return pending.definition.key === "title" ? { title: optimistic.title } : { properties: optimistic.properties }; });
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
      const latest = await latestRecord(pending.recordId);
      if (latest) replaceRecords((current) => current.map((record) => record.id === pending.recordId ? applyPending({ ...record, ...latest }) : record));
    }
  }

  const commitCell = useCallback(async (recordId: string, definition: CareerPropertyDefinitionV2, value: CareerPropertyValueV2 | null) => {
    const key = `${recordId}:${definition.id}`;
    const pending = { recordId, definition, value, revision: ++revision.current };
    pendingCells.current.set(key, pending);
    failedCells.current.delete(key);
    setCellIssues((current) => { if (!current.has(key)) return current; const next = new Map(current); next.delete(key); return next; });
    replaceRecords((current) => current.map((record) => record.id === recordId ? applyCell(record, definition, value) : record));
    await enqueue(recordId, () => saveCell(pending));
  }, [replaceRecords]);

  const retryCell = useCallback((recordId: string, propertyId: string) => {
    const failed = failedCells.current.get(`${recordId}:${propertyId}`);
    if (failed) void commitCell(failed.recordId, failed.definition, failed.value);
  }, [commitCell]);

  async function changeStatus(recordId: string, status: CareerRecordStatus): Promise<void> {
    const previous = recordsRef.current.find((record) => record.id === recordId)?.status;
    if (!previous || previous === status) return;
    replaceRecords((current) => current.map((record) => record.id === recordId ? { ...record, status } : record));
    await enqueue(recordId, async () => {
      try {
        const saved = await patchRecord(recordId, () => ({ status }));
        replaceRecords((current) => current.map((record) => record.id === saved.id ? { ...record, ...saved } : record));
      } catch {
        replaceRecords((current) => current.map((record) => record.id === recordId ? { ...record, status: previous } : record));
        setNotice({ text: "상태를 바꾸지 못했습니다." });
      }
    });
  }

  // ── 뷰 저장 ───────────────────────────────────────────────────────

  async function refreshCategoryVersion(): Promise<number> {
    const response = await fetch("/api/career/categories").catch(() => null);
    if (!response?.ok) return categoryRef.current.version;
    const latest = (await response.json() as { data: CareerCategory[] }).data.find((item) => item.id === categoryRef.current.id);
    if (latest) replaceCategory({ ...categoryRef.current, version: latest.version, propertySchemaV2: latest.propertySchemaV2 });
    return latest?.version ?? categoryRef.current.version;
  }

  /** 카테고리 버전 조건으로 뷰를 만든다. 다른 곳에서 카테고리가 바뀌었으면 버전을 다시 읽고 한 번 더 보낸다. */
  async function postView(draft: ViewDraft): Promise<CareerViewConfiguration | null> {
    const send = (version: number) => fetch(`/api/career/categories/${categoryRef.current.id}/view-configurations`, { method: "POST", headers: { "content-type": "application/json", "if-match": `"v${version}"` }, body: JSON.stringify(viewBody(draft)) });
    let response = await send(categoryRef.current.version);
    if (response.status === 412) response = await send(await refreshCategoryVersion());
    if (!response.ok) { setNotice({ text: response.status === 409 ? "뷰는 카테고리마다 20개까지 만들 수 있습니다." : "뷰를 저장하지 못했습니다." }); return null; }
    return (await response.json() as { data: CareerViewConfiguration }).data;
  }

  /** 저장하지 않은 기본 탭을 차례대로 저장하고 로컬 ID를 서버 ID로 바꾼다. */
  function materialize(): Promise<void> {
    if (materializing.current) return materializing.current;
    if (!viewsRef.current.some(isLocalView)) return Promise.resolve();
    materializing.current = (async () => {
      for (const local of viewsRef.current.filter(isLocalView)) {
        const body = viewBody(local);
        const created = await postView(body);
        if (!created) return;
        const latest = viewsRef.current.find((item) => item.id === local.id);
        const merged = latest ? { ...latest, id: created.id, version: created.version, order: created.order, createdAt: created.createdAt, updatedAt: created.updatedAt } : created;
        localIds.current.set(local.id, created.id);
        replaceViews((current) => current.map((item) => item.id === local.id ? merged : item));
        setActiveViewId((current) => current === local.id ? created.id : current);
        if (latest && JSON.stringify(viewBody(latest)) !== JSON.stringify(body)) void queueSave(merged);
      }
    })().finally(() => { materializing.current = null; });
    return materializing.current;
  }

  const serverId = (id: string) => localIds.current.get(id) ?? id;

  /** 같은 뷰의 변경은 차례로 보낸다. 입력 중에 쌓인 변경은 마지막 것만 보낸다. */
  async function queueSave(next: CareerViewConfiguration): Promise<void> {
    const state = viewSaves.current.get(next.id) ?? { inFlight: false, next: null };
    state.next = next;
    viewSaves.current.set(next.id, state);
    if (state.inFlight) return;
    state.inFlight = true;
    try {
      while (state.next) {
        const current = state.next;
        state.next = null;
        const version = viewsRef.current.find((item) => item.id === current.id)?.version ?? current.version;
        const response = await fetch(`/api/career/view-configurations/${current.id}`, { method: "PATCH", headers: { "content-type": "application/json", "if-match": `"v${version}"` }, body: JSON.stringify(viewBody(current)) });
        if (!response.ok) {
          await reloadViews();
          setNotice({ text: response.status === 412 ? "다른 곳에서 바뀐 뷰를 불러왔습니다." : "뷰 변경을 저장하지 못했습니다." });
          state.next = null;
          return;
        }
        const saved = (await response.json() as { data: CareerViewConfiguration }).data;
        replaceViews((items) => items.map((item) => item.id === saved.id ? { ...item, version: saved.version, updatedAt: saved.updatedAt } : item));
      }
    } finally {
      state.inFlight = false;
    }
  }

  async function reloadViews() {
    const response = await fetch(`/api/career/categories/${categoryRef.current.id}/view-configurations`).catch(() => null);
    if (!response?.ok) return;
    const saved = (await response.json() as { data: CareerViewConfiguration[] }).data;
    if (!saved.length) return;
    replaceViews(() => saved);
    setActiveViewId((current) => saved.some((item) => item.id === current) ? current : saved[0]!.id);
  }

  /** 화면에 먼저 반영하고 저장한다. 버전은 이미 받은 값을 지킨다. */
  const updateView = useCallback((next: CareerViewConfiguration) => {
    const current = viewsRef.current.find((item) => item.id === next.id);
    if (!current) return;
    const merged = { ...next, version: current.version, updatedAt: current.updatedAt };
    replaceViews((items) => items.map((item) => item.id === next.id ? merged : item));
    if (isLocalView(merged)) void materialize();
    else void queueSave(merged);
  }, [replaceViews]);

  async function createView(type: CareerViewType) {
    await materialize();
    const draft = defaultViewDraft(categoryRef.current, type, uniqueViewName(VIEW_TYPE_LABELS[type], viewsRef.current));
    const created = await postView(draft);
    if (!created) return;
    replaceViews((items) => [...items, created]);
    setActiveViewId(created.id);
  }

  async function duplicateView(id: string) {
    await materialize();
    const source = viewsRef.current.find((item) => item.id === serverId(id));
    if (!source) return;
    const response = await fetch(`/api/career/view-configurations/${source.id}/duplicate`, { method: "POST", headers: { "content-type": "application/json", "if-match": `"v${source.version}"` }, body: JSON.stringify({ name: uniqueViewName(`${source.name} 복제`, viewsRef.current).slice(0, 120) }) });
    if (!response.ok) { setNotice({ text: response.status === 409 ? "뷰는 카테고리마다 20개까지 만들 수 있습니다." : "뷰를 복제하지 못했습니다." }); return; }
    const created = (await response.json() as { data: CareerViewConfiguration }).data;
    replaceViews((items) => [...items, created]);
    setActiveViewId(created.id);
  }

  async function deleteView(id: string) {
    if (viewsRef.current.length <= 1) return;
    await materialize();
    const target = viewsRef.current.find((item) => item.id === serverId(id));
    if (!target || isLocalView(target)) return;
    const index = viewsRef.current.findIndex((item) => item.id === target.id);
    const response = await fetch(`/api/career/view-configurations/${target.id}`, { method: "DELETE", headers: { "if-match": `"v${target.version}"` } });
    if (!response.ok) { setNotice({ text: "뷰를 삭제하지 못했습니다." }); await reloadViews(); return; }
    replaceViews((items) => items.filter((item) => item.id !== target.id).map((item, order) => ({ ...item, order })));
    setActiveViewId((current) => current === target.id ? (viewsRef.current[Math.max(0, index - 1)]?.id ?? viewsRef.current[0]!.id) : current);
  }

  /** 순서를 바꾸면 서버가 모든 뷰와 카테고리의 버전을 올린다. */
  async function reorderViews(ids: string[]) {
    const byId = new Map(viewsRef.current.map((item) => [item.id, item]));
    replaceViews(() => ids.flatMap((id, order) => { const item = byId.get(id); return item ? [{ ...item, order }] : []; }));
    await materialize();
    const orderedIds = ids.map(serverId);
    const send = (version: number) => fetch(`/api/career/categories/${categoryRef.current.id}/view-configurations/reorder`, { method: "POST", headers: { "content-type": "application/json", "if-match": `"v${version}"` }, body: JSON.stringify({ orderedIds }) });
    let response = await send(categoryRef.current.version);
    if (response.status === 412) response = await send(await refreshCategoryVersion());
    if (!response.ok) { setNotice({ text: "뷰 순서를 바꾸지 못했습니다." }); await reloadViews(); return; }
    const saved = (await response.json() as { data: CareerViewConfiguration[] }).data;
    replaceViews((items) => saved.map((item) => { const local = items.find((entry) => entry.id === item.id); return local ? { ...local, version: item.version, order: item.order, updatedAt: item.updatedAt } : item; }));
    replaceCategory({ ...categoryRef.current, version: categoryRef.current.version + 1 });
  }

  // ── 기록 ──────────────────────────────────────────────────────────

  async function create(draft: { title?: string; bodyMd?: string; properties?: Record<string, unknown> } = {}, options: { open?: boolean } = {}): Promise<CareerRecordListItem | null> {
    const response = await fetch("/api/career/records", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ categoryId: category.id, title: draft.title ?? "", properties: draft.properties ?? {}, bodyMd: draft.bodyMd ?? "" }) });
    if (!response.ok) { setNotice({ text: "기록을 만들지 못했습니다." }); return null; }
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

  async function restoreRecord(recordId: string) {
    const response = await fetch(`/api/career/records/${recordId}/restore`, { method: "POST" });
    if (!response.ok) { setNotice({ text: "기록을 되돌리지 못했습니다." }); return; }
    addRestored((await response.json() as { data: CareerRecord }).data);
  }

  function addRestored(record: CareerRecord) {
    replaceRecords((current) => [listItem(record), ...current.filter((item) => item.id !== record.id)]);
    setNotice(null);
  }

  async function deleteRecord(recordId: string): Promise<void> {
    const previous = recordsRef.current;
    replaceRecords((current) => current.filter((record) => record.id !== recordId));
    setSelected((current) => { const next = new Set(current); next.delete(recordId); return next; });
    if (activeId === recordId) setActiveId(null);
    const response = await fetch(`/api/career/records/${recordId}`, { method: "DELETE" });
    if (!response.ok) { replaceRecords(() => previous); setNotice({ text: "기록을 삭제하지 못했습니다." }); return; }
    setNotice({ text: "휴지통으로 옮겼습니다.", action: { label: "되돌리기", run: () => void restoreRecord(recordId) } });
  }

  async function bulkStatus(status: CareerRecordStatus) {
    const ids = [...selected];
    setSelected(new Set());
    await Promise.all(ids.map((id) => changeStatus(id, status)));
  }

  async function more() {
    if (!page.nextCursor) return;
    const query = new URLSearchParams({ categoryId: category.id, sort: "updated_desc", limit: String(PAGE_SIZE), cursor: page.nextCursor });
    const response = await fetch(`/api/career/records?${query}`);
    if (!response.ok) { setNotice({ text: "기록을 더 불러오지 못했습니다." }); return; }
    const payload = await response.json() as { data: CareerRecordListItem[]; page: CareerViewPage["page"] };
    replaceRecords((current) => { const known = new Set(current.map((record) => record.id)); return [...current, ...payload.data.filter((record) => !known.has(record.id)).map(listItem)]; });
    setPage(payload.page);
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

  /** 패널이나 표 머리에서 속성을 만들면 카테고리를 바꾸고, 새 속성을 지금 뷰의 표시 속성 끝에 붙인다. */
  const changeCategory = useCallback((next: CareerCategory, nextView?: CareerViewConfiguration) => {
    const known = new Set(categoryRef.current.propertySchemaV2.map((item) => item.id));
    replaceCategory(next);
    const added = activeDefinitions(next).filter((item) => !known.has(item.id)).map((item) => item.id);
    const base = nextView ?? viewsRef.current.find((item) => item.id === activeViewIdRef.current);
    if (!base) return;
    if (nextView || added.length) {
      updateView({ ...base, visiblePropertyIds: [...new Set([...base.visiblePropertyIds, ...added])], propertyOrder: [...new Set([...base.propertyOrder, ...added])] });
    }
  }, [replaceCategory, updateView]);
  const visibleRecords = useMemo(() => sortRecords(records.filter((record) => matchesFilter(record, view.filter, category) && matchesQuickFilter(record, category.key, quickFilter) && matchesSearch(record, search)), view, category), [category, quickFilter, records, search, view]);
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
    onViewChange: updateView,
    onCellCommit: commitCell,
    onCellRetry: retryCell,
    onStatusChange: changeStatus,
    onDuplicateRecord: duplicateRecord,
    onDeleteRecord: deleteRecord,
    cellIssues,
  };

  const renderer = view.type === "table" ? <TableView {...common} onCategoryChange={changeCategory} /> : view.type === "list" ? <ListView {...common} /> : view.type === "gallery" ? <GalleryView {...common} /> : view.type === "board" ? <BoardView {...common} /> : <TimelineView {...common} />;
  const filtered = view.filter !== null || quickFilter !== "all" || search !== "";
  const empty = records.length === 0 && !page.hasNextPage;

  return <div className={styles.shell}>
    <main className={styles.viewArea}>
      <div className={styles.categoryIntro}><span className={styles.categoryIcon}><Icon name={CAREER_CATEGORY_ICONS[category.key] ?? "file-text"} weight="fill" size={18} /></span><h1>{category.name}</h1></div>
      <p className={styles.categoryBlurb}>{BLURB[category.key] ?? "이 카테고리의 기록입니다."}</p>
      <ViewToolbar
        category={category}
        view={view}
        views={views}
        records={records}
        types={availableViewTypes(category)}
        search={search}
        onSearch={setSearch}
        onChange={updateView}
        onCreateRecord={() => void create()}
        onAiCreate={() => setInterview({ mode: "create" })}
        onSelect={setActiveViewId}
        onCreate={(type) => void createView(type)}
        onRename={(id, name) => { const target = viewsRef.current.find((item) => item.id === id); if (target) updateView({ ...target, name }); }}
        onType={(id, type) => { const target = viewsRef.current.find((item) => item.id === id); if (target) updateView(withType(target, type, categoryRef.current)); }}
        onDuplicate={(id) => void duplicateView(id)}
        onDelete={(id) => void deleteView(id)}
        onReorder={(ids) => void reorderViews(ids)}
      />
      {records.length ? <QuickFilterBar records={records} categoryKey={category.key} value={quickFilter} onChange={setQuickFilter} /> : null}
      {selected.size ? <div className={styles.bulk} role="toolbar" aria-label="선택한 기록 작업"><span>{selected.size}개 선택</span>{(["draft", "organized", "verified"] as const).map((status) => <button key={status} onClick={() => void bulkStatus(status)}>{STATUS_LABELS[status]}</button>)}</div> : null}
      {notice ? <p role="status" className={styles.message}>{notice.text}{notice.action ? <button type="button" onClick={() => { notice.action!.run(); setNotice(null); }}>{notice.action.label}</button> : null}</p> : null}
      {empty
        ? <div className={styles.firstRecord}>
          <span className={styles.firstRecordIcon}><Icon name={CAREER_CATEGORY_ICONS[category.key] ?? "file-text"} weight="fill" size={26} /></span>
          <div className={styles.createSplit}>
            <button type="button" onClick={() => void create()}><Icon name="plus" size={13} />새로 만들기</button>
            <button type="button" onClick={() => setInterview({ mode: "create" })}><Icon name="coffee" size={13} />AI로 만들기</button>
          </div>
        </div>
        : visibleRecords.length || !filtered ? renderer
          : <div className={styles.emptyFilter}>
            <strong>조건에 맞는 기록이 없습니다.</strong>
            <div>
              {search ? <button type="button" onClick={() => setSearch("")}>검색어 지우기</button> : null}
              {quickFilter !== "all" ? <button type="button" onClick={() => setQuickFilter("all")}>빠른 필터 해제</button> : null}
              {view.filter !== null ? <button type="button" onClick={() => updateView({ ...view, filter: null })}>필터 지우기</button> : null}
            </div>
          </div>}
      {page.hasNextPage ? <button className={styles.more} onClick={() => void more()}>더 보기</button> : null}
    </main>
    <DocumentPanel record={active} category={category} onClose={() => setActiveId(null)} aiRequest={aiRequest?.recordId === active?.id ? aiRequest : null} onAiRequestHandled={() => setAiRequest(null)} onRecordChange={mergeRecord} onCategoryChange={changeCategory} {...(active ? { onExpand: () => router.push(`/career/records/${active.id}` as never) } : {})} />
    {interview ? <AiRecordInterview mode={interview.mode} categoryName={category.name} recordTitle={records.find((record) => record.id === interview.targetId)?.title ?? ""} onCancel={() => setInterview(null)} onComplete={(result) => void completeInterview(result)} /> : null}
    <TrashDialog open={trashOpen} categoryId={category.id} categoryName={category.name} onClose={() => onTrashClose?.()} onRestored={addRestored} />
  </div>;
}
