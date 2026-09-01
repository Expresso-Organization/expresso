"use client";

import type { CareerPropertyDefinitionV2, CareerPropertyValueV2 } from "@expresso/contracts";
import type { KeyboardEvent, ReactNode } from "react";

import styles from "./properties.module.css";

export interface PropertyOption { id: string; name: string }

export function propertyOptions(definition: CareerPropertyDefinitionV2): PropertyOption[] {
  const options = definition.config.options;
  if (!Array.isArray(options)) return [];
  return options.flatMap((option) => option && typeof option === "object" && typeof (option as { id?: unknown }).id === "string" && typeof (option as { name?: unknown }).name === "string" ? [{ id: (option as { id: string }).id, name: (option as { name: string }).name }] : []);
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
