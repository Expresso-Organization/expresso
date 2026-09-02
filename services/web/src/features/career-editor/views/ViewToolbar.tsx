"use client";

import type { CareerCategory, CareerViewConfiguration } from "@expresso/contracts";
import { useEffect, useRef, useState } from "react";

import { Icon } from "@/components/ui/Icon";
import { PropertySelect } from "@/features/career-editor/properties/PropertySelect";

import styles from "./views.module.css";

const LABELS = { table: "테이블", list: "목록", gallery: "갤러리", board: "보드", timeline: "타임라인" } as const;
const OFFERED: Record<string, readonly CareerViewConfiguration["type"][]> = {
  experience: ["table", "board", "timeline"], project: ["gallery", "table", "timeline"],
  education_history: ["timeline", "table", "gallery"], certification_award: ["table", "gallery"],
  academic_writing: ["list", "timeline"], activity_leadership: ["table", "timeline"], skill_tool: ["board", "table"],
};
const SPECIAL: Record<string, string> = { skill_tool: "수요 비교", academic_writing: "인용 지표" };
type ToolbarMenu = "filter" | "sort" | "properties";

export function ViewToolbar({ category, view, onChange, onCreate, onAiCreate, onDuplicate }: { category: CareerCategory; view: CareerViewConfiguration; onChange(next: CareerViewConfiguration): Promise<void>; onCreate(): void; onAiCreate(): void; onDuplicate(): Promise<void> }) {
  const [activeMenu, setActiveMenu] = useState<ToolbarMenu | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const definitions = (category.propertySchemaV2 ?? []).filter((item) => item.deletedAt === null);
  const definitionOptions = definitions.map((item) => ({ value: item.id, label: item.name }));
  const filterPropertyId = view.filter && typeof view.filter === "object" && !Array.isArray(view.filter) && "propertyId" in view.filter ? String((view.filter as { propertyId: string }).propertyId) : "";
  const offered = OFFERED[category.key] ?? ["table", "list", "gallery", "board", "timeline"];
  const patch = (next: Partial<CareerViewConfiguration>) => void onChange({ ...view, ...next });
  const toggleMenu = (menu: ToolbarMenu) => setActiveMenu((current) => current === menu ? null : menu);

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

  const toggleVisibleProperty = (propertyId: string) => {
    const visible = view.visiblePropertyIds.includes(propertyId);
    patch({
      visiblePropertyIds: visible ? view.visiblePropertyIds.filter((id) => id !== propertyId) : [...view.visiblePropertyIds, propertyId],
      propertyOrder: view.propertyOrder.includes(propertyId) ? view.propertyOrder : [...view.propertyOrder, propertyId],
    });
  };

  const setSortDirection = (direction: "asc" | "desc") => {
    const current = view.sorts[0];
    if (current) patch({ sorts: [{ ...current, direction }] });
  };

  return <div ref={toolbarRef} className={styles.toolbar} data-menu-open={activeMenu ? "true" : "false"}>
    <div className={styles.viewTabs} role="tablist" aria-label="저장 뷰">
      {offered.map((type) => <button role="tab" aria-selected={view.type === type} key={type} onClick={() => patch({ type })}>{LABELS[type]}</button>)}
      {SPECIAL[category.key] ? <button type="button" aria-disabled="true" title="후속 분석 뷰">{SPECIAL[category.key]}</button> : null}
      <button type="button" onClick={() => void onDuplicate()}>＋ 뷰 추가</button>
    </div>
    <div className={styles.toolbarActions}>
      <button type="button" onClick={() => toggleMenu("filter")} aria-expanded={activeMenu === "filter"} aria-controls="career-filter-popover"><Icon name="funnel" size={12} />필터</button>
      <button type="button" onClick={() => toggleMenu("sort")} aria-expanded={activeMenu === "sort"} aria-controls="career-sort-popover"><Icon name="sort-ascending" size={12} />정렬</button>
      <button type="button" onClick={() => toggleMenu("properties")} aria-expanded={activeMenu === "properties"} aria-controls="career-properties-popover"><Icon name="sliders-horizontal" size={12} />속성</button>
      <span className={styles.createSplit}>
        <button type="button" onClick={onCreate}>새로 만들기</button>
        <button type="button" onClick={onAiCreate}><Icon name="coffee" size={12} />AI로 만들기</button>
      </span>
    </div>

    {activeMenu === "filter" ? <section id="career-filter-popover" className={styles.toolbarPopover} data-menu="filter" aria-label="필터 설정">
      <header className={styles.popoverHeader}><div><strong>필터</strong><span>조건에 맞는 기록만 표시합니다.</span></div><button type="button" aria-label="필터 닫기" onClick={() => setActiveMenu(null)}>×</button></header>
      <label className={styles.popoverField}>속성<PropertySelect label="필터 속성" value={filterPropertyId} placeholder="필터 없음" options={[{ value: "", label: "필터 없음" }, ...definitionOptions]} onChange={(propertyId) => patch({ filter: propertyId ? { propertyId, operator: "is_not_empty", operand: null } : null })} /></label>
      <p className={styles.popoverHint}>선택한 속성에 값이 있는 기록을 보여 줍니다.</p>
      {filterPropertyId ? <button type="button" className={styles.clearViewSetting} onClick={() => patch({ filter: null })}>필터 지우기</button> : null}
    </section> : null}

    {activeMenu === "sort" ? <section id="career-sort-popover" className={styles.toolbarPopover} data-menu="sort" aria-label="정렬 설정">
      <header className={styles.popoverHeader}><div><strong>정렬</strong><span>기록이 보이는 순서를 정합니다.</span></div><button type="button" aria-label="정렬 닫기" onClick={() => setActiveMenu(null)}>×</button></header>
      <label className={styles.popoverField}>속성<PropertySelect label="정렬 속성" value={view.sorts[0]?.propertyId ?? ""} placeholder="정렬 없음" options={[{ value: "", label: "정렬 없음" }, ...definitionOptions]} onChange={(propertyId) => patch({ sorts: propertyId ? [{ propertyId, direction: "asc", nulls: "last" }] : [] })} /></label>
      <div className={styles.directionPicker} aria-label="정렬 방향">
        <button type="button" aria-pressed={(view.sorts[0]?.direction ?? "asc") === "asc"} disabled={!view.sorts[0]} onClick={() => setSortDirection("asc")}>오름차순</button>
        <button type="button" aria-pressed={view.sorts[0]?.direction === "desc"} disabled={!view.sorts[0]} onClick={() => setSortDirection("desc")}>내림차순</button>
      </div>
      {view.sorts[0] ? <button type="button" className={styles.clearViewSetting} onClick={() => patch({ sorts: [] })}>정렬 지우기</button> : null}
    </section> : null}

    {activeMenu === "properties" ? <section id="career-properties-popover" className={styles.toolbarPopover} data-menu="properties" aria-label="표시 속성 설정">
      <header className={styles.popoverHeader}><div><strong>속성</strong><span>{view.visiblePropertyIds.length}개 표시 중</span></div><button type="button" aria-label="속성 닫기" onClick={() => setActiveMenu(null)}>×</button></header>
      <div className={styles.popoverSection}>
        <span className={styles.popoverSectionTitle}>표시 속성</span>
        <div className={styles.propertyVisibilityList}>{definitions.map((item) => {
          const visible = view.visiblePropertyIds.includes(item.id);
          return <button type="button" key={item.id} aria-pressed={visible} onClick={() => toggleVisibleProperty(item.id)}><span>{item.name}</span>{visible ? <Icon name="check" size={14} weight="bold" /> : null}</button>;
        })}</div>
      </div>
      <div className={styles.popoverSection}>
        <span className={styles.popoverSectionTitle}>보기 설정</span>
        <div className={styles.viewSettingGrid}>
          <label className={styles.popoverField}>그룹 속성<PropertySelect label="그룹 속성" value={view.groupPropertyId ?? ""} placeholder="그룹 없음" options={[{ value: "", label: "그룹 없음" }, ...definitionOptions]} onChange={(propertyId) => patch({ groupPropertyId: propertyId || null })} /></label>
          <label className={styles.popoverField}>그룹 순서<input value={view.groupOrder.join(", ")} placeholder="예: 진행 중, 완료" onChange={(event) => patch({ groupOrder: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} /></label>
          {view.type === "gallery" ? <label className={styles.popoverField}>갤러리 표지<PropertySelect label="갤러리 표지" value={view.gallery?.coverPropertyId ?? ""} placeholder="표지 없음" options={[{ value: "", label: "표지 없음" }, ...definitionOptions]} onChange={(propertyId) => patch({ gallery: { coverPropertyId: propertyId || null, previewPropertyIds: view.gallery?.previewPropertyIds ?? [] } })} /></label> : null}
          {view.type === "board" ? <label className={styles.popoverField}>숨긴 보드 그룹<input value={view.board?.hiddenGroupIds.join(", ") ?? ""} onChange={(event) => patch({ board: { hiddenGroupIds: event.target.value.split(",").map((item) => item.trim()).filter(Boolean), cardOrder: view.board?.cardOrder ?? {} } })} /></label> : null}
          {view.type === "timeline" ? <>
            <label className={styles.popoverField}>시작 날짜<PropertySelect label="시작 날짜" value={view.timeline?.startPropertyId ?? ""} placeholder="선택" options={[{ value: "", label: "선택" }, ...definitions.filter((item) => item.type === "date").map((item) => ({ value: item.id, label: item.name }))]} onChange={(propertyId) => { if (propertyId) patch({ timeline: { startPropertyId: propertyId, endPropertyId: null, axisStart: null, axisEnd: null } }); }} /></label>
            <label className={styles.popoverField}>축 시작<input type="date" value={view.timeline?.axisStart ?? ""} onChange={(event) => view.timeline && patch({ timeline: { ...view.timeline, axisStart: event.target.value || null } })} /></label>
          </> : null}
        </div>
      </div>
    </section> : null}
  </div>;
}
