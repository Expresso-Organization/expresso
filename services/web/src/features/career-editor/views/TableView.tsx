"use client";

import type { CareerCategory, CareerRecord, CareerViewConfiguration } from "@expresso/contracts";
import type { CSSProperties, KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Icon } from "@/components/ui/Icon";

import { PropertyHeaderMenu } from "./PropertyHeaderMenu";
import type { CareerViewRendererProps } from "./view-types";
import { displayValue, keyboardActivate, propertyKey, propertyName, rawValue } from "./view-types";
import styles from "./views.module.css";

const SELECT_WIDTH = 52;
const TITLE_WIDTH = 260;
const PROPERTY_WIDTH = 160;
const ROW_HEIGHT = 42;
const WINDOW_ROWS = 22;
const OVERSCAN = 5;

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

function cellValue(record: CareerRecord, key: string | null) {
  if (!key) return <span className={styles.emptyCell}>—</span>;
  const value = rawValue(record, key);
  if (Array.isArray(value)) {
    const labels = value.flatMap((item) => {
      if (typeof item === "string" || typeof item === "number") return [String(item)];
      if (item && typeof item === "object" && "title" in item) return [String(item.title)];
      return [];
    });
    return labels.length ? <span className={styles.tableTags}>{labels.slice(0, 4).map((label) => <small key={label}>{label}</small>)}</span> : <span className={styles.emptyCell}>—</span>;
  }
  const label = displayValue(value);
  return label === "—" ? <span className={styles.emptyCell}>—</span> : <span>{label}</span>;
}

export function TableView(props: CareerViewRendererProps & { onCategoryChange(nextCategory: CareerCategory, nextView?: CareerViewConfiguration): void }) {
  const columns = useMemo(() => orderedPropertyIds(props), [props.category, props.view.propertyOrder, props.view.visiblePropertyIds]);
  const titleId = props.category.propertySchemaV2?.find((definition) => definition.key === "title" && definition.deletedAt === null)?.id ?? props.view.visiblePropertyIds.find((id) => propertyKey(props.category, id) === "title") ?? null;
  const [previewWidths, setPreviewWidths] = useState<Record<string, number>>(props.view.columnWidths);
  const [scrollTop, setScrollTop] = useState(0);
  const drag = useRef<{ propertyId: string; width: number } | null>(null);
  const resizeCleanup = useRef<(() => void) | null>(null);

  useEffect(() => setPreviewWidths(props.view.columnWidths), [props.view.columnWidths]);
  useEffect(() => () => resizeCleanup.current?.(), []);

  const width = (propertyId: string | null, fallback: number) => propertyId ? previewWidths[propertyId] ?? propertyWidth(props.view, propertyId, fallback) : fallback;
  const template = `${SELECT_WIDTH}px ${width(titleId, TITLE_WIDTH)}px ${columns.map((id) => `${width(id, PROPERTY_WIDTH)}px`).join(" ")}`;
  const totalWidth = SELECT_WIDTH + width(titleId, TITLE_WIDTH) + columns.reduce((total, id) => total + width(id, PROPERTY_WIDTH), 0);
  const windowed = props.records.length > WINDOW_ROWS + OVERSCAN * 2;
  const start = windowed ? Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN) : 0;
  const end = windowed ? Math.min(props.records.length, start + WINDOW_ROWS + OVERSCAN * 2) : props.records.length;
  const rows = props.records.slice(start, end);

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

  const header = (propertyId: string, label: string, fallback: number) => {
    const currentSort = props.view.sorts.find((sort) => sort.propertyId === propertyId);
    const currentWidth = width(propertyId, fallback);
    const definition = props.category.propertySchemaV2?.find((item) => item.id === propertyId && item.deletedAt === null);
    return <span key={propertyId} className={styles.tableColumnHeader} role="columnheader" aria-sort={currentSort ? (currentSort.direction === "asc" ? "ascending" : "descending") : "none"}>
      {definition ? <PropertyHeaderMenu category={props.category} definition={definition} view={props.view} sortDirection={currentSort?.direction ?? null} onViewChange={props.onViewChange} onCategoryChange={props.onCategoryChange} /> : <button type="button">{label}<Icon name="caret-down" size={11} /></button>}
      <div className={styles.columnResize} role="separator" aria-label={`${label} 열 너비 조절`} aria-orientation="vertical" aria-valuemin={80} aria-valuemax={720} aria-valuenow={Math.round(currentWidth)} tabIndex={0} onPointerDown={(event) => startResize(event, propertyId, currentWidth)} onKeyDown={(event) => resizeFromKeyboard(event, propertyId, currentWidth)} />
    </span>;
  };

  return <div className={styles.tableViewport} onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
    <div className={styles.table} role="grid" aria-label="커리어 테이블" aria-rowcount={props.records.length + 2} style={{ minWidth: `${Math.max(totalWidth, 700)}px` } as CSSProperties}>
      <div className={styles.tableHead} role="row" style={{ gridTemplateColumns: template }}>
        <span role="columnheader">선택</span>
        {titleId ? header(titleId, "제목", TITLE_WIDTH) : <span role="columnheader">제목</span>}
        {columns.map((id) => header(id, propertyName(props.category, id), PROPERTY_WIDTH))}
      </div>
      {start > 0 ? <div className={styles.tableSpacer} aria-hidden="true" style={{ height: `${start * ROW_HEIGHT}px` }} /> : null}
      {rows.map((record, index) => <div className={record.id === props.openId ? styles.rowActive : styles.tableRow} role="row" aria-rowindex={start + index + 2} key={record.id} tabIndex={record.id === props.activeId ? 0 : -1} style={{ gridTemplateColumns: template }} onKeyDown={(event) => keyboardActivate(event, record.id, props.records, props.onActivate)} onDoubleClick={() => props.onActivate(record.id)}>
        <span role="gridcell"><input aria-label={`${record.title || "제목 없음"} 선택`} type="checkbox" checked={props.selectedIds.has(record.id)} onChange={() => props.onToggle(record.id)} /></span>
        <button type="button" role="gridcell" onClick={() => props.onActivate(record.id)}>{record.title || "제목 없음"}</button>
        {columns.map((id) => <span role="gridcell" key={id}>{cellValue(record, propertyKey(props.category, id))}</span>)}
      </div>)}
      {end < props.records.length ? <div className={styles.tableSpacer} aria-hidden="true" style={{ height: `${(props.records.length - end) * ROW_HEIGHT}px` }} /> : null}
      <div className={styles.tableSummary} role="row" style={{ gridTemplateColumns: template }}>
        <span role="gridcell" />
        <strong role="gridcell">{props.records.length}개 기록</strong>
        {columns.map((id) => {
          const key = propertyKey(props.category, id);
          const missing = key ? props.records.filter((record) => displayValue(rawValue(record, key)) === "—").length : props.records.length;
          return <span role="gridcell" key={id}>{missing ? `빈 값 ${missing}` : "모두 입력됨"}</span>;
        })}
      </div>
    </div>
  </div>;
}
