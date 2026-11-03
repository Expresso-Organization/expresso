"use client";

import type { CareerCategory, CareerViewConfiguration } from "@expresso/contracts";

import { Icon } from "@/components/ui/Icon";
import { PropertySelect } from "@/features/career-editor/properties/PropertySelect";

import { ReorderList } from "./ReorderList";
import { MAX_SORTS, activeDefinitions } from "./view-logic";
import styles from "./views.module.css";

type Sort = CareerViewConfiguration["sorts"][number];

/** 정렬 기준 여러 줄. 위에 있는 기준이 먼저 적용된다. */
export function SortEditor({ category, sorts, onChange }: { category: CareerCategory; sorts: readonly Sort[]; onChange(next: Sort[]): void }) {
  const definitions = activeDefinitions(category);
  const unused = definitions.filter((item) => !sorts.some((sort) => sort.propertyId === item.id));
  const names = new Map(definitions.map((item) => [item.id, item.name]));
  const update = (index: number, patch: Partial<Sort>) => onChange(sorts.map((sort, position) => position === index ? { ...sort, ...patch } : sort));

  return <div className={styles.sortEditor}>
    {sorts.length ? <ReorderList
      label="정렬 기준"
      items={sorts.map((sort, index) => ({
        id: sort.propertyId,
        label: names.get(sort.propertyId) ?? "속성",
        content: <div className={styles.sortRow}>
          <PropertySelect label="정렬 속성" value={sort.propertyId} placeholder="속성" options={definitions.filter((item) => item.id === sort.propertyId || unused.includes(item)).map((item) => ({ value: item.id, label: item.name }))} onChange={(propertyId) => update(index, { propertyId })} />
          <PropertySelect label="정렬 방향" value={sort.direction} placeholder="" options={[{ value: "asc", label: "오름차순" }, { value: "desc", label: "내림차순" }]} onChange={(direction) => update(index, { direction: direction === "desc" ? "desc" : "asc" })} />
          <PropertySelect label="빈 값 위치" value={sort.nulls} placeholder="" options={[{ value: "last", label: "빈 값 끝" }, { value: "first", label: "빈 값 처음" }]} onChange={(nulls) => update(index, { nulls: nulls === "first" ? "first" : "last" })} />
          <button type="button" className={styles.iconButton} aria-label={`${names.get(sort.propertyId) ?? "속성"} 정렬 지우기`} onClick={() => onChange(sorts.filter((_, position) => position !== index))}><Icon name="x" size={13} /></button>
        </div>,
      }))}
      onReorder={(ids) => onChange(ids.flatMap((id) => sorts.filter((sort) => sort.propertyId === id)))}
    /> : null}
    <div className={styles.filterActions}>
      {unused[0] && sorts.length < MAX_SORTS ? <button type="button" onClick={() => onChange([...sorts, { propertyId: unused[0]!.id, direction: "asc", nulls: "last" }])}><Icon name="plus" size={12} />정렬 추가</button> : null}
      {sorts.length ? <button type="button" className={styles.clearViewSetting} onClick={() => onChange([])}>정렬 지우기</button> : null}
    </div>
  </div>;
}
