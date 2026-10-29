"use client";

import type { CareerCategory, CareerRecord, CareerViewConfiguration } from "@expresso/contracts";
import { useEffect, useRef, useState } from "react";

import { Icon } from "@/components/ui/Icon";
import { PropertySelect } from "@/features/career-editor/properties/PropertySelect";

import { FilterEditor } from "./FilterEditor";
import { ReorderList } from "./ReorderList";
import { SortEditor } from "./SortEditor";
import { ViewTabs, type ViewTabsProps } from "./ViewTabs";
import { EMPTY_GROUP, activeDefinitions, dateDefinitions, definitionById, filterRoot, groupColumns, groupableDefinitions, groupingFor, leafCount } from "./view-logic";
import { displayValue, rawValue } from "./view-types";
import styles from "./views.module.css";

const SPECIAL: Record<string, string> = { skill_tool: "수요 비교", academic_writing: "인용 지표" };
type ToolbarMenu = "filter" | "sort" | "properties";

/** 그룹 순서 목록에 보일 값. 선택 · 체크박스 · 상태는 정의에서, 나머지는 불러온 기록에서 모은다. */
function groupEntries(view: CareerViewConfiguration, category: CareerCategory, records: readonly CareerRecord[]): Array<{ key: string; label: string }> {
  const definition = definitionById(category, view.groupPropertyId);
  if (view.type === "board" || (definition && ["select", "checkbox"].includes(definition.type))) return groupColumns(groupingFor(view, category), view.groupOrder);
  if (!definition) return [];
  if (definition.type === "multi_select") return groupColumns({ kind: "property", definition: { ...definition, type: "select" } }, view.groupOrder);
  const seen = new Map<string, string>();
  for (const record of records) {
    const raw = definition.key === "title" ? record.title : rawValue(record, definition.key);
    const label = displayValue(raw);
    seen.set(label === "—" ? EMPTY_GROUP : String(raw), label === "—" ? `${definition.name} 없음` : label);
  }
  const rank = new Map(view.groupOrder.map((key, index) => [key, index]));
  return [...seen].map(([key, label]) => ({ key, label })).sort((left, right) => (rank.get(left.key) ?? Number.MAX_SAFE_INTEGER) - (rank.get(right.key) ?? Number.MAX_SAFE_INTEGER) || left.label.localeCompare(right.label, "ko"));
}

export interface ViewToolbarProps extends Omit<ViewTabsProps, "activeId" | "types" | "special"> {
  category: CareerCategory;
  view: CareerViewConfiguration;
  records: readonly CareerRecord[];
  types: ViewTabsProps["types"];
  search: string;
  onSearch(query: string): void;
  onChange(next: CareerViewConfiguration): void;
  onCreateRecord(): void;
  onAiCreate(): void;
}

