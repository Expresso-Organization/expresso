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

export function ReadOnlyValue({ value }: { value: CareerPropertyValueV2 | null }): ReactNode {
  if (!value) return <span className={styles.emptyValue}>비어 있음</span>;
  const raw = value.value;
  const text = Array.isArray(raw) ? raw.map((item) => typeof item === "object" && item && "title" in item ? String(item.title) : String(item)).join(", ") : String(raw ?? "—");
  return <output className={styles.readOnlyValue}>{text}</output>;
}
