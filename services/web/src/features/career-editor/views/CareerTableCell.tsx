"use client";

import type { CareerPropertyDefinitionV2, CareerPropertyValueV2, CareerRecord } from "@expresso/contracts";
import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";

import { Icon } from "@/components/ui/Icon";
import { propertyOptions } from "@/features/career-editor/properties/property-editors";

import { displayValue, rawValue } from "./view-types";
import styles from "./views.module.css";

export type TableCellValue = CareerPropertyValueV2 | null;

interface CellPosition { top: number; left: number; width: number }

function valueFor(record: CareerRecord, definition: CareerPropertyDefinitionV2): unknown {
  if (definition.key === "title") return record.title;
  if (definition.system && definition.type === "created_time") return record.createdAt ?? record.updatedAt;
  if (definition.system && definition.type === "updated_time") return record.updatedAt;
  return rawValue(record, definition.key);
}

function draftValue(record: CareerRecord, definition: CareerPropertyDefinitionV2): string {
  const value = valueFor(record, definition);
  if (definition.type === "date" && value && typeof value === "object" && "start" in value) return String(value.start);
  return value === null || value === undefined ? "" : String(value);
}

function editable(definition: CareerPropertyDefinitionV2): boolean {
  if (["formula", "rollup", "relation", "file", "media"].includes(definition.type)) return false;
  return !(definition.system && ["created_time", "updated_time"].includes(definition.type));
}

function inlineType(definition: CareerPropertyDefinitionV2): boolean {
  return ["title", "text", "number", "url", "email", "phone", "created_time", "updated_time"].includes(definition.type);
}

function toValue(definition: CareerPropertyDefinitionV2, draft: string): TableCellValue {
  if (!draft && !definition.required) return null;
  if (definition.type === "number") {
    const number = Number(draft);
    if (!Number.isFinite(number)) throw new Error("숫자를 입력해 주세요.");
    return { type: "number", value: number };
  }
  if (definition.type === "created_time" || definition.type === "updated_time") {
    const timestamp = new Date(draft.replace(" ", "T"));
    if (Number.isNaN(timestamp.getTime())) throw new Error("YYYY-MM-DD HH:mm 형식으로 입력해 주세요.");
    return { type: definition.type, value: timestamp.toISOString() };
  }
  const type = definition.type === "title" ? "title" : definition.type === "url" ? "url" : definition.type === "email" ? "email" : definition.type === "phone" ? "phone" : "text";
  return { type, value: draft };
}

function CellDisplay({ record, definition }: { record: CareerRecord; definition: CareerPropertyDefinitionV2 }) {
  const value = valueFor(record, definition);
  const options = propertyOptions(definition);
  const labels = new Map(options.map((option) => [option.id, option.name]));
  if (definition.type === "checkbox") {
    const checked = value === true;
    return <span className={styles.tableBoolean} data-checked={checked ? "true" : "false"}><span aria-hidden="true">{checked ? <Icon name="check" size={11} weight="bold" /> : null}</span>{checked ? "예" : "아니요"}</span>;
  }
  if (Array.isArray(value)) {
    const items = value.map((item) => labels.get(String(item)) ?? (item && typeof item === "object" && "title" in item ? String(item.title) : String(item)));
    return items.length ? <span className={styles.tableTags}>{items.slice(0, 4).map((label, index) => <small key={`${label}-${index}`}>{label}</small>)}</span> : <span className={styles.emptyCell}>—</span>;
  }
  if (definition.type === "date" && value && typeof value === "object" && "start" in value) {
    const range = value as { start: unknown; end?: unknown };
    return <span>{String(range.start)}{range.end ? ` – ${String(range.end)}` : ""}</span>;
  }
  const text = typeof value === "string" ? labels.get(value) ?? displayValue(value) : displayValue(value);
  if (definition.key === "title") return <span className={styles.tableTitleValue}><Icon name="file" size={17} /><span>{text === "—" ? "제목 없음" : text}</span></span>;
  return text === "—" ? <span className={styles.emptyCell}>—</span> : <span>{text}</span>;
}

