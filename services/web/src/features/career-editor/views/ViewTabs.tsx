"use client";

import type { CareerViewConfiguration } from "@expresso/contracts";
import { useRef, useState, type DragEvent, type KeyboardEvent, type RefObject } from "react";

import { Icon } from "@/components/ui/Icon";

import { AnchoredMenu } from "./AnchoredMenu";
import { VIEW_TYPE_ICONS, VIEW_TYPE_LABELS, type CareerViewType } from "./view-logic";
import styles from "./views.module.css";

function TabMenu({ view, anchorRef, types, canDelete, onRename, onType, onDuplicate, onDelete, onClose }: {
  view: CareerViewConfiguration; anchorRef: RefObject<HTMLElement | null>; types: readonly CareerViewType[]; canDelete: boolean;
  onRename(name: string): void; onType(type: CareerViewType): void; onDuplicate(): void; onDelete(): void; onClose(): void;
}) {
  const [name, setName] = useState(view.name);
  const [confirming, setConfirming] = useState(false);
  const commitName = () => { const next = name.trim(); if (next && next !== view.name) onRename(next.slice(0, 120)); };
  return <AnchoredMenu anchorRef={anchorRef} label={`${view.name} 뷰 메뉴`} onClose={() => { commitName(); onClose(); }}>
    <input className={styles.tabMenuName} aria-label="뷰 이름" value={name} maxLength={120} autoFocus onFocus={(event) => event.currentTarget.select()} onChange={(event) => setName(event.target.value)} onBlur={commitName} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commitName(); onClose(); } }} />
    <div className={styles.tabMenuSection} role="group" aria-label="보기 종류">
      {types.map((type) => <button key={type} type="button" role="menuitemradio" aria-checked={view.type === type} onClick={() => onType(type)}><Icon name={VIEW_TYPE_ICONS[type]} size={14} /><span>{VIEW_TYPE_LABELS[type]}</span>{view.type === type ? <Icon name="check" size={13} weight="bold" /> : null}</button>)}
    </div>
    <div className={styles.tabMenuSection}>
      <button type="button" role="menuitem" onClick={() => { onDuplicate(); onClose(); }}><Icon name="copy-simple" size={14} /><span>복제</span></button>
      {confirming
        ? <button type="button" role="menuitem" data-danger="true" onClick={() => { onDelete(); onClose(); }}><Icon name="trash" size={14} /><span>「{view.name}」 삭제 확인</span></button>
        : <button type="button" role="menuitem" data-danger="true" disabled={!canDelete} onClick={() => setConfirming(true)}><Icon name="trash" size={14} /><span>삭제</span></button>}
    </div>
  </AnchoredMenu>;
}

export interface ViewTabsProps {
  views: readonly CareerViewConfiguration[];
  activeId: string;
  types: readonly CareerViewType[];
  special?: string | undefined;
  onSelect(id: string): void;
  onCreate(type: CareerViewType): void;
  onRename(id: string, name: string): void;
  onType(id: string, type: CareerViewType): void;
  onDuplicate(id: string): void;
  onDelete(id: string): void;
  onReorder(ids: string[]): void;
}

/** 저장된 뷰마다 탭 하나. 열린 탭을 다시 누르면 이름 · 종류 · 복제 · 삭제 메뉴가 열린다. */
export function ViewTabs({ views, activeId, types, special, onSelect, onCreate, onRename, onType, onDuplicate, onDelete, onReorder }: ViewTabsProps) {
  const [menuId, setMenuId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [drag, setDrag] = useState<{ sourceId: string; targetId: string | null; placement: "before" | "after" } | null>(null);
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const menuAnchor = useRef<HTMLElement | null>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const menuView = views.find((view) => view.id === menuId) ?? null;

  function move(sourceId: string, targetId: string, placement: "before" | "after") {
    const ids = views.map((view) => view.id).filter((id) => id !== sourceId);
    const index = ids.indexOf(targetId);
    if (index < 0) return;
    ids.splice(placement === "before" ? index : index + 1, 0, sourceId);
    if (ids.join() !== views.map((view) => view.id).join()) onReorder(ids);
  }

  function keyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const direction = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    if (!direction) return;
    event.preventDefault();
    const neighbour = views[index + direction];
    if (!neighbour) return;
    if (event.altKey) { move(views[index]!.id, neighbour.id, direction < 0 ? "before" : "after"); return; }
    tabRefs.current.get(neighbour.id)?.focus();
  }

  function dragOver(event: DragEvent<HTMLButtonElement>, id: string) {
    if (!drag || drag.sourceId === id) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const placement = event.clientX < rect.left + rect.width / 2 ? "before" : "after";
    if (drag.targetId !== id || drag.placement !== placement) setDrag({ ...drag, targetId: id, placement });
  }

  return <div className={styles.viewTabs} role="tablist" aria-label="저장 뷰">
    {views.map((view, index) => <button
      key={view.id}
      ref={(node) => { if (node) tabRefs.current.set(view.id, node); else tabRefs.current.delete(view.id); }}
      role="tab"
      type="button"
      aria-selected={view.id === activeId}
      aria-haspopup={view.id === activeId ? "menu" : undefined}
      aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight"
      tabIndex={view.id === activeId ? 0 : -1}
      draggable
      data-drop={drag?.targetId === view.id ? drag.placement : undefined}
      onClick={(event) => { if (view.id === activeId) { menuAnchor.current = event.currentTarget; setMenuId(view.id); } else onSelect(view.id); }}
      onContextMenu={(event) => { event.preventDefault(); onSelect(view.id); menuAnchor.current = event.currentTarget; setMenuId(view.id); }}
      onKeyDown={(event) => keyDown(event, index)}
      onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", view.id); setDrag({ sourceId: view.id, targetId: null, placement: "before" }); }}
      onDragOver={(event) => dragOver(event, view.id)}
      onDrop={(event) => { event.preventDefault(); if (drag?.targetId) move(drag.sourceId, drag.targetId, drag.placement); setDrag(null); }}
      onDragEnd={() => setDrag(null)}
    ><Icon name={VIEW_TYPE_ICONS[view.type]} size={13} />{view.name}</button>)}
    {special ? <button type="button" aria-disabled="true" title="후속 분석 뷰">{special}</button> : null}
    <button ref={addRef} type="button" aria-haspopup="menu" aria-expanded={adding} onClick={() => setAdding((current) => !current)}>＋ 뷰 추가</button>
    {adding ? <AnchoredMenu anchorRef={addRef} label="새 뷰 종류" onClose={() => setAdding(false)}>
      <div className={styles.tabMenuSection}>
        {types.map((type) => <button key={type} type="button" role="menuitem" onClick={() => { setAdding(false); onCreate(type); }}><Icon name={VIEW_TYPE_ICONS[type]} size={14} /><span>{VIEW_TYPE_LABELS[type]}</span></button>)}
      </div>
    </AnchoredMenu> : null}
    {menuView ? <TabMenu
      key={menuView.id}
      view={menuView}
      anchorRef={menuAnchor}
      types={types}
      canDelete={views.length > 1}
      onRename={(name) => onRename(menuView.id, name)}
      onType={(type) => onType(menuView.id, type)}
      onDuplicate={() => onDuplicate(menuView.id)}
      onDelete={() => onDelete(menuView.id)}
      onClose={() => setMenuId(null)}
    /> : null}
  </div>;
}
