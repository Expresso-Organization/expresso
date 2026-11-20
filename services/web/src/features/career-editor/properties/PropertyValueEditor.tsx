"use client";

import { CareerPropertyValueV2Schema, type CareerPropertyDefinitionV2, type CareerPropertyValueV2 } from "@expresso/contracts";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";

import { Icon } from "@/components/ui/Icon";
import { DatePopout, OptionPopout } from "@/features/career-editor/views/ValuePopouts";
import { formatPeriodRange } from "@/features/career-editor/views/view-logic";

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

/**
 * 값을 글자로 보이고, 누르면 그 자리에 고르는 팝업을 여는 칸입니다.
 * 브라우저 기본 컨트롤(체크박스 목록 · 날짜 입력) 대신 표 셀과 같은 팝업을 쓰게 합니다.
 */
function PopoutField({ label, display, empty, disabled, issue, children }: { label: string; display: ReactNode; empty: boolean; disabled: boolean; issue: string | null; children(anchorRef: RefObject<HTMLButtonElement | null>, close: () => void): ReactNode }) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const close = useCallback(() => setOpen(false), []);
  return <div className={styles.fieldRow}>
    <button ref={anchorRef} type="button" className={styles.valueTrigger} aria-label={label} aria-haspopup="dialog" aria-expanded={open} data-empty={empty ? "true" : "false"} disabled={disabled} onClick={() => setOpen((current) => !current)}>{display}</button>
    <IssueBadge issue={issue} />
    {open ? children(anchorRef, close) : null}
  </div>;
}

function initialDraft(value: CareerPropertyValueV2 | null): string {
  if (!value) return "";
  if (value.type === "created_time" || value.type === "updated_time") return formatTimestamp(value.value);
  if (Array.isArray(value.value)) return "";
  return String(value.value ?? "");
}

export function PropertyValueEditor({ definition, value, onCommit, onCreateOption, disabled = false }: PropertyValueEditorProps) {
  const [draft, setDraft] = useState(() => initialDraft(value));
  const [issue, setIssue] = useState<string | null>(null);
  // 새 옵션 이름은 값 초안과 따로 둔다. 값이 바뀔 때 초안을 되돌리는 effect가 입력 중인 이름을 지우지 않게 한다.
  const [optionName, setOptionName] = useState("");
  const [saving, setSaving] = useState(false);
  const options = useMemo(() => propertyOptions(definition), [definition]);
  useEffect(() => { setDraft(initialDraft(value)); setIssue(null); }, [value]);

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
    // 표 셀과 같은 옵션 팝업을 연다. 값은 칩으로 보인다(화면 정의서 05 · 05b의 역량 칸).
    const labels = new Map(options.map((option) => [option.id, option.name]));
    const chosen = value?.type === "multi_select" ? value.value.flatMap((id) => labels.has(id) ? [labels.get(id)!] : []) : [];
    return <PopoutField label={definition.name} disabled={disabled || saving} issue={issue} empty={!chosen.length} display={chosen.length ? <span className={styles.valueChips}>{chosen.map((name, index) => <small key={`${name}-${index}`}>{name}</small>)}</span> : "비어 있음"}>
      {(anchorRef, close) => <OptionPopout definition={definition} value={value?.type === "multi_select" ? value.value : []} anchorRef={anchorRef} onCommit={(next) => void commit(next)} onCreateOption={onCreateOption} onClose={close} />}
    </PopoutField>;
  }
  if (definition.type === "date") {
    // 브라우저 날짜 입력 대신 표 셀과 같은 달력 팝업을 연다. 값은 표 · 갤러리와 같은 기간 표기로 보인다.
    const range = value?.type === "date" ? value.value : null;
    return <PopoutField label={definition.name} disabled={disabled || saving} issue={issue} empty={!range} display={range ? formatPeriodRange(range.start, range.end) : "비어 있음"}>
      {(anchorRef, close) => <DatePopout definition={definition} value={range} anchorRef={anchorRef} onCommit={(next) => void commit(next)} onClose={close} />}
    </PopoutField>;
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
  // 칸은 투명하다. 비어 있으면 안내 문구가 없어 입력할 자리가 보이지 않았다(Discord QA 11-13).
  return <div className={styles.fieldEditor}><div className={styles.fieldRow}><input className={styles.input} aria-label={definition.name} type={inputType} inputMode={definition.type === "number" ? "decimal" : undefined} placeholder={definition.type === "title" ? "제목 없음" : "비어 있음"} value={draft} disabled={disabled || saving} onChange={(event) => { setDraft(event.target.value); setIssue(null); }} onBlur={commitDraft} onKeyDown={(event) => commitOnEnter(event, commitDraft)} /><IssueBadge issue={issue} /></div></div>;
}
