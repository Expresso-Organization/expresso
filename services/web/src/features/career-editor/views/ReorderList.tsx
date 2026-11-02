"use client";

import { useState, type DragEvent, type KeyboardEvent, type ReactNode } from "react";

import { Icon } from "@/components/ui/Icon";

import styles from "./views.module.css";

export interface ReorderItem { id: string; label: string; content: ReactNode }

/** 손잡이를 끌거나 손잡이에서 Alt+↑/↓를 눌러 순서를 바꾸는 목록. 도메인을 모른다. */
export function ReorderList({ items, label, onReorder }: { items: readonly ReorderItem[]; label: string; onReorder(ids: string[]): void }) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [target, setTarget] = useState<{ id: string; placement: "before" | "after" } | null>(null);

  function move(sourceId: string, targetId: string, placement: "before" | "after") {
    const ids = items.map((item) => item.id).filter((id) => id !== sourceId);
    const index = ids.indexOf(targetId);
    if (index < 0) return;
    ids.splice(placement === "before" ? index : index + 1, 0, sourceId);
    onReorder(ids);
  }

  function keyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
    event.preventDefault();
    const next = items[index + (event.key === "ArrowUp" ? -1 : 1)];
    if (next) move(items[index]!.id, next.id, event.key === "ArrowUp" ? "before" : "after");
  }

  function over(event: DragEvent<HTMLLIElement>, id: string) {
    if (!dragging || dragging === id) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const placement = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
    if (target?.id !== id || target.placement !== placement) setTarget({ id, placement });
  }

  function drop(event: DragEvent<HTMLLIElement>, id: string) {
    event.preventDefault();
    if (dragging && target && dragging !== id) move(dragging, id, target.placement);
    setDragging(null);
    setTarget(null);
  }

  return <ol className={styles.reorderList} aria-label={label}>
    {items.map((item, index) => <li
      key={item.id}
      data-dragging={dragging === item.id ? "true" : undefined}
      data-drop={target?.id === item.id ? target.placement : undefined}
      onDragOver={(event) => over(event, item.id)}
      onDrop={(event) => drop(event, item.id)}
    >
      <button
        type="button"
        className={styles.dragHandle}
        draggable
        aria-label={`${item.label} 순서 옮기기`}
        aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
        onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", item.id); setDragging(item.id); }}
        onDragEnd={() => { setDragging(null); setTarget(null); }}
        onKeyDown={(event) => keyDown(event, index)}
      ><Icon name="dots-six-vertical" size={14} /></button>
      {item.content}
    </li>)}
  </ol>;
}
