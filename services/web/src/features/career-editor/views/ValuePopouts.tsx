"use client";

import type { CareerPropertyDefinitionV2, CareerPropertyValueV2 } from "@expresso/contracts";
import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";

import { Icon } from "@/components/ui/Icon";
import { propertyOptions } from "@/features/career-editor/properties/property-editors";

import styles from "./views.module.css";

/**
 * 선택 · 다중 선택 · 날짜 값을 고르는 팝업입니다. 표 셀과 문서 속성 칸이 같은 팝업을 씁니다.
 * 앵커(셀 · 속성 단추) 아래에 붙고, 화면 밖으로 나가지 않게 위치를 고칩니다.
 */
export type PopoutValue = CareerPropertyValueV2 | null;

interface CellPosition { top: number; left: number; width: number }

/** `height`는 팝업이 차지할 높이의 어림값입니다. 앵커 아래에 그만큼 자리가 없으면 위로 엽니다. */
function usePopoverPosition(open: boolean, anchorRef: React.RefObject<HTMLElement | null>, height = 270) {
  const [position, setPosition] = useState<CellPosition | null>(null);
  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const update = () => {
      const box = anchorRef.current?.getBoundingClientRect();
      if (!box) return;
      const width = Math.min(Math.max(box.width, 240), 340);
      const left = Math.min(Math.max(10, box.left), window.innerWidth - width - 10);
      const roomBelow = window.innerHeight - box.bottom;
      setPosition({ top: Math.round(roomBelow > height + 10 ? box.bottom + 5 : Math.max(10, box.top - height - 5)), left: Math.round(left), width: Math.round(width) });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => { window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, [anchorRef, height, open]);
  return position;
}

export function OptionPopout({ definition, value, anchorRef, onCommit, onCreateOption, onClose }: { definition: CareerPropertyDefinitionV2; value: unknown; anchorRef: React.RefObject<HTMLElement | null>; onCommit(value: PopoutValue): void; onCreateOption?: ((name: string) => Promise<string>) | undefined; onClose(): void }) {
  const options = propertyOptions(definition);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createIssue, setCreateIssue] = useState("");
  const initial = definition.type === "multi_select" && Array.isArray(value) ? value.map(String) : [];
  const [selected, setSelected] = useState(new Set(initial));
  const panelRef = useRef<HTMLDivElement>(null);
  const position = usePopoverPosition(true, anchorRef);
  usePopupKeyboard(panelRef, anchorRef, onClose);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!anchorRef.current?.contains(target) && !panelRef.current?.contains(target)) onClose();
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [anchorRef, onClose]);
  return createPortal(<div ref={panelRef} className={styles.cellPopout} onKeyDown={(event) => movePopupFocus(event, panelRef.current)} style={position ? { top: position.top, left: position.left, width: position.width } as CSSProperties : { visibility: "hidden" }} role="listbox" aria-label={`${definition.name} 값 선택`} aria-multiselectable={definition.type === "multi_select"}>
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
    {onCreateOption ? <input className={styles.cellPopoutInput} aria-label={`${definition.name} 새 항목`} placeholder="새 항목 입력 후 Enter" value={newName} disabled={creating} title={createIssue || undefined} data-issue={createIssue ? "true" : "false"} onChange={(event) => { setNewName(event.target.value); setCreateIssue(""); }} onKeyDown={(event) => {
      if (event.key !== "Enter" || event.nativeEvent.isComposing || !newName.trim()) return;
      event.preventDefault(); setCreating(true);
      void onCreateOption(newName).then((optionId) => {
        setNewName("");
        if (definition.type === "multi_select") { const next = new Set(selected).add(optionId); setSelected(next); onCommit({ type: "multi_select", value: [...next] }); }
        else { onCommit({ type: "select", value: optionId }); onClose(); }
      }).catch((error: unknown) => setCreateIssue(error instanceof Error ? error.message : "항목을 추가하지 못했습니다.")).finally(() => setCreating(false));
    }} /> : null}
  </div>, document.body);
}

/**
 * 셀 팝업의 키보드 처리입니다. 열면 첫 항목으로 포커스를 옮기고, Escape는 팝업을 닫고 셀로 포커스를 돌려줍니다.
 * 팝업 안의 키가 표 행까지 올라가면 Enter · ↓가 기록을 엽니다(2026-11-02 감사).
 */
