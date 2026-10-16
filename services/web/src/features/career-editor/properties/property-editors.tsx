"use client";

import type { CareerPropertyDefinitionV2, CareerPropertyValueV2 } from "@expresso/contracts";
import { useState, type KeyboardEvent, type ReactNode } from "react";

import { Icon } from "@/components/ui/Icon";

import styles from "./properties.module.css";

export interface PropertyOption { id: string; name: string }

export function propertyOptions(definition: CareerPropertyDefinitionV2): PropertyOption[] {
  const options = definition.config.options;
  if (!Array.isArray(options)) return [];
  return options.flatMap((option) => option && typeof option === "object" && typeof (option as { id?: unknown }).id === "string" && typeof (option as { name?: unknown }).name === "string" ? [{ id: (option as { id: string }).id, name: (option as { name: string }).name }] : []);
}

/** v1 tags에서 파생한 다중 선택입니다. 값은 선택지 UUID가 아니라 자유 문자열 배열입니다. */
export function isLegacyTags(definition: CareerPropertyDefinitionV2): boolean {
  return definition.type === "multi_select" && definition.config.legacyType === "tags";
}

/** 자유 문자열 태그를 칩으로 보여 주고 Enter로 더하거나 지웁니다. 마지막 칩을 지우면 null을 저장합니다. */
export function TagListEditor({ label, values, disabled, onCommit, children }: { label: string; values: readonly string[]; disabled: boolean; onCommit(next: string[] | null): void; children?: ReactNode }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const next = draft.trim();
    setDraft("");
    if (next && !values.includes(next)) onCommit([...values, next]);
  };
  const remove = (item: string) => {
    const next = values.filter((value) => value !== item);
    onCommit(next.length ? next : null);
  };
  return <div className={styles.fieldEditor}>
    {values.length ? <div className={styles.tagList}>{values.map((item) => <span key={item} className={styles.tagChip}>{item}<button type="button" aria-label={`${item} 지우기`} disabled={disabled} onClick={() => remove(item)}><Icon name="x" size={11} /></button></span>)}</div> : null}
    <div className={styles.fieldRow}><input className={styles.input} aria-label={`${label} 추가`} placeholder="입력 후 Enter" value={draft} disabled={disabled} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => commitOnEnter(event, add)} />{children}</div>
  </div>;
}

export function commitOnEnter(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>, commit: () => void) {
  if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); commit(); }
}

export function ReadOnlyValue({ value }: { value: CareerPropertyValueV2 | null }): ReactNode {
  if (!value) return <span className={styles.emptyValue}>비어 있음</span>;
  const raw = value.value;
  const text = Array.isArray(raw) ? raw.map((item) => typeof item === "object" && item && "title" in item ? String(item.title) : String(item)).join(", ") : String(raw ?? "—");
  return <output className={styles.readOnlyValue}>{text}</output>;
}
