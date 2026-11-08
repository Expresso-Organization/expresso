"use client";

import type { CareerRecord, CareerRecordStatus } from "@expresso/contracts";
import { useState, type DragEvent } from "react";

import { Icon } from "@/components/ui/Icon";

import type { CareerViewRendererProps } from "./view-types";
import { keyboardActivate } from "./view-types";
import { groupColumns, groupKeyOf, groupValue, groupingFor } from "./view-logic";
import styles from "./views.module.css";

type Drop = { recordId: string; groupKey: string; beforeId: string | null };

/** 그룹 값마다 열 하나. 카드를 다른 열로 끌거나 ← · →를 누르면 그 기록의 그룹 값이 바뀐다. */
export function BoardView(props: CareerViewRendererProps) {
  const grouping = groupingFor(props.view, props.category);
  const hidden = new Set(props.view.board?.hiddenGroupIds ?? []);
  const columns = groupColumns(grouping, props.view.groupOrder).filter((column) => !hidden.has(column.key));
  const cardOrder = props.view.board?.cardOrder ?? {};
  const manualOrder = props.view.sorts.length === 0;
  const [dragging, setDragging] = useState<string | null>(null);
  const [target, setTarget] = useState<Drop | null>(null);

  const cards = new Map<string, CareerRecord[]>(columns.map((column) => [column.key, []]));
  for (const record of props.records) cards.get(groupKeyOf(record, grouping))?.push(record);
  if (manualOrder) {
    for (const [key, records] of cards) {
      const rank = new Map((cardOrder[key] ?? []).map((id, index) => [id, index]));
      if (rank.size) records.sort((left, right) => (rank.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(right.id) ?? Number.MAX_SAFE_INTEGER));
    }
  }
  const boardRecords = columns.flatMap((column) => cards.get(column.key) ?? []);

  async function changeGroup(record: CareerRecord, groupKey: string) {
    if (grouping.kind === "status") await props.onStatusChange?.(record.id, groupKey as CareerRecordStatus);
    else await props.onCellCommit?.(record.id, grouping.definition, groupValue(grouping, groupKey));
  }

  function move({ recordId, groupKey, beforeId }: Drop) {
    const record = props.records.find((item) => item.id === recordId);
    if (!record) return;
    const from = groupKeyOf(record, grouping);
    if (manualOrder) {
      const ids = (cards.get(groupKey) ?? []).map((item) => item.id).filter((id) => id !== recordId);
      const index = beforeId ? ids.indexOf(beforeId) : -1;
      ids.splice(index < 0 ? ids.length : index, 0, recordId);
      const next = { ...cardOrder, [groupKey]: ids };
      if (from !== groupKey) next[from] = (cardOrder[from] ?? []).filter((id) => id !== recordId);
      props.onViewChange({ ...props.view, board: { hiddenGroupIds: props.view.board?.hiddenGroupIds ?? [], cardOrder: next } });
    }
    if (from !== groupKey) void changeGroup(record, groupKey);
  }

  function overCard(event: DragEvent<HTMLElement>, groupKey: string, recordId: string | null) {
    if (!dragging) return;
    event.preventDefault();
    event.stopPropagation();
    let beforeId = recordId;
    if (recordId) {
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientY > rect.top + rect.height / 2) {
        const list = cards.get(groupKey) ?? [];
        beforeId = list[list.findIndex((item) => item.id === recordId) + 1]?.id ?? null;
      }
    }
    if (target?.groupKey !== groupKey || target.beforeId !== beforeId) setTarget({ recordId: dragging, groupKey, beforeId });
  }

  function drop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (target && dragging) move(target);
    setDragging(null);
    setTarget(null);
  }

  async function createIn(groupKey: string) {
    if (grouping.kind === "property") { const value = groupValue(grouping, groupKey); await props.onCreate(value ? { [grouping.definition.key]: value } : undefined); return; }
    const created = await props.onCreate();
    if (created && groupKey !== created.status) await props.onStatusChange?.(created.id, groupKey as CareerRecordStatus);
  }

  return <div className={styles.board} aria-label="커리어 보드">
    {columns.map((column, columnIndex) => {
      const records = cards.get(column.key) ?? [];
      return <section key={column.key} aria-label={column.label} data-drop={target?.groupKey === column.key && target.beforeId === null ? "end" : undefined} onDragOver={(event) => overCard(event, column.key, null)} onDrop={drop}>
        <h3><span>{column.label}</span><small>{records.length}</small></h3>
        {records.map((record) => <article
          key={record.id}
          className={record.id === props.openId ? styles.cardActive : styles.card}
          tabIndex={record.id === props.activeId ? 0 : -1}
          draggable
          data-dragging={dragging === record.id ? "true" : undefined}
          data-drop={target?.groupKey === column.key && target.beforeId === record.id ? "before" : undefined}
          onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", record.id); setDragging(record.id); }}
          onDragEnd={() => { setDragging(null); setTarget(null); }}
          onDragOver={(event) => overCard(event, column.key, record.id)}
          onDrop={drop}
          onKeyDown={(event) => keyboardActivate(event, record.id, boardRecords, props.onActivate)}
        >
          <label><input aria-label={`${record.title || "제목 없음"} 선택`} type="checkbox" checked={props.selectedIds.has(record.id)} onChange={() => props.onToggle(record.id)} /></label>
          <button type="button" onClick={() => props.onActivate(record.id)}>{record.title || "제목 없음"}</button>
          <div className={styles.moveButtons}>
            <button type="button" aria-label={`${record.title || "제목 없음"} ${columns[columnIndex - 1]?.label ?? ""}(으)로 옮기기`} disabled={columnIndex === 0} onClick={() => move({ recordId: record.id, groupKey: columns[columnIndex - 1]!.key, beforeId: null })}><Icon name="arrow-left" size={12} /></button>
            <button type="button" aria-label={`${record.title || "제목 없음"} ${columns[columnIndex + 1]?.label ?? ""}(으)로 옮기기`} disabled={columnIndex === columns.length - 1} onClick={() => move({ recordId: record.id, groupKey: columns[columnIndex + 1]!.key, beforeId: null })}><Icon name="arrow-right" size={12} /></button>
          </div>
        </article>)}
        <button type="button" className={styles.boardAdd} aria-label={`${column.label}에 새 기록`} onClick={() => void createIn(column.key)}><Icon name="plus" size={12} />새 기록</button>
      </section>;
    })}
  </div>;
}
