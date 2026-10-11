"use client";

import { CareerCategoriesResponseSchema, CareerRecordResponseSchema, CareerRecordSchema, type CareerCategory, type CreateCareerRecord, type CareerPropertyDefinitionV2, type CareerProductPropertyValues, type CareerRecord, type CareerRecordListItem, type CareerViewConfiguration, type CareerWriteOperation } from "@expresso/contracts";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DocumentPanel } from "@/app/(app)/career/[categorySlug]/DocumentPanel";
import { parseCareerRecordWrite, patchCareerRecord, readCareerRecord, RECORD_WRITE_HINT, RECORD_WRITE_PENDING_EVENT, recordWriteScope } from "../write-operations/record-write-client";
import { WriteOperationStatus } from "../write-operations/WriteOperationStatus";
import type { PendingRecordWrite } from "../write-operations/usePendingRecordWrite";
import { clearDurableWriteKeys, durableWriteKey, saveOperation, savedOperation } from "../write-operations/write-operation-client";
import { Icon } from "@/components/ui/Icon";
import { applyCareerCellValue, canonicalPropertyDelta, canonicalReadDefinition, compareDateStrings, compareDecimalStrings, propertyMutationHint, type CareerCellValue } from "../properties/canonical-values";
import { ensureCareerPropertyOption,withCareerPropertyOption } from "../properties/option-registration";
import { PropertyMutationNotice } from "../properties/PropertyMutationNotice";
import { readPropertyMutationJson, resumeCareerPropertyMutation, waitForCareerPropertyMutation } from "../properties/property-mutation-client";
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

interface CellWriteRequest { version: number; patch: unknown }
export interface CareerViewPage { data: CareerRecord[]; page: { hasNextPage: boolean; nextCursor: string | null } }
export interface CareerViewShellProps { category: CareerCategory; initialView: CareerViewConfiguration; initialPage: CareerViewPage; onResumePropertyMutation?(jobId: string): Promise<void>; onEnsureOption?(definition: CareerPropertyDefinitionV2, label: string): Promise<{ id: string; name: string }> }

function listItem(record: CareerRecord): CareerRecordListItem {
  return { ...record, categoryKey: "", isEmpty: record.title === "" && record.bodyMd === "" && (record.propertyValues !== undefined ? record.propertyValues.length === 0 : Object.keys(record.properties).length === 0), periodFrom: null, periodTo: null, linkCount: 0, usedInCount: 0 };
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
      const leftValue = comparable(key === "title" ? left.title : key ? rawValue(left, key, category) : null);
      const rightValue = comparable(key === "title" ? right.title : key ? rawValue(right, key, category) : null);
      if (leftValue === rightValue) continue;
      if (leftValue === null) return sort.nulls === "first" ? -1 : 1;
      if (rightValue === null) return sort.nulls === "first" ? 1 : -1;
      const definition = category.propertySchemaV2?.find((item) => item.id === sort.propertyId);
      const leftType = definition ? canonicalReadDefinition(left, definition).type : undefined;
      const rightType = definition ? canonicalReadDefinition(right, definition).type : undefined;
      const decimal = leftType === "number" && rightType === "number" && (left.propertyValues !== undefined || right.propertyValues !== undefined) && /^-?\d+(?:\.\d+)?$/.test(String(leftValue)) && /^-?\d+(?:\.\d+)?$/.test(String(rightValue));
      const date = ["date", "created_time", "updated_time"].includes(leftType ?? "") && ["date", "created_time", "updated_time"].includes(rightType ?? "") && (left.propertyValues !== undefined || right.propertyValues !== undefined);
      const result = decimal ? compareDecimalStrings(String(leftValue), String(rightValue)) : date ? compareDateStrings(String(leftValue), String(rightValue)) : typeof leftValue === "number" && typeof rightValue === "number" ? leftValue - rightValue : String(leftValue).localeCompare(String(rightValue), "ko");
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
  if(record.pendingRelationPropertyIds?.includes(leaf.propertyId))return false;
  const key = propertyKey(category, leaf.propertyId);
  const actual = key === "title" ? record.title : key ? rawValue(record, key, category) : null;
  const actualLabel = displayValue(actual);
  const operand = comparable(leaf.operand);
  const value = comparable(actual);
  if (leaf.operator === "is_empty") return actualLabel === "—";
  if (leaf.operator === "is_not_empty") return actualLabel !== "—";
  if (leaf.operator === "contains" || leaf.operator === "not_contains") {
    const included = String(value ?? "").includes(String(operand ?? ""));
    return leaf.operator === "contains" ? included : !included;
  }
  const currentDefinition = category.propertySchemaV2?.find((item) => item.id === leaf.propertyId);
  const definition = currentDefinition ? canonicalReadDefinition(record, currentDefinition) : undefined;
  let comparison: number | null = null;
  if (record.propertyValues !== undefined && value !== null && operand !== null) {
    if (definition?.type === "number" && /^-?\d+(?:\.\d+)?$/.test(String(value)) && /^-?\d+(?:\.\d+)?$/.test(String(operand))) comparison = compareDecimalStrings(String(value), String(operand));
    else if (["date", "created_time", "updated_time"].includes(definition?.type ?? "")) comparison = compareDateStrings(String(value), String(operand));
  }
  if (leaf.operator === "eq" || leaf.operator === "neq") {
    const equal = comparison === null ? value === operand : comparison === 0;
    return leaf.operator === "eq" ? equal : !equal;
  }
  if (value === null || operand === null) return false;
  if (leaf.operator === "gt") return comparison === null ? value > operand : comparison > 0;
  if (leaf.operator === "gte") return comparison === null ? value >= operand : comparison >= 0;
  if (leaf.operator === "lt") return comparison === null ? value < operand : comparison < 0;
  if (leaf.operator === "lte") return comparison === null ? value <= operand : comparison <= 0;
  return true;
}

