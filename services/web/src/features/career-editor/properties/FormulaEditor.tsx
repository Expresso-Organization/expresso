"use client";

import type { CareerFormulaDiagnosticSchema, CareerPropertyDefinitionV2, CareerPropertyValueV2 } from "@expresso/contracts";
import type { z } from "zod";
import { useMemo, useRef, useState, type ReactNode } from "react";

import { findPropertyReferences, formulaForDisplay, formulaForStorage, moveOffset } from "./formula-source";
import { ReadOnlyValue } from "./property-editors";
import styles from "./properties.module.css";

type FormulaDiagnostic = z.infer<typeof CareerFormulaDiagnosticSchema>;

export interface FormulaPreview {
  diagnostics: FormulaDiagnostic[];
  value: CareerPropertyValueV2 | null;
  dependencies: string[];
}

const FORMULA_SOURCE_LIMIT = 4_000;

/**
 * 저장 원문은 `prop("<UUID>")`이고, 편집 칸은 `prop("<이름>")`을 보인다.
 * `preview` · `onCommit`은 저장 원문만 받는다. 속성 이름을 바꿔도 저장된 수식은 그대로다.
 */
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
  const [initial] = useState(() => formulaForDisplay(source, properties));
  const [draft, setDraft] = useState(initial.text);
  const [result, setResult] = useState<FormulaPreview>(() => ({
    diagnostics: diagnostics.map((diagnostic) => ({ ...diagnostic, start: moveOffset(diagnostic.start, initial.replacements), end: moveOffset(diagnostic.end, initial.replacements) })),
    value,
    dependencies: [],
  }));
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState<string | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const live = useMemo(() => properties.filter((property) => property.deletedAt === null), [properties]);
  const insertable = useMemo(() => live.filter((property) => property.type !== "formula"), [live]);
  const stored = useMemo(() => formulaForStorage(draft, properties), [draft, properties]);

  function insertProperty(property: CareerPropertyDefinitionV2) {
    const input = textarea.current;
    const unique = live.filter((item) => item.name === property.name).length === 1;
    const reference = `prop(${JSON.stringify(unique ? property.name : property.id)})`;
    const start = input?.selectionStart ?? draft.length;
    const end = input?.selectionEnd ?? draft.length;
    setDraft(`${draft.slice(0, start)}${reference}${draft.slice(end)}`);
    setIssue(null);
    queueMicrotask(() => {
      input?.focus();
      input?.setSelectionRange(start + reference.length, start + reference.length);
    });
  }

  /** 이름을 UUID로 되돌려 서버에 묻는다. 진단 위치는 편집 칸 기준으로 되돌려 보인다. */
  async function check(): Promise<FormulaPreview | null> {
    if (stored.diagnostics.length > 0) {
      setResult({ diagnostics: stored.diagnostics, value: null, dependencies: [] });
      return null;
    }
    const next = await preview(stored.text);
    const shown = { ...next, diagnostics: next.diagnostics.map((diagnostic) => ({ ...diagnostic, start: moveOffset(diagnostic.start, stored.replacements, "backward"), end: moveOffset(diagnostic.end, stored.replacements, "backward") })) };
    setResult(shown);
    return shown;
  }

  async function runPreview() {
    setBusy(true); setIssue(null);
    try { await check(); }
    catch (error) { setIssue(error instanceof Error ? error.message : "수식을 확인하지 못했습니다."); }
    finally { setBusy(false); }
  }

  async function save() {
    setBusy(true); setIssue(null);
    try {
      const next = await check();
      if (!next || next.diagnostics.some((diagnostic) => diagnostic.severity === "error")) return;
      await onCommit(stored.text);
    } catch (error) { setIssue(error instanceof Error ? error.message : "수식을 저장하지 못했습니다."); }
    finally { setBusy(false); }
  }

  return <div className={styles.formulaEditor}>
    <label htmlFor="career-formula-source">수식</label>
    <div className={styles.formulaField}>
      <div ref={backdrop} className={styles.formulaBackdrop} aria-hidden="true">{highlighted(draft, live)}</div>
      <textarea id="career-formula-source" ref={textarea} className={styles.formulaSource} value={draft} spellCheck={false} onScroll={(event) => { if (backdrop.current) backdrop.current.scrollTop = event.currentTarget.scrollTop; }} onChange={(event) => { setDraft(event.target.value); setIssue(null); }} />
    </div>
    <div className={styles.propertyAutocomplete} aria-label="속성 자동완성">
      {insertable.map((property) => <button key={property.id} type="button" onClick={() => insertProperty(property)}>{property.name}</button>)}
    </div>
    <div className={styles.formulaActions}><span data-over={stored.text.length > FORMULA_SOURCE_LIMIT || undefined}>{stored.text.length.toLocaleString()} / {FORMULA_SOURCE_LIMIT.toLocaleString()}</span><button type="button" disabled={busy} onClick={() => void runPreview()}>미리 보기</button><button type="button" disabled={busy || draft === initial.text} onClick={() => void save()}>수식 저장</button></div>
    {result.diagnostics.length > 0 ? <ul className={styles.formulaDiagnostics} aria-label="수식 진단">{result.diagnostics.map((diagnostic, index) => <li key={`${diagnostic.code}-${index}`} data-severity={diagnostic.severity}><strong>{diagnostic.code}</strong> {diagnostic.message}<span>{diagnostic.start + 1}–{diagnostic.end + 1}</span></li>)}</ul> : <p className={styles.formulaValid} role="status">수식이 유효합니다.</p>}
    {result.value ? <div className={styles.computedPreview}><span>계산 결과</span><ReadOnlyValue value={result.value} /></div> : null}
    {issue ? <p className={styles.issue} role="alert">{issue}</p> : null}
  </div>;
}

/** 편집 칸과 같은 글자를 그리고, 이름으로 풀리는 `prop("…")`만 `<mark>`로 칠한다. */
function highlighted(draft: string, live: readonly CareerPropertyDefinitionV2[]): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const reference of findPropertyReferences(draft)) {
    if (live.filter((property) => property.name === reference.value).length !== 1) continue;
    nodes.push(draft.slice(cursor, reference.start), <mark key={reference.start} className={styles.formulaToken}>{draft.slice(reference.start, reference.end)}</mark>);
    cursor = reference.end;
  }
  // 끝의 줄바꿈은 textarea처럼 빈 줄 높이를 갖도록 글자 하나를 덧붙인다.
  nodes.push(`${draft.slice(cursor)}${draft.endsWith("\n") ? " " : ""}`);
  return nodes;
}
