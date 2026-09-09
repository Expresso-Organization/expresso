"use client";

import type { CareerCategory, CareerRecordListItem } from "@expresso/contracts";

import { propertyDefinitionByKey, rawValue } from "./view-types";
import styles from "./views.module.css";

export type CareerQuickFilter = "all" | "draft" | "organized" | "verified" | "incomplete";

export function isIncompleteRecord(record: CareerRecordListItem, category: CareerCategory): boolean {
  if (category.key === "project") {
    const definition = propertyDefinitionByKey(category, "outcome");
    const outcome = definition ? rawValue(record, definition) : null;
    return !(typeof outcome === "string" ? outcome.trim() : outcome);
  }
  return record.isEmpty;
}

export function matchesQuickFilter(record: CareerRecordListItem, category: CareerCategory, filter: CareerQuickFilter): boolean {
  if (filter === "all") return true;
  if (filter === "incomplete") return isIncompleteRecord(record, category);
  return record.status === filter;
}

export function QuickFilterBar({ records, category, value, onChange }: {
  records: readonly CareerRecordListItem[];
  category: CareerCategory;
  value: CareerQuickFilter;
  onChange(next: CareerQuickFilter): void;
}) {
  const choices: Array<{ value: CareerQuickFilter; label: string; count: number }> = [
    { value: "all", label: "전체", count: records.length },
    { value: "draft", label: "초안", count: records.filter((record) => record.status === "draft").length },
    { value: "organized", label: "정리됨", count: records.filter((record) => record.status === "organized").length },
    { value: "verified", label: "검증됨", count: records.filter((record) => record.status === "verified").length },
    { value: "incomplete", label: category.key === "project" ? "성과 비어 있음" : "비어 있음", count: records.filter((record) => isIncompleteRecord(record, category)).length },
  ];
  return <div className={styles.quickFilters} role="toolbar" aria-label="빠른 필터">
    {choices.map((choice) => <button key={choice.value} type="button" aria-label={`${choice.label} ${choice.count}`} aria-pressed={value === choice.value} onClick={() => onChange(choice.value)}>
      <span>{choice.label}</span><small>{choice.count}</small>
    </button>)}
  </div>;
}