export function CareerViewShell({ category: initialCategory, initialView, initialPage, onEnsureOption, onResumePropertyMutation }: CareerViewShellProps) {
  const router = useRouter();
  const [category, setCategory] = useState(initialCategory);
  useEffect(() => setCategory(initialCategory), [initialCategory]);
  const registerOption = useCallback(async (definition: CareerPropertyDefinitionV2, label: string) => {
    const option = onEnsureOption ? await onEnsureOption(definition,label) : await ensureCareerPropertyOption(initialCategory.id,definition.id,label);
    setCategory(previous => withCareerPropertyOption(previous,definition.id,option));
    return option;
  },[initialCategory.id,onEnsureOption]);
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
  const pendingCells = useRef(new Map<string, { recordId: string; definition: CareerPropertyDefinitionV2; value: CareerCellValue; revision: number; request?: CellWriteRequest }>());
  const failedCells = useRef(new Map<string, { recordId: string; definition: CareerPropertyDefinitionV2; value: CareerCellValue; request?: CellWriteRequest }>());
  const revision = useRef(0);
  const categoryContext = useRef(category.id); categoryContext.current = category.id;
  const mutationPoll = useRef<AbortController | null>(null);
  useEffect(() => () => { mutationPoll.current?.abort(); }, [category.id]);
  const createScope = "career-category:" + category.id + ":create";
  const [pendingCreate, setPendingCreate] = useState<PendingRecordWrite | null>(null);
  const [creating, setCreating] = useState(false);
  const creatingRef = useRef(false);
  const createContinuation = useRef<{ open?: boolean; onCreated?(record: CareerRecordListItem): void; resolve?(record: CareerRecordListItem | null): void } | null>(null);
  const [pendingWrites, setPendingWrites] = useState<Map<string, PendingRecordWrite>>(new Map());
  const [savingRecords, setSavingRecords] = useState<Set<string>>(new Set());
  const savingRecordsRef = useRef(new Set<string>());
  const staleBusinessRecords = useRef(new Set<string>());

  useEffect(() => {
    const operationId = savedOperation(createScope);
    setPendingCreate(operationId ? { operationId } : null);
    createContinuation.current = null;
  }, [createScope]);
  useEffect(() => {
    setPendingWrites(previous => {
      let next = previous;
      for (const record of records) {
        const operationId = savedOperation(recordWriteScope(record.id));
        if (operationId && !previous.has(record.id)) {
          if (next === previous) next = new Map(previous);
          next.set(record.id, { operationId });
        }
      }
      return next;
    });
  }, [records]);
  useEffect(() => {
    const receive = (event: Event) => {
      const detail = (event as CustomEvent<{ recordId: string; operation: CareerWriteOperation }>).detail;
      if (recordsRef.current.some(record => record.id === detail.recordId)) setPendingWrites(previous => new Map(previous).set(detail.recordId, { operationId: detail.operation.operationId, initial: detail.operation }));
    };
    window.addEventListener(RECORD_WRITE_PENDING_EVENT, receive);
    return () => window.removeEventListener(RECORD_WRITE_PENDING_EVENT, receive);
  }, []);

  useEffect(() => { recordsRef.current = records; }, [records]);

  const replaceRecords = useCallback((updater: (current: CareerRecordListItem[]) => CareerRecordListItem[]) => {
    const next = updater(recordsRef.current);
    recordsRef.current = next;
    setRecords(next);
  }, []);

  function applyCell(record: CareerRecordListItem, definition: CareerPropertyDefinitionV2, value: CareerCellValue): CareerRecordListItem {
    return applyCareerCellValue(record, definition, value);
  }
  function applyPending(record: CareerRecordListItem): CareerRecordListItem {
    if (record.pendingPropertyMutation) return record;
    let next = record;
    for (const pending of pendingCells.current.values()) if (pending.recordId === record.id) next = applyCell(next, pending.definition, pending.value);
    return next;
  }

  async function saveCell(pending: { recordId: string; definition: CareerPropertyDefinitionV2; value: CareerCellValue; revision: number; request?: CellWriteRequest }) {
    const key = `${pending.recordId}:${pending.definition.id}`;
    let attemptedRequest: CellWriteRequest | undefined;
    async function attempt(base: CareerRecordListItem): Promise<CareerRecordListItem | null> {
      const hint = propertyMutationHint(base);
      if (hint) throw new Error(hint);
      const optimistic = applyPending(base);
      const body = pending.request?.patch ?? (pending.definition.key === "title" ? { title: optimistic.title }
        : base.propertyValues !== undefined ? { propertyValues: canonicalPropertyDelta(pending.definition, pending.value) } : { properties: optimistic.properties });
      attemptedRequest = { version: pending.request?.version ?? base.version, patch: body };
      const result = await patchCareerRecord(pending.recordId, attemptedRequest.version, attemptedRequest.patch);
      return result.kind === "completed" ? listItem(result.record) : null;
    }
    const base = recordsRef.current.find((record) => record.id === pending.recordId);
    if (!base) return;
    try {
      const saved = await attempt(base);
      if (!saved) return;
      if (pendingCells.current.get(key)?.revision === pending.revision) pendingCells.current.delete(key);
      failedCells.current.delete(key);
      setCellIssues((current) => { if (!current.has(key)) return current; const next = new Map(current); next.delete(key); return next; });
      replaceRecords((current) => current.map((record) => record.id === saved.id ? applyPending({ ...record, ...saved }) : record));
    } catch (error) {
      if (pendingCells.current.get(key)?.revision !== pending.revision) return;
      pendingCells.current.delete(key);
      failedCells.current.set(key, { recordId: pending.recordId, definition: pending.definition, value: pending.value, ...(attemptedRequest ? { request: attemptedRequest } : {}) });
      const message = error instanceof Error ? error.message : "값을 저장하지 못했습니다.";
      setCellIssues((current) => new Map(current).set(key, message));
      const latestResponse = await fetch(`/api/career/records/${pending.recordId}`).catch(() => null);
      if (latestResponse?.ok) {
        const latestPayload = await parseCareerRecordWrite(latestResponse, pending.recordId);
        if (latestPayload.kind === "completed") replaceRecords((current) => current.map((record) => record.id === pending.recordId ? applyPending(listItem(latestPayload.record)) : record));
      }
    }
  }

  const commitCell = useCallback(async (recordId: string, definition: CareerPropertyDefinitionV2, value: CareerCellValue, request?: CellWriteRequest) => {
    const record = recordsRef.current.find((item) => item.id === recordId);
    const hint = record ? propertyMutationHint(record) || (savingRecordsRef.current.has(recordId) || savedOperation(recordWriteScope(recordId)) ? RECORD_WRITE_HINT : null) : null;
    if (hint) { setMessage(hint); return; }
    const key = `${recordId}:${definition.id}`;
    savingRecordsRef.current.add(recordId);
    setSavingRecords(new Set(savingRecordsRef.current));
    const pending = { recordId, definition, value, revision: ++revision.current, ...(request ? { request } : {}) };
    pendingCells.current.set(key, pending);
    failedCells.current.delete(key);
    setCellIssues((current) => { if (!current.has(key)) return current; const next = new Map(current); next.delete(key); return next; });
    replaceRecords((current) => current.map((record) => record.id === recordId ? applyCell(record, definition, value) : record));
    const previous = recordQueues.current.get(recordId) ?? Promise.resolve();
    const queued = previous.catch(() => undefined).then(() => saveCell(pending));
    recordQueues.current.set(recordId, queued);
    try { await queued; } finally { savingRecordsRef.current.delete(recordId); setSavingRecords(new Set(savingRecordsRef.current)); }
  }, [replaceRecords]);

  const retryCell = useCallback((recordId: string, propertyId: string) => {
    const failed = failedCells.current.get(`${recordId}:${propertyId}`);
    if (failed) void commitCell(failed.recordId, failed.definition, failed.value, failed.request);
  }, [commitCell]);

  const visibleRecords = useMemo(() => sortedRecords(records.filter((record) => matchesSavedFilter(record, view.filter, category) && matchesQuickFilter(record, category.key, quickFilter, category)), view, category), [category, quickFilter, records, view]);
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
    onEnsureOption: registerOption,
    onCellRetry: retryCell,
    onDuplicateRecord: duplicateRecord,
    onDeleteRecord: deleteRecord,
    cellIssues,
    pendingBusinessRecordIds: new Set([...pendingWrites.keys(), ...savingRecords]),
  };

  function acceptCreated(record: CareerRecord, options: { open?: boolean; onCreated?(record: CareerRecordListItem): void }) {
    if (record.categoryId !== categoryContext.current) throw new Error("기록 응답이 요청한 카테고리와 일치하지 않습니다.");
    const item = listItem(record);
    replaceRecords(current => [item, ...current.filter(existing => existing.id !== item.id)]);
    if (options.open !== false) setActiveId(item.id);
    options.onCreated?.(item);
    return item;
  }
  async function create(draft: { title?: string; bodyMd?: string; properties?: Record<string, unknown>; propertyValues?: CareerProductPropertyValues; initialRelations?: CreateCareerRecord["initialRelations"] } = {}, options: { open?: boolean; onCreated?(record: CareerRecordListItem): void } = {}): Promise<CareerRecordListItem | null> {
    if (creatingRef.current || savedOperation(createScope)) { setMessage(RECORD_WRITE_HINT); return null; }
    const categoryId = category.id;
    creatingRef.current = true; setCreating(true);
    const body = { categoryId, title: draft.title ?? "", ...(draft.propertyValues !== undefined ? { propertyValues: draft.propertyValues } : { properties: draft.properties ?? {} }), bodyMd: draft.bodyMd ?? "", ...(draft.initialRelations?.length ? { initialRelations: draft.initialRelations } : {}) };
    try {
      const key = await durableWriteKey(createScope, body);
      const response = await fetch("/api/career/records", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": key }, body: JSON.stringify(body) });
      const result = await parseCareerRecordWrite(response);
      if (categoryContext.current !== categoryId) return null;
      if (result.kind !== "completed") {
        saveOperation(createScope, result.operation.operationId);
        setPendingCreate({ operationId: result.operation.operationId, initial: result.operation });
        if (result.kind === "blocked") return null;
        return await new Promise<CareerRecordListItem | null>(resolve => { createContinuation.current = { ...options, resolve }; });
      }
      const item = acceptCreated(result.record, options);
      clearDurableWriteKeys(createScope);
      return item;
    } catch (error) { if (categoryContext.current === categoryId) setMessage(error instanceof Error ? error.message : "기록을 만들지 못했습니다."); return null; }
    finally { creatingRef.current = false; if (categoryContext.current === categoryId) setCreating(false); }
  }
  async function completeCreate(operation: CareerWriteOperation) {
    if (!operation.recordId) throw new Error("완료된 기록을 확인하지 못했습니다.");
    const categoryId = category.id;
    const fresh = await readCareerRecord(operation.recordId);
    if (categoryContext.current !== categoryId) return;
    const continuation = createContinuation.current;
    const item = acceptCreated(fresh, continuation ?? {});
    continuation?.resolve?.(item);
    createContinuation.current = null;
    saveOperation(createScope, null);
    clearDurableWriteKeys(createScope);
    setPendingCreate(null);
  }
  async function refreshBusinessRecord(recordId: string) {
    const categoryId = category.id;
    staleBusinessRecords.current.add(recordId);
    savingRecordsRef.current.add(recordId);
    setSavingRecords(new Set(savingRecordsRef.current));
    try {
      const fresh = await readCareerRecord(recordId);
      if (fresh.categoryId !== categoryId) throw new Error("기록 응답이 요청한 카테고리와 일치하지 않습니다.");
      const categoriesResponse = await fetch("/api/career/categories", { cache: "no-store" });
      if (!categoriesResponse.ok) throw new Error("최신 카테고리를 불러오지 못했습니다.");
      const freshCategory = CareerCategoriesResponseSchema.parse(await categoriesResponse.json()).data.find(item => item.id === categoryId);
      if (!freshCategory) throw new Error("카테고리를 찾을 수 없습니다.");
      if (categoryContext.current !== categoryId) return;
      replaceRecords(current => current.map(record => record.id === recordId && record.version <= fresh.version ? { ...record, ...listItem(fresh), pendingPropertyMutation: fresh.pendingPropertyMutation, pendingRelationPropertyIds: fresh.pendingRelationPropertyIds } : record));
      setCategory(previous => previous.version <= freshCategory.version ? freshCategory : previous);
      staleBusinessRecords.current.delete(recordId);
      setMessage(previous => previous === RECORD_WRITE_HINT ? "" : previous);
    } finally {
      savingRecordsRef.current.delete(recordId);
      setSavingRecords(new Set(savingRecordsRef.current));
    }
  }
  async function completeRecordWrite(recordId: string) {
    const fresh = await readCareerRecord(recordId);
    for (const [key, pending] of pendingCells.current) if (pending.recordId === recordId) pendingCells.current.delete(key);
    for (const [key, pending] of failedCells.current) if (pending.recordId === recordId) failedCells.current.delete(key);
    replaceRecords(current => current.map(record => record.id === recordId ? { ...record, ...listItem(fresh), pendingPropertyMutation: fresh.pendingPropertyMutation, pendingRelationPropertyIds: fresh.pendingRelationPropertyIds } : record));
    saveOperation(recordWriteScope(recordId), null);
    setPendingWrites(previous => { const next = new Map(previous); next.delete(recordId); return next; });
  }
  async function duplicateRecord(recordId: string): Promise<CareerRecordListItem | null> {
    let source = recordsRef.current.find((record) => record.id === recordId);
    if (!source) return null;
    if (savingRecordsRef.current.has(recordId) || savedOperation(recordWriteScope(recordId))) { setMessage(RECORD_WRITE_HINT); return null; }
    if (staleBusinessRecords.current.has(recordId)) {
      try { await refreshBusinessRecord(recordId); }
      catch (error) { setMessage(error instanceof Error ? error.message : "최신 기록을 불러오지 못했습니다."); return null; }
      source = recordsRef.current.find(record => record.id === recordId);
      if (!source || staleBusinessRecords.current.has(recordId)) return null;
    }
    if (source.pendingRelationPropertyIds?.length) {
      setMessage("관계 변경이 완료된 뒤 기록을 복제할 수 있습니다."); return null;
    }
    if (source.pendingPropertyMutation) { setMessage("속성 변경이 완료된 뒤 기록을 복제할 수 있습니다."); return null; }
    const initialRelations = (category.propertySchemaV2 ?? []).filter(definition => definition.deletedAt === null && definition.type === "relation").flatMap(definition => {
      const value = source.properties[definition.key];
      return value && typeof value === "object" && "type" in value && value.type === "relation" && "value" in value && Array.isArray(value.value)
        ? [{ propertyId: definition.id, targetIds: value.value.map(target => target.recordId) }] : [];
    });
    return create({ title: source.title ? source.title + " 복제" : "", bodyMd: source.bodyMd,
      ...(source.propertyValues !== undefined ? { propertyValues: source.propertyValues, initialRelations } : { properties: source.properties }) }, { open: false });
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
      await create({ title: result.title, bodyMd: result.bodyMd }, { onCreated: item => setAiRequest({ id: crypto.randomUUID(), recordId: item.id, prompt: result.prompt, displayPrompt: `인터뷰 답변으로 ${category.name} 기록 정리` }) });
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
    for (const record of records.filter(item => selected.has(item.id))) {
      if (record.pendingPropertyMutation || savingRecordsRef.current.has(record.id) || savedOperation(recordWriteScope(record.id))) continue;
      savingRecordsRef.current.add(record.id); setSavingRecords(new Set(savingRecordsRef.current));
      try {
        const result = await patchCareerRecord(record.id, record.version, { status });
        if (result.kind === "completed") replaceRecords(current => current.map(item => item.id === record.id ? { ...item, ...result.record } : item));
      } catch (error) { setMessage(error instanceof Error ? error.message : "상태를 저장하지 못했습니다."); }
      finally { savingRecordsRef.current.delete(record.id); setSavingRecords(new Set(savingRecordsRef.current)); }
    }
    setSelected(new Set());
  }
  async function observePropertyMutation(jobId: string, resume = false) {
    const categoryId = category.id, controller = new AbortController();
    mutationPoll.current?.abort();
    mutationPoll.current = controller;
    try {
      if (resume) {
        if (onResumePropertyMutation) await onResumePropertyMutation(jobId);
        else await resumeCareerPropertyMutation(jobId, controller.signal);
      }
      if (controller.signal.aborted || categoryContext.current !== categoryId) return;
      const status = await waitForCareerPropertyMutation(jobId, categoryId, { signal: controller.signal, onStatus: result => {
        if (result.status === "completed" || controller.signal.aborted || categoryContext.current !== categoryId) return;
        replaceRecords(current => current.map(record => record.pendingPropertyMutation?.jobId === jobId ? { ...record, pendingPropertyMutation: { ...record.pendingPropertyMutation, status: result.status as "pending" | "running" | "failed", retryable: result.retryable } } : record));
      } });
      const freshCategory = CareerCategoriesResponseSchema.parse(await readPropertyMutationJson("/api/career/categories", controller.signal, "최신 카테고리를 불러오지 못했습니다.")).data.find((item) => item.id === categoryId);
      if (!freshCategory) throw new Error("카테고리를 찾을 수 없습니다.");
      if (controller.signal.aborted || categoryContext.current !== categoryId) return;
      if (view.id.startsWith("local-")) {
        const affected = recordsRef.current.filter((record) => record.pendingPropertyMutation?.jobId === jobId);
        const fresh = await Promise.all(affected.map(async (record) => {
          const result = CareerRecordResponseSchema.parse(await readPropertyMutationJson("/api/career/records/" + record.id, controller.signal, "최신 기록을 불러오지 못했습니다.")).data;
          if (result.id !== record.id || result.categoryId !== categoryId) throw new Error("기록 응답이 요청과 일치하지 않습니다.");
          return listItem(result);
        }));
        if (controller.signal.aborted || categoryContext.current !== categoryId) return;
        replaceRecords((current) => current.map((record) => record.pendingPropertyMutation?.jobId === jobId ? fresh.find((item) => item.id === record.id && record.version <= item.version) ?? record : record));
      } else {
        const result = await readPropertyMutationJson("/api/career/view-configurations/" + view.id + "/query?limit=50", controller.signal, "최신 뷰를 불러오지 못했습니다.") as CareerViewPage;
        if (controller.signal.aborted || categoryContext.current !== categoryId) return;
        replaceRecords(() => result.data.map((record) => listItem(CareerRecordSchema.parse(record))));
        setPage(result.page);
      }
      setCategory(previous => previous.version <= freshCategory.version ? freshCategory : previous);
      if (status.status === "failed") throw new Error("속성 변경이 다시 중단되었습니다. 작업 상태를 확인해 주세요.");
    } catch (error) {
      if (!controller.signal.aborted && categoryContext.current === categoryId) throw error;
    } finally {
      controller.abort();
      if (mutationPoll.current === controller) mutationPoll.current = null;
    }
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
      <ViewToolbar category={category} view={view} createPending={creating || !!pendingCreate} onChange={updateView} onCreate={() => void create()} onAiCreate={() => setInterview({ mode: "create" })} onDuplicate={duplicate} />
      {records.length ? <QuickFilterBar records={records} category={category} categoryKey={category.key} value={quickFilter} onChange={setQuickFilter} /> : null}
      {selected.size ? <div className={styles.bulk} role="toolbar" aria-label="선택한 기록 작업"><span>{selected.size}개 선택</span><button disabled={records.some((record) => selected.has(record.id) && (!!record.pendingPropertyMutation || pendingWrites.has(record.id) || savingRecords.has(record.id)))} onClick={() => void bulkStatus("draft")}>초안</button><button disabled={records.some((record) => selected.has(record.id) && (!!record.pendingPropertyMutation || pendingWrites.has(record.id) || savingRecords.has(record.id)))} onClick={() => void bulkStatus("organized")}>정리됨</button><button disabled={records.some((record) => selected.has(record.id) && (!!record.pendingPropertyMutation || pendingWrites.has(record.id) || savingRecords.has(record.id)))} onClick={() => void bulkStatus("verified")}>검증됨</button></div> : null}
      {[...new Map(records.filter((record) => record.pendingPropertyMutation).map((record) => [record.pendingPropertyMutation!.jobId, record])).values()].map((record) => <PropertyMutationNotice key={record.pendingPropertyMutation!.jobId} record={record} onResumePropertyMutation={jobId => observePropertyMutation(jobId, true)} onCheckPropertyMutation={observePropertyMutation} />)}
      {pendingCreate ? <WriteOperationStatus operationId={pendingCreate.operationId} initial={pendingCreate.initial} scope={createScope} producer="career-product" onCompleted={completeCreate} /> : null}
      {[...pendingWrites].map(([recordId, pending]) => <WriteOperationStatus key={recordId} operationId={pending.operationId} initial={pending.initial} scope={recordWriteScope(recordId)} producer="career-product" recordId={recordId} onCompleted={() => completeRecordWrite(recordId)} />)}
      {message ? <p role="status" className={styles.message}>{message}</p> : null}
      {visibleRecords.length ? renderer : <div className={styles.emptyFilter}><strong>조건에 맞는 기록이 없습니다.</strong><button type="button" onClick={() => setQuickFilter("all")}>전체 기록 보기</button></div>}
      {page.hasNextPage ? <button className={styles.more} onClick={() => void more()}>더 보기</button> : null}
    </main>
    <DocumentPanel onApplied={refreshBusinessRecord} record={active} category={category} onClose={() => setActiveId(null)} aiRequest={aiRequest?.recordId === active?.id ? aiRequest : null} onAiRequestHandled={() => setAiRequest(current => current?.id === aiRequest?.id ? null : current)} {...(active ? { onExpand: () => router.push(`/career/records/${active.id}` as never) } : {})} />
    {interview ? <AiRecordInterview mode={interview.mode} categoryName={category.name} recordTitle={records.find((record) => record.id === interview.targetId)?.title ?? ""} onCancel={() => setInterview(null)} onComplete={(result) => void completeInterview(result)} /> : null}
  </div>;
}
