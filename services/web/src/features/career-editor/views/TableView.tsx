"use client";

import type { CareerCategory, CareerPropertyDefinitionV2, CareerRecord, CareerViewConfiguration } from "@expresso/contracts";
import { createPortal } from "react-dom";
import type { CSSProperties, DragEvent as ReactDragEvent, KeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Icon } from "@/components/ui/Icon";
import { propertyOptions } from "@/features/career-editor/properties/property-editors";

import { CareerTableCell, type TableCellValue } from "./CareerTableCell";
import { PropertyHeaderMenu } from "./PropertyHeaderMenu";
import type { CareerViewRendererProps } from "./view-types";
import { displayValue, keyboardActivate, propertyKey, propertyName, rawValue } from "./view-types";
import styles from "./views.module.css";

const SELECT_WIDTH = 96;
const TITLE_WIDTH = 260;
const PROPERTY_WIDTH = 160;
const ROW_HEIGHT = 42;
const WINDOW_ROWS = 22;
const OVERSCAN = 5;
const EMPTY_GROUP = "__empty__";

interface TableGroup { key: string; label: string; records: CareerRecord[]; empty: boolean; optionOrder: number }
type DropPlacement = "before" | "after";
interface ActiveCell { recordId: string; propertyId: string; instanceKey: string }
interface CellMenu extends ActiveCell { x: number; y: number }

function orderedPropertyIds(props: CareerViewRendererProps): string[] {
  const visible = new Set(props.view.visiblePropertyIds);
  return [...props.view.propertyOrder, ...props.view.visiblePropertyIds]
    .filter((id, index, all) => visible.has(id) && all.indexOf(id) === index)
    .filter((id) => propertyKey(props.category, id) !== "title");
}

function propertyWidth(view: CareerViewConfiguration, propertyId: string | null, fallback: number): number {
  if (!propertyId) return fallback;
  return view.columnWidths[propertyId] ?? fallback;
}

function groupedRecords(records: readonly CareerRecord[], category: CareerCategory, propertyId: string, groupOrder: readonly string[]): TableGroup[] {
  const definition = category.propertySchemaV2?.find((item) => item.id === propertyId && item.deletedAt === null);
  const key = propertyKey(category, propertyId);
  if (!key) return [];
  const options = definition ? propertyOptions(definition) : [];
  const optionLabels = new Map(options.map((option) => [option.id, option.name]));
  const optionOrder = new Map(options.map((option, index) => [option.id, index]));
  const groups = new Map<string, TableGroup>();
  const emptyLabel = `${definition?.name ?? "속성"} 없음`;
  const add = (groupKey: string, label: string, record: CareerRecord, empty = false) => {
    const group = groups.get(groupKey) ?? { key: groupKey, label, records: [], empty, optionOrder: empty ? -1 : optionOrder.get(groupKey) ?? Number.MAX_SAFE_INTEGER };
    group.records.push(record);
    groups.set(groupKey, group);
  };

  for (const record of records) {
    const raw = key === "title" ? record.title : rawValue(record, key);
    if (Array.isArray(raw)) {
      const values = [...new Set(raw.flatMap((item) => typeof item === "string" || typeof item === "number" ? [String(item)] : item && typeof item === "object" && "id" in item ? [String(item.id)] : []))];
      if (!values.length) add(EMPTY_GROUP, emptyLabel, record, true);
      else for (const value of values) add(value, optionLabels.get(value) ?? value, record);
      continue;
    }
    if (raw === null || raw === undefined || raw === "") { add(EMPTY_GROUP, emptyLabel, record, true); continue; }
    const value = String(raw);
    add(value, optionLabels.get(value) ?? displayValue(raw), record);
  }

  return [...groups.values()].sort((left, right) => {
    const leftManual = groupOrder.findIndex((item) => item === left.key || item === left.label);
    const rightManual = groupOrder.findIndex((item) => item === right.key || item === right.label);
    if (leftManual >= 0 || rightManual >= 0) return (leftManual < 0 ? Number.MAX_SAFE_INTEGER : leftManual) - (rightManual < 0 ? Number.MAX_SAFE_INTEGER : rightManual);
    if (left.optionOrder !== right.optionOrder) return left.optionOrder - right.optionOrder;
    return left.label.localeCompare(right.label, "ko");
  });
}

