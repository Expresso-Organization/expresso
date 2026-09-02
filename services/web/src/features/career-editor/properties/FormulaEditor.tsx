"use client";

import type { CareerFormulaDiagnosticSchema, CareerPropertyDefinitionV2, CareerPropertyValueV2 } from "@expresso/contracts";
import type { z } from "zod";
import { useMemo, useRef, useState } from "react";

import { ReadOnlyValue } from "./property-editors";
import styles from "./properties.module.css";

type FormulaDiagnostic = z.infer<typeof CareerFormulaDiagnosticSchema>;

export interface FormulaPreview {
  diagnostics: FormulaDiagnostic[];
  value: CareerPropertyValueV2 | null;
  dependencies: string[];
}

export function FormulaEditor({
  source,
  properties,
  preview,
  onCommit,
  value = null,
  diagnostics = [],
}: {
  source: string;
  properties: readonly CareerPropertyDefinitionV2[];
  preview(source: string): Promise<FormulaPreview>;
  onCommit(source: string): Promise<void>;
  value?: CareerPropertyValueV2 | null;
  diagnostics?: readonly FormulaDiagnostic[];
}) {
  const [draft, setDraft] = useState(source);
  const [result, setResult] = useState<FormulaPreview>({ diagnostics: [...diagnostics], value, dependencies: [] });
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState<string | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const activeProperties = useMemo(() => properties.filter((property) => property.deletedAt === null && property.type !== "formula"), [properties]);

  function insertProperty(property: CareerPropertyDefinitionV2) {
    const input = textarea.current;
    const reference = `prop("${property.id}")`;
    const start = input?.selectionStart ?? draft.length;
    const end = input?.selectionEnd ?? draft.length;
    const next = `${draft.slice(0, start)}${reference}${draft.slice(end)}`;
    setDraft(next);
    queueMicrotask(() => {
      input?.focus();
      input?.setSelectionRange(start + reference.length, start + reference.length);
    });
  }

  async function runPreview() {
    setBusy(true); setIssue(null);
    try { setResult(await preview(draft)); }
    catch (error) { setIssue(error instanceof Error ? error.message : "수식을 확인하지 못했습니다."); }
    finally { setBusy(false); }
  }

  async function save() {
    setBusy(true); setIssue(null);
    try {
      const next = await preview(draft);
      setResult(next);
      if (next.diagnostics.some((diagnostic) => diagnostic.severity === "error")) return;
      await onCommit(draft);
    } catch (error) { setIssue(error instanceof Error ? error.message : "수식을 저장하지 못했습니다."); }
    finally { setBusy(false); }
  }

  return <div className={styles.formulaEditor}>
    <label htmlFor="career-formula-source">수식</label>
    <textarea id="career-formula-source" ref={textarea} className={styles.formulaSource} value={draft} maxLength={4_000} spellCheck={false} onChange={(event) => { setDraft(event.target.value); setIssue(null); }} />
    <div className={styles.propertyAutocomplete} aria-label="속성 자동완성">
      {activeProperties.map((property) => <button key={property.id} type="button" onClick={() => insertProperty(property)}>{property.name}<small>{property.id}</small></button>)}
    </div>
    <div className={styles.formulaActions}><span>{draft.length.toLocaleString()} / 4,000</span><button type="button" disabled={busy} onClick={() => void runPreview()}>미리 보기</button><button type="button" disabled={busy || draft === source} onClick={() => void save()}>수식 저장</button></div>
    {result.diagnostics.length > 0 ? <ul className={styles.formulaDiagnostics} aria-label="수식 진단">{result.diagnostics.map((diagnostic, index) => <li key={`${diagnostic.code}-${index}`} data-severity={diagnostic.severity}><strong>{diagnostic.code}</strong> {diagnostic.message}<span>{diagnostic.start + 1}–{diagnostic.end + 1}</span></li>)}</ul> : <p className={styles.formulaValid} role="status">수식이 유효합니다.</p>}
    {result.value ? <div className={styles.computedPreview}><span>계산 결과</span><ReadOnlyValue value={result.value} /></div> : null}
    {issue ? <p className={styles.issue} role="alert">{issue}</p> : null}
  </div>;
}
