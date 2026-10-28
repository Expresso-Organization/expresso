"use client";

import { CareerPropertyValueV2Schema, type CareerPropertyDefinitionV2, type CareerPropertyValueV2 } from "@expresso/contracts";
import { useEffect, useMemo, useState } from "react";

import { Icon } from "@/components/ui/Icon";

import { commitOnEnter, formatTimestamp, propertyOptions, ReadOnlyValue } from "./property-editors";
import { PropertySelect } from "./PropertySelect";
import styles from "./properties.module.css";

export interface PropertyValueEditorProps {
  definition: CareerPropertyDefinitionV2;
  value: CareerPropertyValueV2 | null;
  onCommit(value: CareerPropertyValueV2 | null): Promise<void>;
  /** 선택 · 다중 선택에 새 옵션을 만들고 그 ID를 돌려준다. 없으면 옵션 추가 칸을 그리지 않는다. */
  onCreateOption?(name: string): Promise<string>;
  disabled?: boolean;
}

const readOnlyTypes = new Set(["formula", "rollup", "relation"]);

function IssueBadge({ issue }: { issue: string | null }) {
  if (!issue) return null;
  return (
    <span className={styles.issueIcon} role="alert" title={issue}>
      <Icon name="warning" size={14} />
      <span className="ex-sr-only">{issue}</span>
    </span>
  );
}

function initialDraft(value: CareerPropertyValueV2 | null): string {
  if (!value) return "";
  if (value.type === "date") return value.value.start;
  if (value.type === "created_time" || value.type === "updated_time") return formatTimestamp(value.value);
  if (Array.isArray(value.value)) return "";
  return String(value.value ?? "");
}

