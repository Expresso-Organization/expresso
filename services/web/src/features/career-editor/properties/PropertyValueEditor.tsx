"use client";

import {
  CareerPropertyValueV2Schema,
  WritableCareerPropertyValueSchema,
  type CareerPropertyDefinitionV2,
} from "@expresso/contracts";
import { useEffect, useMemo, useRef, useState } from "react";

import { Icon } from "@/components/ui/Icon";

import { commitOnEnter, propertyOptions, ReadOnlyValue } from "./property-editors";
import { PropertySelect } from "./PropertySelect";
import type { CareerPropertyEditorValue } from "./canonical-property-values";
import styles from "./properties.module.css";

export interface PropertyValueEditorProps {
  definition: CareerPropertyDefinitionV2;
  value: CareerPropertyEditorValue | null;
  onCommit(value: CareerPropertyEditorValue | null): Promise<void>;
  disabled?: boolean;
}

const readOnlyTypes = new Set(["formula", "rollup", "relation", "file", "media"]);
const plainDecimalPattern = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;

function IssueBadge({ issue }: { issue: string | null }) {
  if (!issue) return null;
  return (
    <span className={styles.issueIcon} role="alert" title={issue}>
      <Icon name="warning" size={14} />
      <span className="ex-sr-only">{issue}</span>
    </span>
  );
}

function initialDraft(value: CareerPropertyEditorValue | null): string {
  if (!value) return "";
  if (value.type === "date") return value.value.start;
  if (value.type === "created_time" || value.type === "updated_time") {
    const timestamp = new Date(value.value);
    const local = new Date(timestamp.getTime() - timestamp.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16).replace("T", " ");
  }
  if (Array.isArray(value.value)) return "";
  return String(value.value ?? "");
}

