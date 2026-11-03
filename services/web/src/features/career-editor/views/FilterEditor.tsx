"use client";

import type { CareerCategory, CareerPropertyDefinitionV2 } from "@expresso/contracts";
import { useState } from "react";

import { Icon } from "@/components/ui/Icon";
import { propertyOptions } from "@/features/career-editor/properties/property-editors";
import { PropertySelect } from "@/features/career-editor/properties/PropertySelect";

import { MAX_FILTER_LEAVES, OPERATOR_LABELS, defaultLeaf, definitionById, filterRoot, filterableDefinitions, isGroup, leafCount, needsOperand, normalizeFilter, operandFor, operandText, operatorsFor, type FilterGroup, type FilterLeaf, type FilterNode } from "./view-logic";
import styles from "./views.module.css";

const CONJUNCTIONS = [{ value: "and", label: "그리고" }, { value: "or", label: "또는" }];

/** 입력 중에는 글자를 그대로 두고, 바뀔 때마다 operand로 바꿔 올린다. */
function OperandInput({ definition, leaf, onChange }: { definition: CareerPropertyDefinitionV2; leaf: FilterLeaf; onChange(next: FilterLeaf): void }) {
  const [draft, setDraft] = useState(() => operandText(leaf.operand));
  const label = `${definition.name} 값`;
  if (definition.type === "select" || definition.type === "multi_select") {
    const options = propertyOptions(definition).map((option) => ({ value: option.id, label: option.name }));
    return <PropertySelect label={label} value={operandText(leaf.operand)} placeholder="값 고르기" options={options} onChange={(value) => onChange({ ...leaf, operand: operandFor(definition, value) })} />;
  }
  if (definition.type === "checkbox") {
    return <PropertySelect label={label} value={operandText(leaf.operand) || "true"} placeholder="값 고르기" options={[{ value: "true", label: "선택됨" }, { value: "false", label: "선택 안 됨" }]} onChange={(value) => onChange({ ...leaf, operand: operandFor(definition, value === "true") })} />;
  }
  return <input
    aria-label={label}
    className={styles.filterValue}
    type={definition.type === "number" ? "number" : definition.type === "date" ? "date" : "text"}
    value={draft}
    placeholder="값"
    onChange={(event) => { setDraft(event.target.value); onChange({ ...leaf, operand: operandFor(definition, event.target.value) }); }}
  />;
}

function LeafRow({ leaf, definitions, category, onChange, onRemove }: { leaf: FilterLeaf; definitions: readonly CareerPropertyDefinitionV2[]; category: CareerCategory; onChange(next: FilterLeaf): void; onRemove(): void }) {
  const definition = definitionById(category, leaf.propertyId);
  if (!definition) return null;
  const operators = operatorsFor(definition);
  return <div className={styles.filterLeaf}>
    <PropertySelect label="조건 속성" value={leaf.propertyId} placeholder="속성" options={definitions.map((item) => ({ value: item.id, label: item.name }))} onChange={(propertyId) => { const next = definitionById(category, propertyId); if (next) onChange(defaultLeaf(next)); }} />
    <PropertySelect label="조건 연산자" value={leaf.operator} placeholder="연산자" options={operators.map((operator) => ({ value: operator, label: OPERATOR_LABELS[operator] }))} onChange={(operator) => onChange({ ...leaf, operator: operator as FilterLeaf["operator"], operand: needsOperand(operator as FilterLeaf["operator"]) ? leaf.operand : null })} />
    {needsOperand(leaf.operator) ? <OperandInput key={leaf.propertyId} definition={definition} leaf={leaf} onChange={onChange} /> : <span />}
    <button type="button" className={styles.iconButton} aria-label={`${definition.name} 조건 지우기`} onClick={onRemove}><Icon name="x" size={13} /></button>
  </div>;
}

function Conjunction({ index, group, onChange }: { index: number; group: FilterGroup; onChange(operator: FilterGroup["operator"]): void }) {
  if (index === 0) return <span className={styles.filterConjunction} />;
  if (index === 1) return <span className={styles.filterConjunction}><PropertySelect label="조건 묶는 방법" value={group.operator} placeholder="" options={CONJUNCTIONS} onChange={(value) => onChange(value === "or" ? "or" : "and")} /></span>;
  return <span className={styles.filterConjunction} data-muted="true">{group.operator === "or" ? "또는" : "그리고"}</span>;
}

/** 조건 줄과 한 단계 아래 조건 묶음. 저장 모양은 계약의 필터 tree다. */
export function FilterEditor({ category, filter, onChange }: { category: CareerCategory; filter: unknown; onChange(next: FilterGroup | null): void }) {
  const definitions = filterableDefinitions(category);
  const root = filterRoot(filter);
  const full = leafCount(root) >= MAX_FILTER_LEAVES;
  const first = definitions[0];
  const commit = (next: FilterGroup) => onChange(normalizeFilter(next));
  const replace = (group: FilterGroup, index: number, node: FilterNode | null): FilterGroup => ({ ...group, filters: node ? group.filters.map((item, position) => position === index ? node : item) : group.filters.filter((_, position) => position !== index) });

  function rows(group: FilterGroup, update: (next: FilterGroup) => void) {
    return group.filters.map((node, index) => <div className={styles.filterRow} key={index}>
      <Conjunction index={index} group={group} onChange={(operator) => update({ ...group, operator })} />
      {isGroup(node)
        ? <div className={styles.filterGroup} role="group" aria-label="조건 묶음">
          {rows(node, (next) => update(replace(group, index, next.filters.length ? next : null)))}
          <div className={styles.filterActions}>
            {first ? <button type="button" disabled={full} onClick={() => update(replace(group, index, { ...node, filters: [...node.filters, defaultLeaf(first)] }))}><Icon name="plus" size={12} />조건 추가</button> : null}
            <button type="button" className={styles.iconButton} aria-label="조건 묶음 지우기" onClick={() => update(replace(group, index, null))}><Icon name="trash" size={13} /></button>
          </div>
        </div>
        : <LeafRow leaf={node} definitions={definitions} category={category} onChange={(next) => update(replace(group, index, next))} onRemove={() => update(replace(group, index, null))} />}
    </div>);
  }

  return <div className={styles.filterEditor}>
    {root.filters.length ? <div className={styles.filterRows}>{rows(root, commit)}</div> : null}
    <div className={styles.filterActions}>
      {first ? <button type="button" disabled={full} onClick={() => commit({ ...root, filters: [...root.filters, defaultLeaf(first)] })}><Icon name="plus" size={12} />조건 추가</button> : null}
      {first ? <button type="button" disabled={full} onClick={() => commit({ ...root, filters: [...root.filters, { operator: "or", filters: [defaultLeaf(first)] }] })}><Icon name="brackets-square" size={12} />조건 묶음 추가</button> : null}
      {root.filters.length ? <button type="button" className={styles.clearViewSetting} onClick={() => onChange(null)}>필터 지우기</button> : null}
    </div>
  </div>;
}