export function TableView(props: CareerViewRendererProps & { onCategoryChange(nextCategory: CareerCategory, nextView?: CareerViewConfiguration): void }) {
  const columns = useMemo(() => orderedPropertyIds(props), [props.category, props.view.propertyOrder, props.view.visiblePropertyIds]);
  const definitionsById = useMemo(() => new Map((props.category.propertySchemaV2 ?? []).filter((definition) => definition.deletedAt === null).map((definition) => [definition.id, definition])), [props.category.propertySchemaV2]);
  const titleId = props.category.propertySchemaV2?.find((definition) => definition.key === "title" && definition.deletedAt === null)?.id ?? props.view.visiblePropertyIds.find((id) => propertyKey(props.category, id) === "title") ?? null;
  const titleColumnId = titleId ?? props.category.id;
  const titleDefinition = useMemo<CareerPropertyDefinitionV2>(() => props.category.propertySchemaV2?.find((definition) => definition.id === titleId) ?? { id: titleColumnId, key: "title", name: "제목", type: "title", required: true, system: true, config: {}, order: 0, version: 1, deletedAt: null }, [props.category.propertySchemaV2, titleColumnId, titleId]);
  const [previewWidths, setPreviewWidths] = useState<Record<string, number>>(props.view.columnWidths);
  const [scrollTop, setScrollTop] = useState(0);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [rowDrag, setRowDrag] = useState<{ sourceId: string; targetId: string | null; placement: DropPlacement }>({ sourceId: "", targetId: null, placement: "before" });
  const [columnDrag, setColumnDrag] = useState<{ sourceId: string; targetId: string | null; placement: DropPlacement }>({ sourceId: "", targetId: null, placement: "before" });
  const [activeCell, setActiveCell] = useState<ActiveCell | null>(null);
  const [editingCell, setEditingCell] = useState<ActiveCell | null>(null);
  const [cellMenu, setCellMenu] = useState<CellMenu | null>(null);
  const drag = useRef<{ propertyId: string; width: number } | null>(null);
  const suppressColumnClick = useRef(false);
  const resizeCleanup = useRef<(() => void) | null>(null);
  const cellRefs = useRef(new Map<string, HTMLElement>());
  const groupDefinition = props.view.groupPropertyId ? definitionsById.get(props.view.groupPropertyId) : undefined;
  const groups = useMemo(() => props.view.groupPropertyId ? groupedRecords(props.records, props.category, props.view.groupPropertyId, props.view.groupOrder) : [], [props.category, props.records, props.view.groupOrder, props.view.groupPropertyId]);

  useEffect(() => setPreviewWidths(props.view.columnWidths), [props.view.columnWidths]);
  useEffect(() => setCollapsedGroups(new Set()), [props.view.groupPropertyId]);
  useEffect(() => () => resizeCleanup.current?.(), []);
  useEffect(() => {
    if (!activeCell) return;
    if (editingCell?.recordId === activeCell.recordId && editingCell.propertyId === activeCell.propertyId && editingCell.instanceKey === activeCell.instanceKey) return;
    cellRefs.current.get(`${activeCell.instanceKey}:${cellKey(activeCell.recordId, activeCell.propertyId)}`)?.focus();
  }, [activeCell, editingCell, props.records]);
  useEffect(() => {
    if (!cellMenu) return;
    const close = (event?: Event) => { if (event?.target instanceof Element && event.target.closest("[data-cell-context-menu]")) return; setCellMenu(null); };
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    document.addEventListener("pointerdown", close);
    return () => { window.removeEventListener("resize", close); window.removeEventListener("scroll", close, true); document.removeEventListener("pointerdown", close); };
  }, [cellMenu]);

  const width = (propertyId: string | null, fallback: number) => propertyId ? previewWidths[propertyId] ?? propertyWidth(props.view, propertyId, fallback) : fallback;
  const template = `${SELECT_WIDTH}px ${width(titleColumnId, TITLE_WIDTH)}px ${columns.map((id) => `${width(id, PROPERTY_WIDTH)}px`).join(" ")}`;
  const totalWidth = SELECT_WIDTH + width(titleColumnId, TITLE_WIDTH) + columns.reduce((total, id) => total + width(id, PROPERTY_WIDTH), 0);
  const windowed = props.records.length > WINDOW_ROWS + OVERSCAN * 2;
  const start = windowed ? Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN) : 0;
  const end = windowed ? Math.min(props.records.length, start + WINDOW_ROWS + OVERSCAN * 2) : props.records.length;
  const rows = props.records.slice(start, end);

  const cellKey = (recordId: string, propertyId: string) => `${recordId}:${propertyId}`;
  const propertyIds = [titleColumnId, ...columns];

  function focusCell(recordId: string, propertyId: string, edit = false, instanceKey = "main") {
    const next = { recordId, propertyId, instanceKey };
    setActiveCell(next);
    setEditingCell(edit ? next : null);
    queueMicrotask(() => cellRefs.current.get(`${instanceKey}:${cellKey(recordId, propertyId)}`)?.focus());
  }

  function moveCell(recordId: string, propertyId: string, direction: "left" | "right" | "up" | "down" | "next" | "previous", instanceKey: string, keyboardRecords: readonly CareerRecord[]) {
    const rowIndex = keyboardRecords.findIndex((record) => record.id === recordId);
    const columnIndex = propertyIds.indexOf(propertyId);
    if (rowIndex < 0 || columnIndex < 0) return;
    let nextRow = rowIndex;
    let nextColumn = columnIndex;
    if (direction === "left") nextColumn--;
    if (direction === "right") nextColumn++;
    if (direction === "up") nextRow--;
    if (direction === "down") nextRow++;
    if (direction === "next") { nextColumn++; if (nextColumn >= propertyIds.length) { nextColumn = 0; nextRow++; } }
    if (direction === "previous") { nextColumn--; if (nextColumn < 0) { nextColumn = propertyIds.length - 1; nextRow--; } }
    nextRow = Math.max(0, Math.min(keyboardRecords.length - 1, nextRow));
    nextColumn = Math.max(0, Math.min(propertyIds.length - 1, nextColumn));
    focusCell(keyboardRecords[nextRow]?.id ?? recordId, propertyIds[nextColumn] ?? propertyId, false, instanceKey);
  }

  async function createAndFocus(initialProperties?: Record<string, unknown>, instanceKey = "main") {
    const created = await props.onCreate(initialProperties, { open: false });
    if (created) focusCell(created.id, titleColumnId, true, instanceKey);
  }

  function showCellMenu(event: ReactMouseEvent<HTMLElement>, recordId: string, propertyId: string, instanceKey: string) {
    event.preventDefault();
    event.stopPropagation();
    focusCell(recordId, propertyId, false, instanceKey);
    setCellMenu({ recordId, propertyId, instanceKey, x: event.clientX, y: event.clientY });
  }

  function commitWidth(propertyId: string, nextWidth: number) {
    const clamped = Math.max(80, Math.min(720, Math.round(nextWidth)));
    setPreviewWidths((current) => ({ ...current, [propertyId]: clamped }));
    props.onViewChange({ ...props.view, columnWidths: { ...props.view.columnWidths, [propertyId]: clamped } });
  }

  function startResize(event: ReactPointerEvent<HTMLDivElement>, propertyId: string, currentWidth: number) {
    if (event.button !== 0) return;
    event.preventDefault();
    resizeCleanup.current?.();
    const startX = event.clientX;
    drag.current = { propertyId, width: currentWidth };
    const previousCursor = window.document.body.style.cursor;
    const previousUserSelect = window.document.body.style.userSelect;
    window.document.body.style.cursor = "col-resize";
    window.document.body.style.userSelect = "none";
    const move = (pointerEvent: PointerEvent) => {
      if (!drag.current) return;
      const next = Math.max(80, Math.min(720, currentWidth + pointerEvent.clientX - startX));
      drag.current.width = next;
      setPreviewWidths((current) => ({ ...current, [propertyId]: next }));
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      window.document.body.style.cursor = previousCursor;
      window.document.body.style.userSelect = previousUserSelect;
      resizeCleanup.current = null;
    };
    const finish = () => {
      const latest = drag.current?.width ?? currentWidth;
      drag.current = null;
      cleanup();
      commitWidth(propertyId, latest);
    };
    resizeCleanup.current = cleanup;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", finish, { once: true });
  }

  function resizeFromKeyboard(event: KeyboardEvent<HTMLDivElement>, propertyId: string, currentWidth: number) {
    const next = event.key === "ArrowLeft" ? currentWidth - 16 : event.key === "ArrowRight" ? currentWidth + 16 : event.key === "Home" ? 80 : event.key === "End" ? 720 : null;
    if (next === null) return;
    event.preventDefault();
    commitWidth(propertyId, next);
  }

  function commitRecordOrder(sourceId: string, targetId: string, placement: DropPlacement) {
    if (sourceId === targetId) return;
    const reordered = props.records.map((record) => record.id);
    const sourceIndex = reordered.indexOf(sourceId);
    const targetIndex = reordered.indexOf(targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    reordered.splice(sourceIndex, 1);
    const nextTargetIndex = reordered.indexOf(targetId);
    reordered.splice(nextTargetIndex + (placement === "after" ? 1 : 0), 0, sourceId);

    const visibleIds = new Set(reordered);
    let visibleIndex = 0;
    const merged = props.view.recordOrder.map((id) => visibleIds.has(id) ? reordered[visibleIndex++]! : id);
    merged.push(...reordered.slice(visibleIndex));
    props.onViewChange({ ...props.view, sorts: [], recordOrder: [...new Set(merged)] });
  }

  function moveRecordFromKeyboard(event: KeyboardEvent<HTMLButtonElement>, recordId: string) {
    event.stopPropagation();
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const index = props.records.findIndex((record) => record.id === recordId);
    const target = props.records[index + (event.key === "ArrowUp" ? -1 : 1)];
    if (target) commitRecordOrder(recordId, target.id, event.key === "ArrowUp" ? "before" : "after");
  }

  function startRecordDrag(event: ReactDragEvent<HTMLButtonElement>, recordId: string) {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", recordId);
    setRowDrag({ sourceId: recordId, targetId: null, placement: "before" });
  }

  function setRecordDropTarget(event: ReactDragEvent<HTMLDivElement>, recordId: string) {
    if (!rowDrag.sourceId || rowDrag.sourceId === recordId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const rect = event.currentTarget.getBoundingClientRect();
    const placement = event.clientY >= rect.top + rect.height / 2 ? "after" : "before";
    if (rowDrag.targetId !== recordId || rowDrag.placement !== placement) setRowDrag((current) => ({ ...current, targetId: recordId, placement }));
  }

  function finishRecordDrop(event: ReactDragEvent<HTMLDivElement>, recordId: string) {
    if (!rowDrag.sourceId || rowDrag.sourceId === recordId) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const placement = event.clientY >= rect.top + rect.height / 2 ? "after" : "before";
    commitRecordOrder(rowDrag.sourceId, recordId, placement);
    setRowDrag({ sourceId: "", targetId: null, placement: "before" });
  }

  function commitColumnOrder(sourceId: string, targetId: string, placement: DropPlacement) {
    if (sourceId === targetId) return;
    const reordered = [...columns];
    const sourceIndex = reordered.indexOf(sourceId);
    const targetIndex = reordered.indexOf(targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    reordered.splice(sourceIndex, 1);
    const nextTargetIndex = reordered.indexOf(targetId);
    reordered.splice(nextTargetIndex + (placement === "after" ? 1 : 0), 0, sourceId);

    const visibleIds = new Set(reordered);
    let visibleIndex = 0;
    const merged = props.view.propertyOrder.map((id) => visibleIds.has(id) ? reordered[visibleIndex++]! : id);
    merged.push(...reordered.slice(visibleIndex));
    props.onViewChange({ ...props.view, propertyOrder: [...new Set(merged)] });
  }

  function startColumnDrag(event: ReactDragEvent<HTMLSpanElement>, propertyId: string) {
    suppressColumnClick.current = true;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", propertyId);
    setColumnDrag({ sourceId: propertyId, targetId: null, placement: "before" });
  }

  function setColumnDropTarget(event: ReactDragEvent<HTMLSpanElement>, propertyId: string) {
    if (!columnDrag.sourceId || columnDrag.sourceId === propertyId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const rect = event.currentTarget.getBoundingClientRect();
    const placement = event.clientX >= rect.left + rect.width / 2 ? "after" : "before";
    if (columnDrag.targetId !== propertyId || columnDrag.placement !== placement) setColumnDrag((current) => ({ ...current, targetId: propertyId, placement }));
  }

  function finishColumnDrop(event: ReactDragEvent<HTMLSpanElement>, propertyId: string) {
    if (!columnDrag.sourceId || columnDrag.sourceId === propertyId) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const placement = event.clientX >= rect.left + rect.width / 2 ? "after" : "before";
    commitColumnOrder(columnDrag.sourceId, propertyId, placement);
    finishColumnDrag();
  }

  function finishColumnDrag() {
    setColumnDrag({ sourceId: "", targetId: null, placement: "before" });
    window.setTimeout(() => { suppressColumnClick.current = false; }, 0);
  }

  function moveColumnFromKeyboard(event: KeyboardEvent<HTMLElement>, propertyId: string) {
    if (!event.altKey || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
    event.preventDefault();
    event.stopPropagation();
    const index = columns.indexOf(propertyId);
    const target = columns[index + (event.key === "ArrowLeft" ? -1 : 1)];
    if (target) commitColumnOrder(propertyId, target, event.key === "ArrowLeft" ? "before" : "after");
  }

  const header = (propertyId: string, label: string, fallback: number, reorderable = true) => {
    const currentSort = props.view.sorts.find((sort) => sort.propertyId === propertyId);
    const currentWidth = width(propertyId, fallback);
    const definition = props.category.propertySchemaV2?.find((item) => item.id === propertyId && item.deletedAt === null);
    return <span key={propertyId} className={styles.tableColumnHeader} role="columnheader" aria-sort={currentSort ? (currentSort.direction === "asc" ? "ascending" : "descending") : "none"} draggable={reorderable} data-column-draggable={reorderable ? "true" : undefined} data-column-dragging={columnDrag.sourceId === propertyId ? "true" : undefined} data-drop-position={columnDrag.targetId === propertyId ? columnDrag.placement : undefined} title={reorderable ? "끌어서 열 이동 · Alt + 좌우 화살표" : undefined} onClickCapture={(event) => { if (suppressColumnClick.current) { event.preventDefault(); event.stopPropagation(); } }} onKeyDownCapture={(event) => { if (reorderable) moveColumnFromKeyboard(event, propertyId); }} onDragStart={(event) => { if (reorderable) startColumnDrag(event, propertyId); }} onDragOver={(event) => { if (reorderable) setColumnDropTarget(event, propertyId); }} onDrop={(event) => { if (reorderable) finishColumnDrop(event, propertyId); }} onDragEnd={finishColumnDrag}>
      {definition ? <PropertyHeaderMenu category={props.category} definition={definition} view={props.view} sortDirection={currentSort?.direction ?? null} onViewChange={props.onViewChange} onCategoryChange={props.onCategoryChange} /> : <span className={styles.tableColumnLabel}>{label}</span>}
      <div className={styles.columnResize} role="separator" aria-label={`${label} 열 너비 조절`} aria-orientation="vertical" aria-valuemin={80} aria-valuemax={720} aria-valuenow={Math.round(currentWidth)} tabIndex={0} onPointerDown={(event) => startResize(event, propertyId, currentWidth)} onKeyDown={(event) => resizeFromKeyboard(event, propertyId, currentWidth)} />
    </span>;
  };

  const tableHeader = () => <div className={styles.tableHead} role="row" style={{ gridTemplateColumns: template }}>
    <span role="columnheader" aria-label="행 작업" />
    {header(titleColumnId, "제목", TITLE_WIDTH, false)}
    {columns.map((id) => header(id, propertyName(props.category, id), PROPERTY_WIDTH))}
  </div>;

  const tableCell = (record: CareerRecord, definition: CareerPropertyDefinitionV2, instanceKey: string, keyboardRecords: readonly CareerRecord[]) => {
    const key = cellKey(record.id, definition.id);
    const refKey = `${instanceKey}:${key}`;
    const active = activeCell?.recordId === record.id && activeCell.propertyId === definition.id && activeCell.instanceKey === instanceKey;
    const editing = editingCell?.recordId === record.id && editingCell.propertyId === definition.id && editingCell.instanceKey === instanceKey;
    const issue = props.cellIssues?.get(key);
    return <CareerTableCell key={definition.id} record={record} definition={definition} active={active} editing={editing} {...(issue ? { issue } : {})} cellRef={(node) => { if (node) cellRefs.current.set(refKey, node); else cellRefs.current.delete(refKey); }} onFocus={() => setActiveCell({ recordId: record.id, propertyId: definition.id, instanceKey })} onEdit={() => { const next = { recordId: record.id, propertyId: definition.id, instanceKey }; setActiveCell(next); setEditingCell(next); }} onCommit={(value: TableCellValue) => {
      if (!["multi_select", "date"].includes(definition.type)) setEditingCell(null);
      void props.onCellCommit?.(record.id, definition, value);
    }} onCancel={() => setEditingCell(null)} onMove={(direction) => moveCell(record.id, definition.id, direction, instanceKey, keyboardRecords)} onContextMenu={(event) => showCellMenu(event, record.id, definition.id, instanceKey)} onOpenRecord={() => props.onActivate(record.id)} />;
  };

  const tableRows = (items: readonly CareerRecord[], rowOffset: number, keyboardRecords: readonly CareerRecord[], instanceKey = "main") => items.map((record, index) => <div className={record.id === props.openId ? styles.rowActive : styles.tableRow} role="row" aria-rowindex={rowOffset + index} key={record.id} tabIndex={activeCell ? -1 : record.id === props.activeId ? 0 : -1} data-dragging={rowDrag.sourceId === record.id ? "true" : undefined} data-drop-position={rowDrag.targetId === record.id ? rowDrag.placement : undefined} style={{ gridTemplateColumns: template }} onKeyDown={(event) => keyboardActivate(event, record.id, keyboardRecords, props.onActivate)} onDoubleClick={(event) => { if (event.target === event.currentTarget) props.onActivate(record.id); }} onDragOver={(event) => setRecordDropTarget(event, record.id)} onDrop={(event) => finishRecordDrop(event, record.id)}>
    <span className={styles.rowControls} role="gridcell">
      <button type="button" className={styles.rowAddButton} aria-label={`${record.title || "제목 없음"} 아래에 새 기록`} onClick={(event) => { event.stopPropagation(); void createAndFocus(); }}><Icon name="plus" size={17} /></button>
      <button type="button" className={styles.rowDragHandle} aria-label={`${record.title || "제목 없음"} 순서 변경`} title="끌어서 이동 · 위아래 화살표로 이동" draggable onClick={(event) => event.stopPropagation()} onKeyDown={(event) => moveRecordFromKeyboard(event, record.id)} onDragStart={(event) => startRecordDrag(event, record.id)} onDragEnd={() => setRowDrag({ sourceId: "", targetId: null, placement: "before" })}><Icon name="dots-six-vertical" size={18} weight="bold" /></button>
      <label className={styles.rowCheckbox} data-checked={props.selectedIds.has(record.id) ? "true" : "false"} onClick={(event) => event.stopPropagation()}>
        <input aria-label={`${record.title || "제목 없음"} 선택`} type="checkbox" checked={props.selectedIds.has(record.id)} onChange={() => props.onToggle(record.id)} />
        <span aria-hidden="true">{props.selectedIds.has(record.id) ? <Icon name="check" size={11} weight="bold" /> : null}</span>
      </label>
    </span>
    {tableCell(record, titleDefinition, instanceKey, keyboardRecords)}
    {columns.map((id) => definitionsById.get(id)).filter((definition): definition is CareerPropertyDefinitionV2 => Boolean(definition)).map((definition) => tableCell(record, definition, instanceKey, keyboardRecords))}
  </div>);

  const tableSummary = <div className={styles.tableSummary} role="row" style={{ gridTemplateColumns: template }}>
    <span role="gridcell" />
    <strong role="gridcell">{props.records.length}개 기록</strong>
    {columns.map((id) => {
      const key = propertyKey(props.category, id);
      const missing = key ? props.records.filter((record) => displayValue(rawValue(record, key)) === "—").length : props.records.length;
      return <span role="gridcell" key={id}>{missing ? `빈 값 ${missing}` : "모두 입력됨"}</span>;
    })}
  </div>;

  const groupInitialProperties = (group: TableGroup): Record<string, unknown> | undefined => {
    if (!groupDefinition || group.empty) return undefined;
    if (groupDefinition.type === "select") return { [groupDefinition.key]: { type: "select", value: group.key } };
    if (groupDefinition.type === "multi_select") return { [groupDefinition.key]: { type: "multi_select", value: [group.key] } };
    return undefined;
  };

  const contextMenu = cellMenu ? (() => {
    const record = props.records.find((item) => item.id === cellMenu.recordId);
    const definition = cellMenu.propertyId === titleColumnId ? titleDefinition : definitionsById.get(cellMenu.propertyId);
    if (!record || !definition) return null;
    const raw = definition.key === "title" ? record.title : rawValue(record, definition.key);
    const canEdit = !["formula", "rollup", "relation", "file", "media"].includes(definition.type) && !(definition.system && ["created_time", "updated_time"].includes(definition.type));
    const close = () => setCellMenu(null);
    return createPortal(<section className={styles.cellContextMenu} data-cell-context-menu role="menu" aria-label={`${definition.name} 셀 메뉴`} style={{ top: Math.min(cellMenu.y, window.innerHeight - 270), left: Math.min(cellMenu.x, window.innerWidth - 230) }} onContextMenu={(event) => event.preventDefault()}>
      <button type="button" role="menuitem" disabled={!canEdit} onClick={() => { close(); focusCell(record.id, definition.id, true, cellMenu.instanceKey); }}><Icon name="pencil-simple" size={15} />셀 편집</button>
      <button type="button" role="menuitem" onClick={() => { void navigator.clipboard?.writeText(displayValue(raw)); close(); }}><Icon name="copy" size={15} />값 복사</button>
      <button type="button" role="menuitem" disabled={!canEdit} onClick={() => { void props.onCellCommit?.(record.id, definition, definition.type === "checkbox" ? { type: "checkbox", value: false } : definition.type === "multi_select" ? { type: "multi_select", value: [] } : definition.type === "select" ? { type: "select", value: null } : null); close(); }}><Icon name="eraser" size={15} />값 지우기</button>
      {props.cellIssues?.has(cellKey(record.id, definition.id)) ? <button type="button" role="menuitem" onClick={() => { props.onCellRetry?.(record.id, definition.id); close(); }}><Icon name="arrow-clockwise" size={15} />다시 저장</button> : null}
      <hr />
      <button type="button" role="menuitem" onClick={() => { props.onActivate(record.id); close(); }}><Icon name="arrow-square-out" size={15} />기록 열기</button>
      <button type="button" role="menuitem" onClick={() => { close(); const duplicated = props.onDuplicateRecord?.(record.id); if (duplicated) void duplicated.then((created) => { if (created) focusCell(created.id, titleColumnId, true, cellMenu.instanceKey); }); }}><Icon name="copy-simple" size={15} />기록 복제</button>
      <button type="button" role="menuitem" className={styles.dangerMenuItem} onClick={() => { close(); void props.onDeleteRecord?.(record.id); }}><Icon name="trash" size={15} />기록 삭제</button>
    </section>, document.body);
  })() : null;

  if (props.view.groupPropertyId) {
    return <><div className={styles.tableViewport} data-grouped="true">
      <div className={styles.tableGroups} style={{ minWidth: `${Math.max(totalWidth, 700)}px` } as CSSProperties}>
        {groups.map((group) => {
          const collapsed = collapsedGroups.has(group.key);
          return <section className={styles.tableGroup} aria-label={`${group.label} 그룹`} key={group.key}>
            <button type="button" className={styles.tableGroupHeader} aria-expanded={!collapsed} aria-label={`${group.label} 그룹 ${collapsed ? "펼치기" : "접기"}`} onClick={() => setCollapsedGroups((current) => { const next = new Set(current); if (next.has(group.key)) next.delete(group.key); else next.add(group.key); return next; })}>
              <Icon name={collapsed ? "caret-right" : "caret-down"} size={13} />
              <span data-empty={group.empty ? "true" : "false"}>{group.label}</span>
              <small>{group.records.length}</small>
            </button>
            {!collapsed ? <div className={styles.groupTable} role="grid" aria-label={`${group.label} 그룹 테이블`} aria-rowcount={group.records.length + 1}>
              {tableHeader()}
              {tableRows(group.records, 2, group.records, group.key)}
              <div className={styles.tableGroupFooter}><button type="button" aria-label={`${group.label} 그룹에 새 기록`} onClick={() => void createAndFocus(groupInitialProperties(group), group.key)}>＋ 새 기록</button><span>{group.records.length}개 기록</span></div>
            </div> : null}
          </section>;
        })}
      </div>
    </div>{contextMenu}</>;
  }

  return <><div className={styles.tableViewport} onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
    <div className={styles.table} role="grid" aria-label="커리어 테이블" aria-rowcount={props.records.length + 2} style={{ minWidth: `${Math.max(totalWidth, 700)}px` } as CSSProperties}>
      {tableHeader()}
      {start > 0 ? <div className={styles.tableSpacer} aria-hidden="true" style={{ height: `${start * ROW_HEIGHT}px` }} /> : null}
      {tableRows(rows, start + 2, props.records)}
      {end < props.records.length ? <div className={styles.tableSpacer} aria-hidden="true" style={{ height: `${(props.records.length - end) * ROW_HEIGHT}px` }} /> : null}
      {tableSummary}
    </div>
  </div>{contextMenu}</>;
}
