"use client";

import { useEffect, useState } from "react";
import styles from "./properties.module.css";

export interface CareerRelationTarget { recordId: string; title: string }
export interface CareerRelationDefinition { targetCategoryId: string; inversePropertyId: string | null; cardinality: "single" | "multiple"; deletePolicy: "restrict" | "nullify" }
export interface RelationEditorProps {
  recordId: string; propertyId: string; definition: CareerRelationDefinition; value: readonly CareerRelationTarget[];
  onCommit(targetIds: readonly string[]): Promise<void>; inverseLabel?: string; onConflict?(): void;
  search?: (query: string) => Promise<CareerRelationTarget[]>; hydrate?: () => Promise<CareerRelationTarget[]>;
}

export function RelationEditor({ recordId, propertyId, definition, value, onCommit, inverseLabel, onConflict, search, hydrate }: RelationEditorProps) {
  const [query, setQuery] = useState(""); const [results, setResults] = useState<CareerRelationTarget[]>([]);
  const [selectedTargets, setSelectedTargets] = useState(() => [...value]); const [issue, setIssue] = useState(""); const [open, setOpen] = useState(false);
  useEffect(() => { void (hydrate ? hydrate() : defaultHydrate(recordId, propertyId)).then(setSelectedTargets).catch(() => setIssue("선택한 관계를 불러오지 못했습니다.")); }, [hydrate, propertyId, recordId]);
  useEffect(() => { if (!query.trim()) { setResults([]); return; } const timer = setTimeout(() => { void (search ? search(query) : defaultSearch(definition.targetCategoryId, query)).then(setResults).catch(() => setIssue("검색하지 못했습니다.")); }, 250); return () => clearTimeout(timer); }, [definition.targetCategoryId, query, search]);
  async function commit(ids: string[]) { try { const next = definition.cardinality === "single" ? ids.slice(-1) : ids; await onCommit(next); const known = [...selectedTargets, ...results]; setSelectedTargets(next.flatMap((id) => known.find((item) => item.recordId === id) ?? [])); setIssue(""); } catch (error) { if (error instanceof Error && /409|412|바뀌/.test(error.message)) onConflict?.(); setIssue(error instanceof Error ? error.message : "저장하지 못했습니다."); } }
  const selected = new Set(selectedTargets.map((item) => item.recordId));
  return <div className={styles.relationEditor}><div className={styles.propertyChips}>{selectedTargets.map((item) => <button type="button" key={item.recordId} onClick={() => void commit(selectedTargets.filter((target) => target.recordId !== item.recordId).map((target) => target.recordId))}>{item.title} ×</button>)}</div><input className={styles.input} aria-label="관계 기록 검색" role="combobox" aria-expanded={open} value={query} onFocus={() => setOpen(true)} onChange={(event) => { setQuery(event.target.value); setOpen(true); }} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); if (event.key === "Enter" && results[0]) { event.preventDefault(); void commit([...selected, results[0].recordId]); setQuery(""); setOpen(false); } }} placeholder="연결할 기록 검색" />{open && results.length ? <ul role="listbox" className={styles.relationResults}>{results.filter((item) => !selected.has(item.recordId)).map((item) => <li role="option" aria-selected="false" key={item.recordId}><button type="button" onClick={() => { void commit([...selected, item.recordId]); setQuery(""); setOpen(false); }}>{item.title}</button></li>)}</ul> : null}{inverseLabel ? <span className={styles.helpText}>반대쪽에는 ‘{inverseLabel}’로 표시됩니다.</span> : null}{issue ? <span role="alert" className={styles.issue}>{issue}</span> : null}</div>;
}

async function defaultSearch(categoryId: string, q: string): Promise<CareerRelationTarget[]> { const response = await fetch(`/api/career/records/search?categoryId=${encodeURIComponent(categoryId)}&q=${encodeURIComponent(q)}&limit=20`); if (!response.ok) throw new Error("검색하지 못했습니다."); const payload = await response.json() as { data: Array<{ id: string; title: string }> }; return payload.data.map((item) => ({ recordId: item.id, title: item.title })); }
async function defaultHydrate(recordId: string, propertyId: string): Promise<CareerRelationTarget[]> { const response = await fetch(`/api/career/records/${recordId}/relations?propertyId=${encodeURIComponent(propertyId)}`); if (!response.ok) throw new Error("관계를 불러오지 못했습니다."); return (await response.json() as { data: CareerRelationTarget[] }).data; }