function usePopoverPosition(open: boolean, anchorRef: React.RefObject<HTMLElement | null>) {
  const [position, setPosition] = useState<CellPosition | null>(null);
  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const update = () => {
      const box = anchorRef.current?.getBoundingClientRect();
      if (!box) return;
      const width = Math.min(Math.max(box.width, 240), 340);
      const left = Math.min(Math.max(10, box.left), window.innerWidth - width - 10);
      const roomBelow = window.innerHeight - box.bottom;
      setPosition({ top: Math.round(roomBelow > 280 ? box.bottom + 5 : Math.max(10, box.top - 270)), left: Math.round(left), width: Math.round(width) });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => { window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, [anchorRef, open]);
  return position;
}

function OptionPopout({ definition, value, anchorRef, onCommit, onClose }: { definition: CareerPropertyDefinitionV2; value: unknown; anchorRef: React.RefObject<HTMLElement | null>; onCommit(value: TableCellValue): void; onClose(): void }) {
  const options = propertyOptions(definition);
  const initial = definition.type === "multi_select" && Array.isArray(value) ? value.map(String) : [];
  const [selected, setSelected] = useState(new Set(initial));
  const panelRef = useRef<HTMLDivElement>(null);
  const position = usePopoverPosition(true, anchorRef);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!anchorRef.current?.contains(target) && !panelRef.current?.contains(target)) onClose();
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [anchorRef, onClose]);
  return createPortal(<div ref={panelRef} className={styles.cellPopout} style={position ? { top: position.top, left: position.left, width: position.width } as CSSProperties : { visibility: "hidden" }} role="listbox" aria-label={`${definition.name} 값 선택`} aria-multiselectable={definition.type === "multi_select"}>
    <div className={styles.cellPopoutTitle}><Icon name={definition.type === "multi_select" ? "list-bullets" : "tag"} size={15} /><strong>{definition.name}</strong></div>
    <button type="button" role="option" aria-selected={value === null || value === "" || (Array.isArray(value) && value.length === 0)} onClick={() => { onCommit(definition.type === "multi_select" ? { type: "multi_select", value: [] } : { type: "select", value: null }); onClose(); }}><span>선택 안 함</span></button>
    {options.map((option) => {
      const chosen = definition.type === "multi_select" ? selected.has(option.id) : value === option.id;
      return <button key={option.id} type="button" role="option" aria-selected={chosen} onClick={() => {
        if (definition.type === "multi_select") {
          const next = new Set(selected); if (next.has(option.id)) next.delete(option.id); else next.add(option.id); setSelected(next); onCommit({ type: "multi_select", value: [...next] });
        } else { onCommit({ type: "select", value: option.id }); onClose(); }
      }}><span className={styles.optionDot} aria-hidden="true" /><span>{option.name}</span>{chosen ? <Icon name="check" size={14} weight="bold" /> : null}</button>;
    })}
  </div>, document.body);
}

function monthDays(month: Date): Array<Date | null> {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  return [...Array(first.getDay()).fill(null), ...Array.from({ length: count }, (_, index) => new Date(month.getFullYear(), month.getMonth(), index + 1))];
}

function isoDate(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function DatePopout({ definition, value, anchorRef, onCommit, onClose }: { definition: CareerPropertyDefinitionV2; value: unknown; anchorRef: React.RefObject<HTMLElement | null>; onCommit(value: TableCellValue): void; onClose(): void }) {
  const range = value && typeof value === "object" && "start" in value ? value as { start: string; end?: string | null } : null;
  const initial = range?.start ? new Date(`${range.start.slice(0, 10)}T00:00:00`) : new Date();
  const [month, setMonth] = useState(new Date(initial.getFullYear(), initial.getMonth(), 1));
  const [start, setStart] = useState(range?.start?.slice(0, 10) ?? "");
  const [end, setEnd] = useState(range?.end?.slice(0, 10) ?? "");
  const [selectingEnd, setSelectingEnd] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const position = usePopoverPosition(true, anchorRef);
  const days = useMemo(() => monthDays(month), [month]);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!anchorRef.current?.contains(target) && !panelRef.current?.contains(target)) onClose();
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [anchorRef, onClose]);
  const commit = (nextStart: string, nextEnd: string) => onCommit(nextStart ? { type: "date", value: { start: nextStart, end: nextEnd || null, timezone: null } } : null);
  const width = position ? Math.max(position.width, 286) : 286;
  return createPortal(<div ref={panelRef} className={`${styles.cellPopout} ${styles.datePopout}`} style={position ? { top: position.top, left: Math.min(position.left, window.innerWidth - width - 10), width } as CSSProperties : { visibility: "hidden" }} role="dialog" aria-label={`${definition.name} 날짜 선택`}>
    <div className={styles.dateFieldsInline}><button type="button" aria-pressed={!selectingEnd} onClick={() => setSelectingEnd(false)}><small>시작</small><span>{start || "날짜 선택"}</span></button><button type="button" aria-pressed={selectingEnd} onClick={() => setSelectingEnd(true)}><small>종료</small><span>{end || "선택 안 함"}</span></button></div>
    <div className={styles.calendarHead}><button type="button" aria-label="이전 달" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><Icon name="caret-left" size={14} /></button><strong>{month.getFullYear()}년 {month.getMonth() + 1}월</strong><button type="button" aria-label="다음 달" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><Icon name="caret-right" size={14} /></button></div>
    <div className={styles.calendarGrid}>{["일", "월", "화", "수", "목", "금", "토"].map((day) => <small key={day}>{day}</small>)}{days.map((day, index) => day ? <button key={day.toISOString()} type="button" data-selected={isoDate(day) === start || isoDate(day) === end ? "true" : "false"} onClick={() => { const next = isoDate(day); if (selectingEnd) { const safeEnd = start && next < start ? start : next; setEnd(safeEnd); commit(start, safeEnd); } else { setStart(next); const safeEnd = end && end < next ? "" : end; setEnd(safeEnd); commit(next, safeEnd); } }}>{day.getDate()}</button> : <span key={`empty-${index}`} />)}</div>
    <div className={styles.cellPopoutFoot}><button type="button" onClick={() => { setStart(""); setEnd(""); commit("", ""); onClose(); }}>지우기</button><button type="button" onClick={onClose}>완료</button></div>
  </div>, document.body);
}