export function ViewToolbar({ category, view, records, search, onSearch, onChange, onCreateRecord, onAiCreate, ...tabs }: ViewToolbarProps) {
  const [activeMenu, setActiveMenu] = useState<ToolbarMenu | null>(null);
  const [searching, setSearching] = useState(Boolean(search));
  const toolbarRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const definitions = activeDefinitions(category);
  const definitionOptions = definitions.map((item) => ({ value: item.id, label: item.name }));
  const dateOptions = dateDefinitions(category).map((item) => ({ value: item.id, label: item.name }));
  const filterCount = leafCount(filterRoot(view.filter));
  const patch = (next: Partial<CareerViewConfiguration>) => onChange({ ...view, ...next });
  const toggleMenu = (menu: ToolbarMenu) => setActiveMenu((current) => current === menu ? null : menu);
  const groups = groupEntries(view, category, records);
  const hidden = new Set(view.board?.hiddenGroupIds ?? []);
  const groupOptions = view.type === "board"
    ? [{ value: "", label: "상태" }, ...groupableDefinitions(category).map((item) => ({ value: item.id, label: item.name }))]
    : [{ value: "", label: "그룹 없음" }, ...definitionOptions];

  useEffect(() => {
    if (!activeMenu) return;
    const closeOutside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || toolbarRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest("[data-property-floating-layer]")) return;
      setActiveMenu(null);
    };
    const closeWithEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setActiveMenu(null); };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeWithEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeWithEscape);
    };
  }, [activeMenu]);

  useEffect(() => { if (searching) searchRef.current?.focus(); }, [searching]);

  const toggleVisibleProperty = (propertyId: string) => {
    const visible = view.visiblePropertyIds.includes(propertyId);
    patch({
      visiblePropertyIds: visible ? view.visiblePropertyIds.filter((id) => id !== propertyId) : [...view.visiblePropertyIds, propertyId],
      propertyOrder: view.propertyOrder.includes(propertyId) ? view.propertyOrder : [...view.propertyOrder, propertyId],
    });
  };
  const orderedDefinitions = [...definitions].sort((left, right) => {
    const rank = (id: string) => { const index = view.propertyOrder.indexOf(id); return index < 0 ? Number.MAX_SAFE_INTEGER : index; };
    return rank(left.id) - rank(right.id);
  });
  const toggleHiddenGroup = (key: string) => {
    const next = new Set(hidden);
    if (next.has(key)) next.delete(key); else next.add(key);
    patch({ board: { hiddenGroupIds: [...next], cardOrder: view.board?.cardOrder ?? {} } });
  };
  const closeSearch = () => { onSearch(""); setSearching(false); };

  return <div ref={toolbarRef} className={styles.toolbar} data-menu-open={activeMenu ? "true" : "false"}>
    <ViewTabs {...tabs} activeId={view.id} special={SPECIAL[category.key]} />
    <div className={styles.toolbarActions}>
      {searching
        ? <span className={styles.searchField}><Icon name="magnifying-glass" size={13} /><input ref={searchRef} type="search" aria-label="기록 검색" value={search} onChange={(event) => onSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") closeSearch(); }} onBlur={() => { if (!search) setSearching(false); }} /><button type="button" aria-label="검색 닫기" onClick={closeSearch}><Icon name="x" size={12} /></button></span>
        : <button type="button" aria-label="기록 검색" onClick={() => setSearching(true)}><Icon name="magnifying-glass" size={13} /></button>}
      <button type="button" onClick={() => toggleMenu("filter")} aria-expanded={activeMenu === "filter"} aria-controls="career-filter-popover" data-active={filterCount ? "true" : undefined}><Icon name="funnel" size={12} />필터{filterCount ? <small>{filterCount}</small> : null}</button>
      <button type="button" onClick={() => toggleMenu("sort")} aria-expanded={activeMenu === "sort"} aria-controls="career-sort-popover" data-active={view.sorts.length ? "true" : undefined}><Icon name="sort-ascending" size={12} />정렬{view.sorts.length ? <small>{view.sorts.length}</small> : null}</button>
      <button type="button" onClick={() => toggleMenu("properties")} aria-expanded={activeMenu === "properties"} aria-controls="career-properties-popover"><Icon name="sliders-horizontal" size={12} />속성</button>
      <span className={styles.createSplit}>
        <button type="button" onClick={onCreateRecord}>새로 만들기</button>
        <button type="button" onClick={onAiCreate}><Icon name="coffee" size={12} />AI로 만들기</button>
      </span>
    </div>

    {activeMenu === "filter" ? <section id="career-filter-popover" className={styles.toolbarPopover} data-menu="filter" aria-label="필터 설정">
      <header className={styles.popoverHeader}><div><strong>필터</strong></div><button type="button" aria-label="필터 닫기" onClick={() => setActiveMenu(null)}>×</button></header>
      <FilterEditor category={category} filter={view.filter} onChange={(filter) => patch({ filter })} />
    </section> : null}

    {activeMenu === "sort" ? <section id="career-sort-popover" className={styles.toolbarPopover} data-menu="sort" aria-label="정렬 설정">
      <header className={styles.popoverHeader}><div><strong>정렬</strong></div><button type="button" aria-label="정렬 닫기" onClick={() => setActiveMenu(null)}>×</button></header>
      <SortEditor category={category} sorts={view.sorts} onChange={(sorts) => patch({ sorts })} />
    </section> : null}

    {activeMenu === "properties" ? <section id="career-properties-popover" className={styles.toolbarPopover} data-menu="properties" aria-label="표시 속성 설정">
      <header className={styles.popoverHeader}><div><strong>속성</strong><span>{view.visiblePropertyIds.length}개 표시 중</span></div><button type="button" aria-label="속성 닫기" onClick={() => setActiveMenu(null)}>×</button></header>
      <div className={styles.popoverSection}>
        <span className={styles.popoverSectionTitle}>표시 속성</span>
        <ReorderList
          label="속성 순서"
          items={orderedDefinitions.map((item) => {
            const visible = view.visiblePropertyIds.includes(item.id);
            return { id: item.id, label: item.name, content: <button type="button" className={styles.reorderToggle} aria-pressed={visible} onClick={() => toggleVisibleProperty(item.id)}><span>{item.name}</span><Icon name={visible ? "eye" : "eye-slash"} size={14} /></button> };
          })}
          onReorder={(ids) => patch({ propertyOrder: ids })}
        />
      </div>
      <div className={styles.popoverSection}>
        <label className={styles.popoverField}>그룹 속성<PropertySelect label="그룹 속성" value={view.groupPropertyId ?? ""} placeholder={groupOptions[0]!.label} options={groupOptions} onChange={(propertyId) => patch({ groupPropertyId: propertyId || null, groupOrder: [], ...(view.board ? { board: { hiddenGroupIds: [], cardOrder: {} } } : {}) })} /></label>
        {groups.length ? <ReorderList
          label="그룹 순서"
          items={groups.map((group) => {
            const shown = !hidden.has(group.key);
            return { id: group.key, label: group.label, content: view.type === "board"
              ? <button type="button" className={styles.reorderToggle} aria-pressed={shown} aria-label={`${group.label} 열 ${shown ? "숨기기" : "보이기"}`} onClick={() => toggleHiddenGroup(group.key)}><span>{group.label}</span><Icon name={shown ? "eye" : "eye-slash"} size={14} /></button>
              : <span className={styles.reorderLabel}>{group.label}</span> };
          })}
          onReorder={(groupOrder) => patch({ groupOrder })}
        /> : null}
      </div>
      {view.type === "gallery" ? <div className={styles.popoverSection}>
        <label className={styles.popoverField}>갤러리 표지<PropertySelect label="갤러리 표지" value={view.gallery?.coverPropertyId ?? ""} placeholder="표지 없음" options={[{ value: "", label: "표지 없음" }, ...definitionOptions]} onChange={(propertyId) => patch({ gallery: { coverPropertyId: propertyId || null, previewPropertyIds: view.gallery?.previewPropertyIds ?? [] } })} /></label>
      </div> : null}
      {view.type === "timeline" ? <div className={styles.popoverSection}>
        <span className={styles.popoverSectionTitle}>시간 축</span>
        <div className={styles.viewSettingGrid} data-columns="2">
          <label className={styles.popoverField}>시작 날짜<PropertySelect label="시작 날짜" value={view.timeline?.startPropertyId ?? ""} placeholder="선택" options={dateOptions} onChange={(propertyId) => { if (propertyId) patch({ timeline: { startPropertyId: propertyId, endPropertyId: view.timeline?.endPropertyId === propertyId ? null : view.timeline?.endPropertyId ?? null, axisStart: view.timeline?.axisStart ?? null, axisEnd: view.timeline?.axisEnd ?? null } }); }} /></label>
          <label className={styles.popoverField}>종료 날짜<PropertySelect label="종료 날짜" value={view.timeline?.endPropertyId ?? ""} placeholder="시작 날짜의 종료" options={[{ value: "", label: "시작 날짜의 종료" }, ...dateOptions.filter((option) => option.value !== view.timeline?.startPropertyId)]} onChange={(propertyId) => view.timeline && patch({ timeline: { ...view.timeline, endPropertyId: propertyId || null } })} /></label>
          <label className={styles.popoverField}>축 시작<input type="date" value={view.timeline?.axisStart ?? ""} max={view.timeline?.axisEnd ?? undefined} onChange={(event) => view.timeline && patch({ timeline: { ...view.timeline, axisStart: event.target.value || null } })} /></label>
          <label className={styles.popoverField}>축 끝<input type="date" value={view.timeline?.axisEnd ?? ""} min={view.timeline?.axisStart ?? undefined} onChange={(event) => view.timeline && patch({ timeline: { ...view.timeline, axisEnd: event.target.value || null } })} /></label>
        </div>
      </div> : null}
    </section> : null}
  </div>;
}
