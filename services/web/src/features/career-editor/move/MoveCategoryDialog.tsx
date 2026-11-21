"use client";

import { CareerCategoryMovePreviewSchema, type CareerCategory } from "@expresso/contracts";
import type { z } from "zod";
import { useState } from "react";

import { PropertySelect } from "@/features/career-editor/properties/PropertySelect";

import styles from "./move.module.css";

type CareerCategoryMovePreview = z.infer<typeof CareerCategoryMovePreviewSchema>;

const KIND_LABELS: Record<string, string> = { exact: "그대로", safe: "변환", lossy: "일부 잃음", unmapped: "보관" };

export function MoveCategoryDialog({ open, recordId, currentCategoryId, recordVersion: _recordVersion, categories, onClose, onMoved }: { open: boolean; recordId: string; currentCategoryId: string; recordVersion: number; categories: readonly CareerCategory[]; onClose(): void; onMoved(categoryId: string): void }) {
  const [target, setTarget] = useState("");
  const [preview, setPreview] = useState<CareerCategoryMovePreview | null>(null);
  const [discard, setDiscard] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");

  if (!open) return null;

  async function loadPreview() {
    if (!target) return;
    const response = await fetch(`/api/career/records/${recordId}/move/preview`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ targetCategoryId: target }) });
    if (!response.ok) return setMessage("이동 영향을 확인하지 못했습니다.");
    const payload = await response.json() as { data: CareerCategoryMovePreview };
    setPreview(payload.data);
    setDiscard(new Set());
    setConfirm("");
  }

  async function apply() {
    if (!preview) return;
    const response = await fetch(`/api/career/records/${recordId}/move`, { method: "POST", headers: { "content-type": "application/json", "if-match": `"v${preview.recordVersion}"` }, body: JSON.stringify({ targetCategoryId: target, previewToken: preview.previewToken, expectedVersion: preview.recordVersion, discardUnmappedPropertyIds: [...discard] }) });
    if (response.status === 409) {
      const payload = await response.json().catch(() => null) as { missingProperties?: string[] } | null;
      if (payload?.missingProperties?.length) {
        setMessage(`옮길 카테고리의 필수 속성 「${payload.missingProperties.join("」 · 「")}」에 넣을 값이 없습니다. 그 속성에 기본값을 정하거나 필수를 끈 뒤 옮겨 주세요.`);
        return;
      }
    }
    if (response.status === 409 || response.status === 412) {
      setMessage("기록이나 스키마가 바뀌어 영향을 다시 확인합니다.");
      await loadPreview();
      return;
    }
    if (!response.ok) return setMessage("카테고리를 옮기지 못했습니다.");
    onMoved(target);
    onClose();
  }

  const phrase = `${discard.size}개 속성 제외`;
  // 미리보기는 속성 ID로 옵니다. 화면에는 두 카테고리의 속성 이름을 보입니다.
  const sourceNames = new Map((categories.find((item) => item.id === currentCategoryId)?.propertySchemaV2 ?? []).map((definition) => [definition.id, definition.name]));
  const targetNames = new Map((categories.find((item) => item.id === target)?.propertySchemaV2 ?? []).map((definition) => [definition.id, definition.name]));
  const categoryOptions = [
    { value: "", label: "선택" },
    // 보관한 카테고리로는 옮기지 않습니다. 옮긴 기록이 사이드바에서 바로 사라져 보입니다.
    ...categories.filter((item) => item.id !== currentCategoryId && item.archivedAt === null).map((item) => ({ value: item.id, label: item.name })),
  ];

  return <div className={styles.backdrop}>
    <section role="dialog" aria-modal="true" aria-labelledby="move-title" className={styles.dialog}>
      <header><h2 id="move-title">카테고리 이동</h2><button onClick={onClose} aria-label="닫기">×</button></header>
      <label>옮길 카테고리<PropertySelect label="옮길 카테고리" value={target} placeholder="선택" options={categoryOptions} onChange={(categoryId) => { setTarget(categoryId); setPreview(null); }} /></label>
      <button type="button" disabled={!target} onClick={() => void loadPreview()}>영향 확인</button>
      {preview ? <>
        <table><caption>속성 변환</caption><thead><tr><th>원본 속성</th><th>대상 속성</th><th>변환</th></tr></thead><tbody>{preview.conversions.map((item) => <tr key={item.sourcePropertyId}><td>{sourceNames.get(item.sourcePropertyId) ?? "이름 없는 속성"}</td><td>{item.targetPropertyId ? targetNames.get(item.targetPropertyId) ?? "이름 없는 속성" : "보관"}</td><td>{KIND_LABELS[item.kind] ?? item.kind}</td></tr>)}</tbody></table>
        <p>본문과 관계는 그대로 유지됩니다.</p>
        {Object.keys(preview.unmappedProperties).length ? <fieldset><legend>대상에 없는 속성</legend>{Object.keys(preview.unmappedProperties).map((id) => <label key={id}><input type="checkbox" checked={discard.has(id)} onChange={() => setDiscard((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; })} />{sourceNames.get(id) ?? "이름 없는 속성"} 값을 제외</label>)}</fieldset> : null}
        {discard.size ? <label>제외 확인 문구<code>{phrase}</code><input aria-label="제외 확인 문구" value={confirm} onChange={(event) => setConfirm(event.target.value)} /></label> : null}
        <button type="button" disabled={discard.size > 0 && confirm !== phrase} onClick={() => void apply()}>이동 적용</button>
      </> : null}
      {message ? <p role="status">{message}</p> : null}
    </section>
  </div>;
}