export function CareerTableCell({ record, definition, active, editing, issue, cellRef, onFocus, onEdit, onCommit, onCancel, onMove, onContextMenu, onOpenRecord }: {
  record: CareerRecord;
  definition: CareerPropertyDefinitionV2;
  active: boolean;
  editing: boolean;
  issue?: string;
  cellRef(node: HTMLElement | null): void;
  onFocus(): void;
  onEdit(): void;
  onCommit(value: TableCellValue): void;
  onCancel(): void;
  onMove(direction: "left" | "right" | "up" | "down" | "next" | "previous"): void;
  onContextMenu(event: React.MouseEvent<HTMLElement>): void;
  onOpenRecord(): void;
}) {
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const [draft, setDraft] = useState(() => draftValue(record, definition));
  const [localIssue, setLocalIssue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const committedRef = useRef(false);
  const raw = valueFor(record, definition);
  const canEdit = editable(definition);
  const popup = editing && (definition.type === "select" || definition.type === "multi_select" || definition.type === "date");
  useEffect(() => { if (!editing) setDraft(draftValue(record, definition)); }, [definition, editing, record]);
  useEffect(() => { if (editing) committedRef.current = false; if (editing && inlineType(definition)) queueMicrotask(() => { inputRef.current?.focus(); inputRef.current?.select(); }); }, [definition, editing]);
  function finish() {
    if (committedRef.current) return;
    try { committedRef.current = true; onCommit(toValue(definition, draft)); setLocalIssue(""); }
    catch (error) { setLocalIssue(error instanceof Error ? error.message : "값을 확인해 주세요."); }
  }
  function keyDown(event: KeyboardEvent<HTMLElement>) {
    if (editing) return;
    if ((event.key === "Enter" || event.key === "F2") && canEdit) { event.preventDefault(); event.stopPropagation(); onEdit(); return; }
    const direction = event.key === "ArrowLeft" ? "left" : event.key === "ArrowRight" ? "right" : event.key === "ArrowUp" ? "up" : event.key === "ArrowDown" ? "down" : event.key === "Tab" ? (event.shiftKey ? "previous" : "next") : null;
    if (direction) { event.preventDefault(); event.stopPropagation(); onMove(direction); }
  }
  return <span ref={(node) => { anchorRef.current = node; cellRef(node); }} className={styles.tableCell} role="gridcell" tabIndex={active ? 0 : -1} data-active={active ? "true" : "false"} data-editing={editing ? "true" : "false"} data-issue={issue || localIssue ? "true" : "false"} title={issue || localIssue || undefined} onFocus={onFocus} onKeyDown={keyDown} onClick={(event) => { event.stopPropagation(); if (definition.key === "title" && !editing) { onOpenRecord(); return; } if (definition.type === "checkbox" && canEdit) { onFocus(); onCommit({ type: "checkbox", value: raw !== true }); return; } if (active && canEdit) onEdit(); else onFocus(); }} onDoubleClick={(event) => { event.stopPropagation(); if (canEdit) onEdit(); }} onContextMenu={onContextMenu}>
    {editing && inlineType(definition) ? <input ref={inputRef} className={styles.cellInput} aria-label={`${definition.name} 셀 편집`} type="text" inputMode={definition.type === "number" ? "decimal" : undefined} value={draft} onChange={(event) => { setDraft(event.target.value); setLocalIssue(""); }} onBlur={finish} onKeyDown={(event) => {
      event.stopPropagation();
      if (event.key === "Escape") { event.preventDefault(); onCancel(); return; }
      if (event.key === "Enter" || event.key === "Tab") { event.preventDefault(); finish(); if (event.key === "Tab") onMove(event.shiftKey ? "previous" : "next"); }
    }} /> : <CellDisplay record={record} definition={definition} />}
    {active && definition.key === "title" && !editing ? <button type="button" className={styles.cellOpenButton} onClick={(event) => { event.stopPropagation(); onOpenRecord(); }}><Icon name="arrow-square-out" size={13} />열기</button> : null}
    {popup && (definition.type === "select" || definition.type === "multi_select") ? <OptionPopout definition={definition} value={raw} anchorRef={anchorRef} onCommit={onCommit} onClose={onCancel} /> : null}
    {popup && definition.type === "date" ? <DatePopout definition={definition} value={raw} anchorRef={anchorRef} onCommit={onCommit} onClose={onCancel} /> : null}
  </span>;
}
