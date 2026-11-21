"use client";

import type { CareerRecordListItem } from "@expresso/contracts";

import { isIncompleteRecord, type CareerQuickFilter } from "./QuickFilterBar";
import styles from "./views.module.css";

/**
 * 표 아래 집계 줄 — 정의서 05의 「8개 · 초안 3 · 비어 있음 1」과 「합계 계산」.
 *
 * 숫자를 누르면 그 조건만 남는다. 0인 칸은 적지 않는다 — 「초안 0」은 알려 주는
 * 것이 없으면서 줄만 길게 만든다.
 */
export function RecordSummaryBar({ records, categoryKey, filter, onFilterChange, aggregate, onAggregateChange, partial = false }: {
  records: readonly CareerRecordListItem[];
  categoryKey: string;
  filter: CareerQuickFilter;
  onFilterChange(next: CareerQuickFilter): void;
  partial?: boolean;
  aggregate: boolean;
  onAggregateChange(next: boolean): void;
}) {
  const draft = records.filter((record) => record.status === "draft").length;
  const incomplete = records.filter((record) => isIncompleteRecord(record, categoryKey)).length;
  const incompleteLabel = categoryKey === "project" ? "성과 수치 없음" : "비어 있음";
  const segments: Array<{ value: CareerQuickFilter; label: string; count: number }> = [
    ...(["organized", "verified"] as const).map((value) => ({ value, label: value === "organized" ? "정리됨" : "검증됨", count: records.filter((record) => record.status === value).length })).filter((segment) => segment.count > 0),
    ...(draft ? [{ value: "draft" as const, label: "초안", count: draft }] : []),
    ...(incomplete ? [{ value: "incomplete" as const, label: incompleteLabel, count: incomplete }] : []),
  ];

  const toggle = (next: CareerQuickFilter) => onFilterChange(filter === next ? "all" : next);

  return (
    <div className={styles.recordSummary} role="toolbar" aria-label="기록 집계">
      <button type="button" className={styles.summaryTotal} aria-pressed={filter === "all"} onClick={() => onFilterChange("all")}>
        {partial ? "불러온 " : ""}{records.length}개
      </button>
      {segments.map((segment) => (
        <span key={segment.value} className={styles.summarySegment}>
          <span className={styles.summaryDivider} aria-hidden="true">·</span>
          <button type="button" aria-pressed={filter === segment.value} onClick={() => toggle(segment.value)}>
            {segment.label} {segment.count}
          </button>
        </span>
      ))}
      <button type="button" className={styles.summaryAggregate} aria-pressed={aggregate} onClick={() => onAggregateChange(!aggregate)}>
        합계 계산
      </button>
    </div>
  );
}
