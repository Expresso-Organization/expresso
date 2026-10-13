"use client";

import { CareerBusinessPropertyValueSchema, CareerPropertyValueV2Schema, type CareerBusinessPropertyValue, type CareerPropertyDefinitionV2 } from "@expresso/contracts";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { PropertyValueEditor } from "./PropertyValueEditor";
import { PropertySelect } from "./PropertySelect";
import { commitOnEnter, propertyOptions } from "./property-editors";
import styles from "./properties.module.css";

export function CanonicalPropertyValueEditor({ definition, value, onCommit, onEnsureOption, disabled = false }: {
  definition: CareerPropertyDefinitionV2;
  value: CareerBusinessPropertyValue | null;
  onCommit(value: CareerBusinessPropertyValue | null): Promise<void>;
  disabled?: boolean;
  onEnsureOption?(label: string): Promise<{ id: string; name: string }>;
}) {
  const range = value?.type === "date" ? value.value : null;
  const [draft, setDraft] = useState(() => value && typeof value.value === "string" ? value.value : range?.start ?? "");
  const [end, setEnd] = useState(() => range?.end ?? "");
  const [precision, setPrecision] = useState<"month" | "day" | "datetime">(() => range?.precision ?? "day");
  const [timezone, setTimezone] = useState(() => range?.precision === "datetime" ? range.timezone ?? "" : "");
  const [addedOptions, setAddedOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [issue, setIssue] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const next = value?.type === "date" ? value.value : null;
    setDraft(value && typeof value.value === "string" ? value.value : next?.start ?? "");
    setEnd(next?.end ?? "");
    setPrecision(next?.precision ?? "day");
    setTimezone(next?.precision === "datetime" ? next.timezone ?? "" : "");
    setIssue("");
  }, [value]);

  async function commit(next: unknown) {
    const parsed = next === null ? null : CareerBusinessPropertyValueSchema.safeParse(next);
    if (parsed && !parsed.success) { setIssue(definition.type === "number" ? "숫자를 입력해 주세요." : "날짜와 시간을 확인해 주세요."); return; }
    setSaving(true); setIssue("");
    try { await onCommit(parsed?.data ?? null); }
    catch (error) { setIssue(error instanceof Error ? error.message : "저장하지 못했습니다."); }
    finally { setSaving(false); }
  }
  const issueBadge = issue ? <span className={styles.issueIcon} role="alert" title={issue}><Icon name="warning" size={14} /><span className="ex-sr-only">{issue}</span></span> : null;
  if (definition.type === "number") {
    const save = () => void commit(!draft && !definition.required ? null : { propertyDefinitionId: definition.id, type: "number", value: draft });
    return <div className={styles.fieldEditor}><div className={styles.fieldRow}><input className={styles.input} aria-label={definition.name} type="text" inputMode="decimal" value={draft} disabled={disabled || saving} onChange={(event) => { setDraft(event.target.value); setIssue(""); }} onBlur={save} onKeyDown={(event) => commitOnEnter(event, save)} />{issueBadge}</div></div>;
  }
  if (["text", "url", "email", "phone"].includes(definition.type)) {
    const inputType = definition.type === "email" ? "email" : definition.type === "url" ? "url" : definition.type === "phone" ? "tel" : "text";
    const save = () => void commit(!draft && !definition.required ? null : { propertyDefinitionId: definition.id, type: definition.type, value: draft });
    return <div className={styles.fieldEditor}><div className={styles.fieldRow}><input className={styles.input} aria-label={definition.name} type={inputType} value={draft} disabled={disabled || saving} onChange={(event) => { setDraft(event.target.value); setIssue(""); }} onBlur={save} onKeyDown={(event) => commitOnEnter(event, save)} />{issueBadge}</div></div>;
  }
  if (definition.type === "created_time" || definition.type === "updated_time") {
    const save = (next: string) => {
      if (!next) return void commit(null);
      let start = next;
      if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(next)) {
        const timestamp = new Date(next.replace(" ", "T"));
        if (Number.isNaN(timestamp.getTime())) { setIssue("날짜와 시간을 확인해 주세요."); return; }
        start = timestamp.toISOString();
      }
      void commit({ propertyDefinitionId: definition.id, type: "date", value: { precision: "datetime", start, end: null, timezone: range?.precision === "datetime" ? range.timezone : null } });
    };
    return <div className={styles.fieldEditor}><div className={styles.fieldRow}><input className={styles.input} aria-label={definition.name} type="text" placeholder="YYYY-MM-DD HH:mm" value={draft} disabled={disabled || saving} onChange={(event) => { const next = event.target.value; setDraft(next); setIssue(""); if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(next)) save(next); }} onBlur={() => { if (draft !== range?.start) save(draft); }} onKeyDown={(event) => commitOnEnter(event, () => save(draft))} />{issueBadge}</div></div>;
  }
  if (definition.type === "date") {
    const save = () => void commit(!draft ? null : { propertyDefinitionId: definition.id, type: "date", value: precision === "datetime" ? { precision, start: draft, end: end || null, timezone: timezone || null } : { precision, start: draft, end: end || null } });
    const inputType = precision === "month" ? "month" : precision === "day" ? "date" : "text";
    return <div className={styles.fieldEditor}>
      <PropertySelect label={definition.name + " 정밀도"} value={precision} placeholder="날짜 정밀도" options={[{ value: "month", label: "월" }, { value: "day", label: "일" }, { value: "datetime", label: "날짜와 시간" }]} disabled={disabled || saving} onChange={(next) => { setPrecision(next as typeof precision); setIssue(""); }} />
      <div className={styles.dateFields}><label><span>시작</span><input className={styles.input} aria-label={definition.name + " 시작"} type={inputType} value={draft} disabled={disabled || saving} onChange={(event) => setDraft(event.target.value)} onBlur={save} /></label><label><span>종료</span><div className={styles.fieldRow}><input className={styles.input} aria-label={definition.name + " 종료"} type={inputType} value={end} disabled={disabled || saving} onChange={(event) => setEnd(event.target.value)} onBlur={save} />{issueBadge}</div></label></div>
      {precision === "datetime" ? <label><span>시간대</span><input className={styles.input} aria-label={definition.name + " 시간대"} type="text" value={timezone} disabled={disabled || saving} onChange={(event) => setTimezone(event.target.value)} onBlur={save} /></label> : null}
    </div>;
  }
  if (definition.type === "multi_select" && definition.config.legacyFreeformTags === true) {
    const ids = value?.type === "multi_select" ? value.value : [];
    const options = [...propertyOptions(definition), ...addedOptions];
    const add = async () => {
      if (draft === "" || disabled || saving) return;
      setSaving(true); setIssue("");
      try {
        const existing = options.find((option) => option.name === draft);
        if (!existing && !onEnsureOption) throw new Error("태그를 등록하지 못했습니다.");
        const option = existing ?? await onEnsureOption!(draft);
        setAddedOptions((previous) => previous.some((item) => item.id === option.id) ? previous : [...previous, option]);
        await onCommit(CareerBusinessPropertyValueSchema.parse({ propertyDefinitionId: definition.id, type: "multi_select", value: ids.includes(option.id) ? ids : [...ids, option.id] }));
        setDraft("");
      } catch (error) { setIssue(error instanceof Error ? error.message : "태그를 등록하지 못했습니다."); }
      finally { setSaving(false); }
    };
    return <div className={styles.assetEditor}>
      <div className={styles.assetList}>{ids.map((id) => { const label = options.find((option) => option.id === id)?.name ?? id; return <button key={id} type="button" aria-label={label + " 태그 삭제"} disabled={disabled || saving} onClick={() => void commit({ propertyDefinitionId: definition.id, type: "multi_select", value: ids.filter((item) => item !== id) })}>{label} ×</button>; })}</div>
      <div className={styles.fieldRow}><input className={styles.input} aria-label={definition.name + " 태그 추가"} type="text" placeholder="태그를 입력하고 Enter" value={draft} disabled={disabled || saving} onChange={(event) => { setDraft(event.target.value); setIssue(""); }} onKeyDown={(event) => commitOnEnter(event, () => void add())} />{issueBadge}</div>
    </div>;
  }
  const legacy = value === null ? null : CareerPropertyValueV2Schema.parse({ type: value.type, value: value.value });
  return <PropertyValueEditor definition={definition} value={legacy} disabled={disabled} onCommit={async (next) => {
    if (next === null) return onCommit(null);
    await onCommit(CareerBusinessPropertyValueSchema.parse({ ...next, propertyDefinitionId: definition.id }));
  }} />;
}
