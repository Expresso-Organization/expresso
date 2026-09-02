"use client";

import type { CareerFormulaDiagnosticSchema, CareerPropertyDefinitionV2, CareerPropertyValueV2, CareerRollupAggregation } from "@expresso/contracts";
import type { z } from "zod";
import { useMemo, useState } from "react";

import { ReadOnlyValue } from "./property-editors";
import { PropertySelect } from "./PropertySelect";
import styles from "./properties.module.css";

type FormulaDiagnostic = z.infer<typeof CareerFormulaDiagnosticSchema>;
export interface RollupConfiguration { relationPropertyId: string; targetPropertyId: string; aggregation: CareerRollupAggregation }
export interface RollupPreview { diagnostics: FormulaDiagnostic[]; value: CareerPropertyValueV2 | null }

const AGGREGATIONS: Array<{ value: CareerRollupAggregation; label: string }> = [
  { value: "count", label: "개수" }, { value: "unique_count", label: "고유 값 개수" },
  { value: "sum", label: "합계" }, { value: "average", label: "평균" }, { value: "min", label: "최솟값" },
  { value: "max", label: "최댓값" }, { value: "earliest", label: "가장 이른 날짜" }, { value: "latest", label: "가장 늦은 날짜" },
  { value: "percent_checked", label: "체크 비율" }, { value: "show_unique", label: "고유 값 표시" },
];

export function RollupEditor({ configuration, properties, targetProperties, preview, onCommit, value = null }: {
  configuration: RollupConfiguration | null;
  properties: readonly CareerPropertyDefinitionV2[];
  targetProperties: readonly CareerPropertyDefinitionV2[] | ((relationPropertyId: string) => readonly CareerPropertyDefinitionV2[]);
  preview(configuration: RollupConfiguration): Promise<RollupPreview>;
  onCommit(configuration: RollupConfiguration): Promise<void>;
  value?: CareerPropertyValueV2 | null;
}) {
  const relations = useMemo(() => properties.filter((property) => property.deletedAt === null && property.type === "relation"), [properties]);
  const initialRelationId = configuration?.relationPropertyId ?? relations[0]?.id ?? "";
  const initialTargets = typeof targetProperties === "function" ? targetProperties(initialRelationId) : targetProperties;
  const [draft, setDraft] = useState<RollupConfiguration>(configuration ?? { relationPropertyId: initialRelationId, targetPropertyId: initialTargets.find((property) => property.deletedAt === null && !["relation", "rollup"].includes(property.type))?.id ?? "", aggregation: "count" });
  const targets = useMemo(() => (typeof targetProperties === "function" ? targetProperties(draft.relationPropertyId) : targetProperties).filter((property) => property.deletedAt === null && !["relation", "rollup"].includes(property.type)), [draft.relationPropertyId, targetProperties]);
  const [result, setResult] = useState<RollupPreview>({ diagnostics: [], value });
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState<string | null>(null);
  const complete = Boolean(draft.relationPropertyId && draft.targetPropertyId);

  async function validate(commit: boolean) {
    if (!complete) return;
    setBusy(true); setIssue(null);
    try {
      const next = await preview(draft);
      setResult(next);
      if (commit && !next.diagnostics.some((diagnostic) => diagnostic.severity === "error")) await onCommit(draft);
    } catch (error) { setIssue(error instanceof Error ? error.message : "롤업을 확인하지 못했습니다."); }
    finally { setBusy(false); }
  }

  return <div className={styles.rollupEditor}>
    <label>관계<PropertySelect label="관계" value={draft.relationPropertyId} placeholder="관계를 선택하세요" options={relations.map((property) => ({ value: property.id, label: property.name }))} onChange={(relationPropertyId) => { const available = typeof targetProperties === "function" ? targetProperties(relationPropertyId) : targetProperties; setDraft((current) => ({ ...current, relationPropertyId, targetPropertyId: available.find((property) => property.deletedAt === null && !["relation", "rollup"].includes(property.type))?.id ?? "" })); }} /></label>
    <label>대상 속성<PropertySelect label="대상 속성" value={draft.targetPropertyId} placeholder="속성을 선택하세요" options={targets.map((property) => ({ value: property.id, label: property.name }))} onChange={(targetPropertyId) => setDraft((current) => ({ ...current, targetPropertyId }))} /></label>
    <label>집계<PropertySelect label="집계" value={draft.aggregation} placeholder="집계를 선택하세요" options={AGGREGATIONS} onChange={(aggregation) => setDraft((current) => ({ ...current, aggregation: aggregation as CareerRollupAggregation }))} /></label>
    <div className={styles.formulaActions}><button type="button" disabled={busy || !complete} onClick={() => void validate(false)}>미리 보기</button><button type="button" disabled={busy || !complete} onClick={() => void validate(true)}>롤업 저장</button></div>
    {result.diagnostics.length > 0 ? <ul className={styles.formulaDiagnostics} aria-label="롤업 진단">{result.diagnostics.map((diagnostic, index) => <li key={`${diagnostic.code}-${index}`} data-severity={diagnostic.severity}>{diagnostic.message}</li>)}</ul> : null}
    {result.value ? <div className={styles.computedPreview}><span>계산 결과</span><ReadOnlyValue value={result.value} /></div> : null}
    {issue ? <p className={styles.issue} role="alert">{issue}</p> : null}
  </div>;
}