function usePopupKeyboard(panelRef: React.RefObject<HTMLDivElement | null>, anchorRef: React.RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    const frame = requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>("button, input")?.focus());
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault(); event.stopPropagation();
      onClose();
      anchorRef.current?.focus();
    };
    document.addEventListener("keydown", escape, true);
    return () => { cancelAnimationFrame(frame); document.removeEventListener("keydown", escape, true); };
  }, [anchorRef, onClose, panelRef]);
}

function movePopupFocus(event: KeyboardEvent<HTMLElement>, panel: HTMLElement | null) {
  event.stopPropagation();
  if (!panel || (event.key !== "ArrowDown" && event.key !== "ArrowUp")) return;
  const items = [...panel.querySelectorAll<HTMLElement>("button, input")];
  const index = items.indexOf(document.activeElement as HTMLElement);
  const next = items[(index + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length];
  if (next) { event.preventDefault(); next.focus(); }
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

const DATE_POPOUT_WIDTH = 286;
const DATE_POPOUT_HEIGHT = 380;

export function DatePopout({ definition, value, anchorRef, onCommit, onClose }: { definition: CareerPropertyDefinitionV2; value: unknown; anchorRef: React.RefObject<HTMLElement | null>; onCommit(value: PopoutValue): void; onClose(): void }) {
  const range = value && typeof value === "object" && "start" in value ? value as { start: string; end?: string | null } : null;
  const initial = range?.start ? new Date(`${range.start.slice(0, 10)}T00:00:00`) : new Date();
  const [month, setMonth] = useState(new Date(initial.getFullYear(), initial.getMonth(), 1));
  const [start, setStart] = useState(range?.start?.slice(0, 10) ?? "");
  const [end, setEnd] = useState(range?.end?.slice(0, 10) ?? "");
  const [selectingEnd, setSelectingEnd] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const position = usePopoverPosition(true, anchorRef, DATE_POPOUT_HEIGHT);
  const days = useMemo(() => monthDays(month), [month]);
  usePopupKeyboard(panelRef, anchorRef, onClose);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!anchorRef.current?.contains(target) && !panelRef.current?.contains(target)) onClose();
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [anchorRef, onClose]);
  const commit = (nextStart: string, nextEnd: string) => onCommit(nextStart ? { type: "date", value: { start: nextStart, end: nextEnd || null, timezone: null } } : null);
  // 달력은 앵커 폭을 따르지 않습니다. 넓은 칸(문서 속성)에서 날짜 칸이 커지며 팝업 밖으로 넘쳤습니다.
  const width = DATE_POPOUT_WIDTH;
  return createPortal(<div ref={panelRef} onKeyDown={(event) => event.stopPropagation()} className={`${styles.cellPopout} ${styles.datePopout}`} style={position ? { top: position.top, left: Math.min(position.left, window.innerWidth - width - 10), width } as CSSProperties : { visibility: "hidden" }} role="dialog" aria-label={`${definition.name} 날짜 선택`}>
    <div className={styles.dateFieldsInline}><button type="button" aria-pressed={!selectingEnd} onClick={() => setSelectingEnd(false)}><small>시작</small><span>{start || "날짜 선택"}</span></button><button type="button" aria-pressed={selectingEnd} onClick={() => setSelectingEnd(true)}><small>종료</small><span>{end || "선택 안 함"}</span></button></div>
    <div className={styles.calendarHead}><button type="button" aria-label="이전 달" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><Icon name="caret-left" size={14} /></button><strong>{month.getFullYear()}년 {month.getMonth() + 1}월</strong><button type="button" aria-label="다음 달" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><Icon name="caret-right" size={14} /></button></div>
    <div className={styles.calendarGrid}>{["일", "월", "화", "수", "목", "금", "토"].map((day) => <small key={day}>{day}</small>)}{days.map((day, index) => day ? <button key={day.toISOString()} type="button" data-selected={isoDate(day) === start || isoDate(day) === end ? "true" : "false"} onClick={() => { const next = isoDate(day); if (selectingEnd) { const safeEnd = start && next < start ? start : next; setEnd(safeEnd); commit(start, safeEnd); } else { setStart(next); const safeEnd = end && end < next ? "" : end; setEnd(safeEnd); commit(next, safeEnd); } }}>{day.getDate()}</button> : <span key={`empty-${index}`} />)}</div>
    <div className={styles.cellPopoutFoot}><button type="button" onClick={() => { setStart(""); setEnd(""); commit("", ""); onClose(); }}>지우기</button><button type="button" onClick={onClose}>완료</button></div>
  </div>, document.body);
}
