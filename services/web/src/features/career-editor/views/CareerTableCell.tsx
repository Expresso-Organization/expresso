"use client";

import type { CareerPropertyDefinitionV2, CareerPropertyValueV2, CareerRecord } from "@expresso/contracts";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { Icon } from "@/components/ui/Icon";

import { displayValue, rawValue } from "./view-types";
import { formatPeriodRange, propertyLabel, propertyLabels } from "./view-logic";
import styles from "./views.module.css";
import { DatePopout, OptionPopout } from "./ValuePopouts";

export type TableCellValue = CareerPropertyValueV2 | null;

function valueFor(record: CareerRecord, definition: CareerPropertyDefinitionV2): unknown {
  if (definition.key === "title") return record.title;
  if (definition.system && definition.type === "created_time") return record.createdAt ?? record.updatedAt;
  if (definition.system && definition.type === "updated_time") return record.updatedAt;
  // 수식 · 롤업 값은 계산 Worker가 computedProperties에 씁니다. properties만 읽으면 늘 「—」입니다.
  if (definition.type === "formula" || definition.type === "rollup") {
    const computed = record.computedProperties?.[definition.key];
    return computed && typeof computed === "object" && "value" in computed ? computed.value : null;
  }
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
  if (definition.type === "checkbox") {
    const checked = value === true;
    return <span className={styles.tableBoolean} data-checked={checked ? "true" : "false"}><span aria-hidden="true">{checked ? <Icon name="check" size={11} weight="bold" /> : null}</span>{checked ? "예" : "아니요"}</span>;
  }
  if (Array.isArray(value)) {
    const items = definition.type === "multi_select" || definition.type === "relation" ? propertyLabels(record, definition) : value.map((item) => item && typeof item === "object" && "title" in item ? String(item.title) : String(item));
    return items.length ? <span className={styles.tableTags}>{items.slice(0, 4).map((label, index) => <small key={`${label}-${index}`}>{label}</small>)}</span> : <span className={styles.emptyCell}>—</span>;
  }
  if (definition.type === "date" && value && typeof value === "object" && "start" in value) {
    const range = value as { start: unknown; end?: unknown };
    return <span>{formatPeriodRange(String(range.start), range.end ? String(range.end) : null)}</span>;
  }
  const text = definition.type === "select" ? propertyLabel(record, definition) ?? "—" : displayValue(value);
  if (definition.key === "title") return <span className={styles.tableTitleValue}><Icon name="file" size={17} /><span>{text === "—" ? "제목 없음" : text}</span></span>;
  return text === "—" ? <span className={styles.emptyCell}>—</span> : <span>{text}</span>;
}


export function CareerTableCell({ record, definition, active, editing, issue, cellRef, onFocus, onEdit, onCommit, onCreateOption, onCancel, onMove, onContextMenu, onOpenRecord }: {
  record: CareerRecord;
  definition: CareerPropertyDefinitionV2;
  active: boolean;
  editing: boolean;
  issue?: string;
  cellRef(node: HTMLElement | null): void;
  onFocus(): void;
  onEdit(): void;
  onCommit(value: TableCellValue): void;
  /** 선택 · 다중 선택 팝업에서 새 옵션을 만든다. */
  onCreateOption?: ((name: string) => Promise<string>) | undefined;
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
  /** 값을 바꿀 수 있으면 저장하고 true입니다. 바꿀 수 없는 값이면 이유를 보이고 편집을 이어 갑니다. */
  function finish(): boolean {
    if (committedRef.current) return true;
    let value: TableCellValue;
    try { value = toValue(definition, draft); }
    catch (error) { setLocalIssue(error instanceof Error ? error.message : "값을 확인해 주세요."); return false; }
    committedRef.current = true; onCommit(value); setLocalIssue("");
    return true;
  }
  function keyDown(event: KeyboardEvent<HTMLElement>) {
    // 편집 중인 키는 셀 밖(행 · 표)으로 보내지 않습니다. 행이 Enter · 방향키로 기록을 열거나 옮겨 갑니다.
    if (editing) { event.stopPropagation(); return; }
    if ((event.key === "Enter" || event.key === "F2") && canEdit) { event.preventDefault(); event.stopPropagation(); onEdit(); return; }
    const direction = event.key === "ArrowLeft" ? "left" : event.key === "ArrowRight" ? "right" : event.key === "ArrowUp" ? "up" : event.key === "ArrowDown" ? "down" : event.key === "Tab" ? (event.shiftKey ? "previous" : "next") : null;
    if (direction) { event.preventDefault(); event.stopPropagation(); onMove(direction); }
  }
  return <span ref={(node) => { anchorRef.current = node; cellRef(node); }} className={styles.tableCell} role="gridcell" tabIndex={active ? 0 : -1} data-active={active ? "true" : "false"} data-editing={editing ? "true" : "false"} data-issue={issue || localIssue ? "true" : "false"} title={issue || localIssue || undefined} onFocus={onFocus} onKeyDown={keyDown} onClick={(event) => { event.stopPropagation(); if (definition.key === "title" && !editing) { onOpenRecord(); return; } if (definition.type === "checkbox" && canEdit) { onFocus(); onCommit({ type: "checkbox", value: raw !== true }); return; } if (active && canEdit) onEdit(); else onFocus(); }} onDoubleClick={(event) => { event.stopPropagation(); if (canEdit) onEdit(); }} onContextMenu={onContextMenu}>
    {editing && inlineType(definition) ? <input ref={inputRef} className={styles.cellInput} aria-label={`${definition.name} 셀 편집`} type="text" inputMode={definition.type === "number" ? "decimal" : undefined} value={draft} onChange={(event) => { setDraft(event.target.value); setLocalIssue(""); }} onBlur={finish} onKeyDown={(event) => {
      event.stopPropagation();
      if (event.key === "Escape") { event.preventDefault(); onCancel(); return; }
      if (event.key === "Enter" || event.key === "Tab") { event.preventDefault(); if (finish() && event.key === "Tab") onMove(event.shiftKey ? "previous" : "next"); }
    }} /> : <CellDisplay record={record} definition={definition} />}
    {active && definition.key === "title" && !editing ? <button type="button" className={styles.cellOpenButton} onClick={(event) => { event.stopPropagation(); onOpenRecord(); }}><Icon name="arrow-square-out" size={13} />열기</button> : null}
    {popup && (definition.type === "select" || definition.type === "multi_select") ? <OptionPopout definition={definition} value={raw} anchorRef={anchorRef} onCommit={onCommit} onCreateOption={onCreateOption} onClose={onCancel} /> : null}
    {issue || localIssue ? <span className="ex-sr-only" role="alert">{issue || localIssue}</span> : null}
    {popup && definition.type === "date" ? <DatePopout definition={definition} value={raw} anchorRef={anchorRef} onCommit={onCommit} onClose={onCancel} /> : null}
  </span>;
}