export function PropertyValueEditor({ definition, value, onCommit, onCreateOption, disabled = false }: PropertyValueEditorProps) {
  const [draft, setDraft] = useState(() => initialDraft(value));
  const [dateEnd, setDateEnd] = useState(() => value?.type === "date" ? value.value.end ?? "" : "");
  const [issue, setIssue] = useState<string | null>(null);
  // 새 옵션 이름은 값 초안과 따로 둔다. 값이 바뀔 때 초안을 되돌리는 effect가 입력 중인 이름을 지우지 않게 한다.
  const [optionName, setOptionName] = useState("");
  const [saving, setSaving] = useState(false);
  const options = useMemo(() => propertyOptions(definition), [definition]);
  useEffect(() => { setDraft(initialDraft(value)); setDateEnd(value?.type === "date" ? value.value.end ?? "" : ""); setIssue(null); }, [value]);

  async function commit(next: CareerPropertyValueV2 | null) {
    if (next === null) { setSaving(true); setIssue(null); try { await onCommit(null); } catch (error) { setIssue(error instanceof Error ? error.message : "저장하지 못했습니다."); } finally { setSaving(false); } return; }
    const parsed = CareerPropertyValueV2Schema.safeParse(next);
    if (!parsed.success) { setIssue(parsed.error.issues[0]?.message ?? "값을 확인해 주세요."); return; }
    setSaving(true); setIssue(null);
    try { await onCommit(parsed.data); }
    catch (error) { setIssue(error instanceof Error ? error.message : "저장하지 못했습니다."); }
    finally { setSaving(false); }
  }

  if (readOnlyTypes.has(definition.type) || ((definition.type === "created_time" || definition.type === "updated_time") && definition.system)) return <ReadOnlyValue value={value} computed={definition.type === "formula" || definition.type === "rollup"} />;
  if (definition.type === "created_time" || definition.type === "updated_time") {
    const timestampType = definition.type;
    const commitTimestamp = (nextDraft: string) => {
      if (!nextDraft) return void commit(null);
      if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(nextDraft)) return;
      const timestamp = new Date(nextDraft.replace(" ", "T"));
      if (Number.isNaN(timestamp.getTime())) { setIssue("날짜와 시간을 확인해 주세요."); return; }
      void commit({ type: timestampType, value: timestamp.toISOString() });
    };
    return <div className={styles.fieldEditor}><div className={styles.fieldRow}><input className={styles.input} aria-label={definition.name} type="text" inputMode="numeric" placeholder="YYYY-MM-DD HH:mm" value={draft} disabled={disabled || saving} onChange={(event) => { const nextDraft = event.target.value; setDraft(nextDraft); setIssue(null); commitTimestamp(nextDraft); }} onBlur={() => { if (draft && !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(draft)) setIssue("YYYY-MM-DD HH:mm 형식으로 입력해 주세요."); }} /><IssueBadge issue={issue} /></div></div>;
  }
  if (definition.type === "checkbox") {
    return <label className={styles.checkboxLabel}><input aria-label={definition.name} type="checkbox" checked={value?.type === "checkbox" ? value.value : false} disabled={disabled || saving} onChange={(event) => void commit({ type: "checkbox", value: event.target.checked })} /><span>{value?.type === "checkbox" && value.value ? "예" : "아니요"}</span></label>;
  }
  const optionInput = (choose: (optionId: string) => Promise<void>) => onCreateOption ? <div className={styles.fieldRow}><input className={styles.input} aria-label={`${definition.name} 새 항목`} placeholder="새 항목 입력 후 Enter" value={optionName} disabled={disabled || saving} onChange={(event) => { setOptionName(event.target.value); setIssue(null); }} onKeyDown={(event) => { if (event.nativeEvent.isComposing) return; commitOnEnter(event, () => {
    if (!optionName.trim()) return;
    setSaving(true); setIssue(null);
    void onCreateOption(optionName).then(async (optionId) => { setOptionName(""); setSaving(false); await choose(optionId); }).catch((error: unknown) => { setSaving(false); setIssue(error instanceof Error ? error.message : "항목을 추가하지 못했습니다."); });
  }); }} /><IssueBadge issue={issue} /></div> : null;
  if (definition.type === "select") {
    return <div className={styles.fieldEditor}><PropertySelect
      label={definition.name}
      value={value?.type === "select" ? value.value ?? "" : ""}
      placeholder="선택 안 함"
      disabled={disabled || saving}
      options={[{ value: "", label: "선택 안 함" }, ...options.map((option) => ({ value: option.id, label: option.name }))]}
      onChange={(next) => void commit({ type: "select", value: next || null })}
    />{optionInput((optionId) => commit({ type: "select", value: optionId }))}</div>;
  }
  if (definition.type === "multi_select") {
    const selected = new Set(value?.type === "multi_select" ? value.value : []);
    return <div className={styles.fieldEditor}><div className={styles.multiSelect} aria-label={definition.name}>{options.map((option) => <label key={option.id} className={styles.optionCheck}><input type="checkbox" checked={selected.has(option.id)} disabled={disabled || saving} onChange={() => { const next = new Set(selected); if (next.has(option.id)) next.delete(option.id); else next.add(option.id); void commit({ type: "multi_select", value: [...next] }); }} />{option.name}</label>)}</div>{optionInput((optionId) => commit({ type: "multi_select", value: [...new Set([...selected, optionId])] }))}</div>;
  }
  if (definition.type === "date") {
    const commitDate = () => {
      if (draft === initialDraft(value) && dateEnd === (value?.type === "date" ? value.value.end ?? "" : "")) return;
      return draft ? void commit({ type: "date", value: { start: draft, end: dateEnd || null, timezone: null } }) : void commit(null);
    };
    return <div className={styles.dateFields}><label><span>시작</span><input className={styles.input} aria-label={`${definition.name} 시작`} type="date" value={draft} disabled={disabled || saving} onChange={(event) => setDraft(event.target.value)} onBlur={commitDate} /></label><label><span>종료</span><div className={styles.fieldRow}><input className={styles.input} aria-label={`${definition.name} 종료`} type="date" value={dateEnd} disabled={disabled || saving} onChange={(event) => setDateEnd(event.target.value)} onBlur={commitDate} /><IssueBadge issue={issue} /></div></label></div>;
  }
  if (definition.type === "file" || definition.type === "media") {
    const assetType = definition.type;
    const ids = value?.type === assetType ? value.value : [];
    return <div className={styles.assetEditor}><div className={styles.assetList}>{ids.map((id) => <button key={id} type="button" disabled={disabled || saving} onClick={() => void commit({ type: assetType, value: ids.filter((item) => item !== id) })}>{id.slice(0, 8)} ×</button>)}</div><div className={styles.fieldRow}><input className={styles.input} aria-label={`${definition.name} ID 추가`} placeholder="파일 ID를 붙여 넣고 Enter" value={draft} disabled={disabled || saving} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => commitOnEnter(event, () => { void commit({ type: assetType, value: [...ids, draft] }); setDraft(""); })} /><IssueBadge issue={issue} /></div></div>;
  }

  const inputType = definition.type === "email" ? "email" : definition.type === "url" ? "url" : definition.type === "phone" ? "tel" : "text";
  const commitDraft = () => {
    // 값을 바꾸지 않고 칸을 떠나면 저장하지 않는다. 저장은 기록 버전을 올리고 계산 작업을 부른다.
    if (draft === initialDraft(value)) return;
    if (!draft && !definition.required) return void commit(null);
    if (definition.type === "number") {
      if (draft.trim() === "" || !Number.isFinite(Number(draft))) { setIssue("숫자를 입력해 주세요."); return; }
      return void commit({ type: "number", value: Number(draft) });
    }
    const type = definition.type === "title" ? "title" : definition.type === "url" ? "url" : definition.type === "email" ? "email" : definition.type === "phone" ? "phone" : "text";
    return void commit({ type, value: draft });
  };
  return <div className={styles.fieldEditor}><div className={styles.fieldRow}><input className={styles.input} aria-label={definition.name} type={inputType} inputMode={definition.type === "number" ? "decimal" : undefined} value={draft} disabled={disabled || saving} onChange={(event) => { setDraft(event.target.value); setIssue(null); }} onBlur={commitDraft} onKeyDown={(event) => commitOnEnter(event, commitDraft)} /><IssueBadge issue={issue} /></div></div>;
}