export function PropertyValueEditor({ definition, value, onCommit, disabled = false }: PropertyValueEditorProps) {
  const [draft, setDraft] = useState(() => initialDraft(value));
  const [dateEnd, setDateEnd] = useState(() => value?.type === "date" ? value.value.end ?? "" : "");
  const [issue, setIssue] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dirty = useRef(false);
  const committing = useRef(false);
  const options = useMemo(() => propertyOptions(definition), [definition]);
  useEffect(() => {
    if (dirty.current || committing.current) return;
    setDraft(initialDraft(value));
    setDateEnd(value?.type === "date" ? value.value.end ?? "" : "");
    setIssue(null);
  }, [saving, value]);

  async function commit(next: CareerPropertyEditorValue | null) {
    if (committing.current) return;
    if (next === null) {
      committing.current = true;
      setSaving(true);
      setIssue(null);
      try { await onCommit(null); dirty.current = false; }
      catch (error) { setIssue(error instanceof Error ? error.message : "저장하지 못했습니다."); }
      finally { committing.current = false; setSaving(false); }
      return;
    }
    const writable = WritableCareerPropertyValueSchema.safeParse({ propertyDefinitionId: definition.id, ...next });
    const legacy = CareerPropertyValueV2Schema.safeParse(next);
    if (!writable.success && !legacy.success) { setIssue(writable.error.issues[0]?.message ?? legacy.error.issues[0]?.message ?? "값을 확인해 주세요."); return; }
    let parsed: CareerPropertyEditorValue;
    if (writable.success) {
      const { propertyDefinitionId: _propertyDefinitionId, ...editorValue } = writable.data;
      parsed = editorValue;
    } else if (legacy.success) {
      parsed = legacy.data;
    } else {
      return;
    }
    committing.current = true;
    setSaving(true); setIssue(null);
    try { await onCommit(parsed); dirty.current = false; }
    catch (error) { setIssue(error instanceof Error ? error.message : "저장하지 못했습니다."); }
    finally { committing.current = false; setSaving(false); }
  }

  if (readOnlyTypes.has(definition.type) || ((definition.type === "created_time" || definition.type === "updated_time") && definition.system)) return <ReadOnlyValue value={value} />;
  if (definition.type === "created_time" || definition.type === "updated_time") {
    const timestampType = definition.type;
    const commitTimestamp = (nextDraft: string) => {
      if (!nextDraft) return void commit(null);
      if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(nextDraft)) return;
      const timestamp = new Date(nextDraft.replace(" ", "T"));
      if (Number.isNaN(timestamp.getTime())) { setIssue("날짜와 시간을 확인해 주세요."); return; }
      void commit({ type: timestampType, value: timestamp.toISOString() });
    };
    return <div className={styles.fieldEditor}><div className={styles.fieldRow}><input className={styles.input} aria-label={definition.name} type="text" inputMode="numeric" placeholder="YYYY-MM-DD HH:mm" value={draft} disabled={disabled || saving} onChange={(event) => { const nextDraft = event.target.value; dirty.current = true; setDraft(nextDraft); setIssue(null); commitTimestamp(nextDraft); }} onBlur={() => { if (draft && !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(draft)) setIssue("YYYY-MM-DD HH:mm 형식으로 입력해 주세요."); }} /><IssueBadge issue={issue} /></div></div>;
  }
  if (definition.type === "checkbox") {
    return <label className={styles.checkboxLabel}><input aria-label={definition.name} type="checkbox" checked={value?.type === "checkbox" ? value.value : false} disabled={disabled || saving} onChange={(event) => void commit({ type: "checkbox", value: event.target.checked })} /><span>{value?.type === "checkbox" && value.value ? "예" : "아니요"}</span></label>;
  }
  if (definition.type === "select") {
    return <PropertySelect
      label={definition.name}
      value={value?.type === "select" ? value.value ?? "" : ""}
      placeholder="선택 안 함"
      disabled={disabled || saving}
      options={[{ value: "", label: "선택 안 함" }, ...options.map((option) => ({ value: option.id, label: option.name }))]}
      onChange={(next) => void commit({ type: "select", value: next || null })}
    />;
  }
  if (definition.type === "multi_select") {
    const selected = new Set(value?.type === "multi_select" ? value.value : []);
    return <div className={styles.multiSelect} aria-label={definition.name}>{options.map((option) => <label key={option.id} className={styles.optionCheck}><input type="checkbox" checked={selected.has(option.id)} disabled={disabled || saving} onChange={() => { const next = new Set(selected); if (next.has(option.id)) next.delete(option.id); else next.add(option.id); void commit({ type: "multi_select", value: [...next] }); }} />{option.name}</label>)}</div>;
  }
  if (definition.type === "date") {
    const currentDate = value?.type === "date" ? value.value : null;
    const precision: "month" | "day" | "datetime" = currentDate && "precision" in currentDate
      ? currentDate.precision as "month" | "day" | "datetime"
      : "day";
    const inputType = precision === "month" ? "month" : precision === "day" ? "date" : "text";
    const commitDate = () => {
      if (!dirty.current) return;
      if (!draft) return void commit(null);
      if (precision === "datetime") {
        const timezone = currentDate && "timezone" in currentDate ? currentDate.timezone : null;
        return void commit({ type: "date", value: { precision, start: draft, end: dateEnd || null, timezone } });
      }
      return void commit({ type: "date", value: { precision, start: draft, end: dateEnd || null } });
    };
    return <div className={styles.dateFields}><label><span>시작</span><input className={styles.input} aria-label={`${definition.name} 시작`} type={inputType} value={draft} disabled={disabled || saving} onChange={(event) => { dirty.current = true; setDraft(event.target.value); }} onBlur={commitDate} /></label><label><span>종료</span><div className={styles.fieldRow}><input className={styles.input} aria-label={`${definition.name} 종료`} type={inputType} value={dateEnd} disabled={disabled || saving} onChange={(event) => { dirty.current = true; setDateEnd(event.target.value); }} onBlur={commitDate} /><IssueBadge issue={issue} /></div></label></div>;
  }
  const inputType = definition.type === "email" ? "email" : definition.type === "url" ? "url" : definition.type === "phone" ? "tel" : "text";
  const commitDraft = () => {
    if (!dirty.current) return;
    if (!draft && !definition.required) return void commit(null);
    if (definition.type === "number") {
      if (!plainDecimalPattern.test(draft)) { setIssue("숫자를 입력해 주세요."); return; }
      return void commit({ type: "number", value: draft });
    }
    const type = definition.type === "title" ? "title" : definition.type === "url" ? "url" : definition.type === "email" ? "email" : definition.type === "phone" ? "phone" : "text";
    return void commit({ type, value: draft });
  };
  return <div className={styles.fieldEditor}><div className={styles.fieldRow}><input className={styles.input} aria-label={definition.name} type={inputType} inputMode={definition.type === "number" ? "decimal" : undefined} value={draft} disabled={disabled || saving} onChange={(event) => { dirty.current = true; setDraft(event.target.value); setIssue(null); }} onBlur={commitDraft} onKeyDown={(event) => commitOnEnter(event, commitDraft)} /><IssueBadge issue={issue} /></div></div>;
}
