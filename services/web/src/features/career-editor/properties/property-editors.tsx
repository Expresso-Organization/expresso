"use client";

import type { CareerPropertyDefinitionV2, CareerPropertyValueV2 } from "@expresso/contracts";
import type { KeyboardEvent, ReactNode } from "react";

import styles from "./properties.module.css";

export interface PropertyOption { id: string; name: string }

export function propertyOptions(definition: CareerPropertyDefinitionV2): PropertyOption[] {
  const options = definition.config.options;
  if (!Array.isArray(options)) return [];
  return options.flatMap((option) => {
    if (!option || typeof option !== "object") return [];
    const item = option as { id?: unknown; name?: unknown; label?: unknown };
    const name = typeof item.name === "string" ? item.name : item.label;
    return typeof item.id === "string" && typeof name === "string" ? [{ id: item.id, name }] : [];
  });
}

export function commitOnEnter(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>, commit: () => void) {
  if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); commit(); }
}

/** ISO 시각을 사용자의 로컬 시간 `YYYY-MM-DD HH:mm`으로 보인다. */
export function formatTimestamp(value: string): string {
  const timestamp = new Date(value);
  const local = new Date(timestamp.getTime() - timestamp.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16).replace("T", " ");
}

/** `computed`는 Worker가 채우는 수식 · 롤업 값이다. 계산 중 표시(`properties.module.css`)가 이 칸만 고른다. */
export function ReadOnlyValue({ value, computed = false }: { value: CareerPropertyValueV2 | null; computed?: boolean }): ReactNode {
  const marker = computed ? { "data-computed": "" } : {};
  if (!value) return <span className={styles.emptyValue} {...marker}>비어 있음</span>;
  if (value.type === "created_time" || value.type === "updated_time") return <output className={styles.readOnlyValue} {...marker}><time dateTime={value.value}>{formatTimestamp(value.value)}</time></output>;
  const raw = value.value;
  const text = Array.isArray(raw) ? raw.map((item) => typeof item === "object" && item && "title" in item ? String(item.title) : String(item)).join(", ") : String(raw ?? "—");
  return <output className={styles.readOnlyValue} {...marker}>{text}</output>;
}
