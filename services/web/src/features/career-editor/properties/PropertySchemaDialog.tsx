"use client";

import type { CareerPropertyChangePreview, CareerPropertyDefinitionV2, CareerPropertySchemaChange } from "@expresso/contracts";
import { useEffect, useMemo, useState } from "react";

import styles from "./properties.module.css";

const TYPES: Array<{ value: CareerPropertyDefinitionV2["type"]; label: string }> = [
  { value: "text", label: "텍스트" }, { value: "number", label: "숫자" }, { value: "select", label: "선택" },
  { value: "multi_select", label: "다중 선택" }, { value: "date", label: "날짜" }, { value: "checkbox", label: "체크박스" },
  { value: "url", label: "URL" }, { value: "email", label: "이메일" }, { value: "phone", label: "전화번호" },
  { value: "file", label: "파일" }, { value: "media", label: "미디어" }, { value: "relation", label: "관계" },
  { value: "formula", label: "수식" }, { value: "rollup", label: "롤업" },
];

export function PropertySchemaDialog({ open, categoryId, version, definitions, onClose, onDefinitionsChange, onVersionConflict }: {
  open: boolean;
  categoryId: string;
  version: number;
  definitions: readonly CareerPropertyDefinitionV2[];
  onClose(): void;
  onDefinitionsChange(definitions: CareerPropertyDefinitionV2[]): void;
  onVersionConflict(): void;
}) {
  const active = useMemo(() => definitions.filter((item) => item.deletedAt === null).sort((a, b) => a.order - b.order), [definitions]);
  const deleted = definitions.filter((item) => item.deletedAt !== null);
  const [selectedId, setSelectedId] = useState(active[0]?.id ?? "");
  const [currentVersion, setCurrentVersion] = useState(version);
  const [newName, setNewName] = useState("");
  const selected = definitions.find((item) => item.id === selectedId);
  const [name, setName] = useState(selected?.name ?? "");
  const [type, setType] = useState<CareerPropertyDefinitionV2["type"]>(selected?.type ?? "text");
  const [options, setOptions] = useState("");
  const [change, setChange] = useState<CareerPropertySchemaChange | null>(null);
  const [preview, setPreview] = useState<CareerPropertyChangePreview | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!selected) return; setName(selected.name); setType(selected.type); const raw = selected.config.options; setOptions(Array.isArray(raw) ? raw.flatMap((item) => item && typeof item === "object" && typeof (item as { name?: unknown }).name === "string" ? [(item as { name: string }).name] : []).join(", ") : ""); setPreview(null); setChange(null); setConfirmation(""); }, [selectedId, selected]);
  if (!open) return null;

  async function previewChange(next: CareerPropertySchemaChange) {
    setBusy(true); setMessage(null); setChange(next); setPreview(null); setConfirmation("");
    try {
      const response = await fetch(`/api/career/categories/${categoryId}/property-schema/preview`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(next) });
      if (!response.ok) throw new Error("영향을 확인하지 못했습니다.");
      const payload = await response.json() as { data: CareerPropertyChangePreview };
      setPreview(payload.data);
    } catch (error) { setMessage(error instanceof Error ? error.message : "영향을 확인하지 못했습니다."); }
    finally { setBusy(false); }
  }

  async function applyPreview() {
    if (!preview || !change) return;
    setBusy(true); setMessage(null);
    try {
      const response = await fetch(`/api/career/categories/${categoryId}/property-schema/apply`, { method: "POST", headers: { "content-type": "application/json", "if-match": `"v${preview.categoryVersion}"`, "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ change, previewToken: preview.previewToken, confirmLossy: preview.impact.lossyExamples.length > 0 }) });
      if (response.status === 409 || response.status === 412) { setMessage("다른 곳에서 속성이 바뀌었습니다. 최신 상태를 불러옵니다."); onVersionConflict(); return; }
      if (!response.ok) throw new Error("변경을 적용하지 못했습니다.");
      const payload = await response.json() as { data: { propertySchemaV2?: CareerPropertyDefinitionV2[]; version?: number } };
      if (payload.data.propertySchemaV2) onDefinitionsChange(payload.data.propertySchemaV2);
      if (payload.data.version) setCurrentVersion(payload.data.version);
      setPreview(null); setChange(null); setMessage("변경했습니다.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "변경을 적용하지 못했습니다."); }
    finally { setBusy(false); }
  }

  function typeChange(): CareerPropertySchemaChange | null {
    if (!selected) return null;
    const optionNames = options.split(",").map((item) => item.trim()).filter(Boolean);
    const previous = Array.isArray(selected.config.options) ? selected.config.options : [];
    const config = type === "select" || type === "multi_select" ? { ...selected.config, options: optionNames.map((optionName, index) => ({ id: typeof (previous[index] as { id?: unknown } | undefined)?.id === "string" ? (previous[index] as { id: string }).id : crypto.randomUUID(), name: optionName })) } : selected.config;
    return { kind: "type-change", propertyId: selected.id, type, config };
  }

  const confirmationText = preview ? `${preview.impact.affectedRecordCount}개 값 변경` : "";
  const needsConfirmation = Boolean(preview && (preview.impact.lossyExamples.length > 0 || change?.kind === "delete"));
  return <div className={styles.dialogBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="property-schema-title">
    <header><div><h2 id="property-schema-title">속성 관리</h2><p>순서와 타입을 바꾸기 전에 영향을 확인합니다.</p></div><button type="button" aria-label="닫기" onClick={onClose}>×</button></header>
    <div className={styles.dialogBody}><nav aria-label="속성 목록">{active.map((item, index) => <div key={item.id} className={item.id === selectedId ? styles.schemaItemActive : styles.schemaItem} tabIndex={0} onKeyDown={(event) => { if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return; event.preventDefault(); const order = Math.max(0, Math.min(active.length - 1, index + (event.key === "ArrowUp" ? -1 : 1))); void previewChange({ kind: "reorder", propertyId: item.id, order }); }}><button type="button" onClick={() => setSelectedId(item.id)}>{item.name}<small>{TYPES.find((entry) => entry.value === item.type)?.label ?? item.type}</small></button><span aria-hidden="true">↕</span></div>)}</nav>
      <div className={styles.schemaForm}><label>새 속성 이름<input className={styles.input} value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="예: 담당 역할" /></label><button type="button" disabled={busy || !newName.trim()} onClick={() => void previewChange({ kind: "create", property: { key: `property_${Date.now().toString(36)}`, name: newName.trim(), type: "text", required: false, system: false, config: {} } })}>새 속성 추가 확인</button>{selected ? <><label>이름<input className={styles.input} value={name} onChange={(event) => setName(event.target.value)} /></label><button type="button" disabled={busy || name.trim() === selected.name || !name.trim()} onClick={() => void previewChange({ kind: "rename", propertyId: selected.id, name })}>이름 변경 확인</button><label>타입<select className={styles.input} value={type} disabled={selected.system} onChange={(event) => setType(event.target.value as CareerPropertyDefinitionV2["type"])}>{TYPES.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}</select></label>{type === "select" || type === "multi_select" ? <label>선택지<input className={styles.input} value={options} onChange={(event) => setOptions(event.target.value)} placeholder="예: 초안, 검토, 완료" /></label> : null}<button type="button" disabled={busy || selected.system} onClick={() => { const next = typeChange(); if (next) void previewChange(next); }}>타입·선택지 변경 확인</button><button type="button" className={styles.dangerButton} disabled={busy || selected.system} onClick={() => void previewChange({ kind: "delete", propertyId: selected.id })}>속성 삭제 확인</button></> : <p>관리할 속성을 고르세요.</p>}
        {preview ? <div className={styles.impact} role="status"><strong>영향 확인</strong><p>값 {preview.impact.affectedRecordCount}개 · 변환 가능 {preview.impact.convertibleCount}개</p><p>뷰 {preview.impact.dependentViews.length}개 · 수식 {preview.impact.dependentFormulas.length}개 · 롤업 {preview.impact.dependentRollups.length}개</p>{needsConfirmation ? <label>아래 문구를 그대로 입력하세요.<code>{confirmationText}</code><input className={styles.input} aria-label="손실 확인 문구" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label> : null}<button type="button" disabled={busy || (needsConfirmation && confirmation !== confirmationText)} onClick={() => void applyPreview()}>변경 적용</button></div> : null}
        {deleted.length ? <div className={styles.tombstones}><strong>삭제한 속성</strong>{deleted.map((item) => <button key={item.id} type="button" onClick={async () => { const response = await fetch(`/api/career/categories/${categoryId}/property-schema/${item.id}/restore`, { method: "POST", headers: { "if-match": `"v${currentVersion}"` } }); if (response.status === 409 || response.status === 412) return onVersionConflict(); if (response.ok) { const payload = await response.json() as { data: { propertySchemaV2?: CareerPropertyDefinitionV2[]; version?: number } }; if (payload.data.propertySchemaV2) onDefinitionsChange(payload.data.propertySchemaV2); if (payload.data.version) setCurrentVersion(payload.data.version); } }}>{item.name} 복원</button>)}</div> : null}{message ? <p className={styles.message} role="status">{message}</p> : null}</div>
    </div>
  </section></div>;
}
