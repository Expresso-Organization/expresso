"use client";

import {
  CareerPropertyValueV2Schema,
  type CareerPropertyDefinitionV2,
  type CareerPropertyValueV2,
  type CareerCategory,
  type CareerRecordListItem,
} from "@expresso/contracts";
import { useEffect, useMemo, useRef, useState } from "react";

import { patchCareerRecord, readCareerRecord, RECORD_WRITE_HINT, recordWriteScope } from "../write-operations/record-write-client";
import { usePendingRecordWrite } from "../write-operations/usePendingRecordWrite";
import { WriteOperationStatus } from "../write-operations/WriteOperationStatus";
import { useComputedRefresh } from "./computed-refresh";
import { PropertyCreatePopover } from "./PropertyCreatePopover";
import { createPropertyOption } from "./property-options";
import { PropertyValueEditor } from "./PropertyValueEditor";
import { CanonicalPropertyValueEditor } from "./CanonicalPropertyValueEditor";
import { canonicalDisplayValue, canonicalEditableDefinition, canonicalPropertyDelta, canonicalPropertyValue, canonicalReadDefinitions, propertyMutationHint, type CareerCellValue } from "./canonical-values";
import { RelationEditor, type CareerRelationDefinition } from "./RelationEditor";
import { PropertyMutationNotice } from "./PropertyMutationNotice";
import { MoveCategoryDialog } from "../move/MoveCategoryDialog";
import { Icon } from "@/components/ui/Icon";
import styles from "./properties.module.css";

function storedValue(raw: unknown): CareerPropertyValueV2 | null {
  const parsed = CareerPropertyValueV2Schema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function resolvedPropertyValue(definition: CareerPropertyDefinitionV2, record: CareerRecordListItem): CareerPropertyValueV2 | null {
  if (definition.system && definition.type === "created_time") return { type: "created_time", value: record.createdAt ?? record.updatedAt };
  if (definition.system && definition.type === "updated_time") return { type: "updated_time", value: record.updatedAt };
  const raw = definition.type === "formula" || definition.type === "rollup" ? record.computedProperties?.[definition.key] : record.properties[definition.key];
  return storedValue(raw);
}

export function PropertyList({
  record,
  definitions,
  categoryId,
  onEnsureOption,
  onResumePropertyMutation,
  onCheckPropertyMutation,
}: {
  record: CareerRecordListItem;
  definitions: readonly CareerPropertyDefinitionV2[];
  categoryId: string;
  onResumePropertyMutation?(jobId: string): Promise<void>;
  onCheckPropertyMutation?(jobId: string): Promise<void>;
  onEnsureOption?(definition: CareerPropertyDefinitionV2, label: string): Promise<{ id: string; name: string }>;
}) {
  const [current, setCurrent] = useState(record);
  const [moveOpen, setMoveOpen] = useState(false);
  const [categories, setCategories] = useState<CareerCategory[]>([]);
  const [items, setItems] = useState(() => [...definitions]);
  useEffect(() => setCurrent((previous) => record.id !== previous.id || record.version >= previous.version ? record : previous), [record]);
  useEffect(() => setItems([...definitions]), [definitions]);
  const computing = useComputedRefresh(current, items, setCurrent);
  const visible = useMemo(() => canonicalReadDefinitions(current, items), [current, items]);
  const contextId = useRef(record.id); contextId.current = record.id;
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  useEffect(() => setConflict(null), [record.id]);
  useEffect(() => setSaving(false), [record.id]);
  const { pending, finish } = usePendingRecordWrite(record.id);
  const mutationHint = propertyMutationHint(current) || (pending || saving ? RECORD_WRITE_HINT : null);

  async function savePatch(patch: { title?: string; properties?: Record<string, unknown> }) {
    if (mutationHint) return;
    const recordId = current.id;
    setSaving(true);
    try {
      const result = await patchCareerRecord(recordId, current.version, patch);
      if (contextId.current !== recordId || result.kind !== "completed") return;
      setCurrent(previous => ({ ...previous, ...result.record, pendingPropertyMutation: result.record.pendingPropertyMutation, pendingRelationPropertyIds: result.record.pendingRelationPropertyIds }));
    } finally { if (contextId.current === recordId) setSaving(false); }
  }

  async function createOption(definition: CareerPropertyDefinitionV2, name: string): Promise<string> {
    const created = await createPropertyOption(categoryId, definition, name);
    if (created.category) setItems(created.category.propertySchemaV2);
    return created.optionId;
  }

  async function saveProperty(definition: CareerPropertyDefinitionV2, value: CareerCellValue) {
    if (mutationHint) return;
    const recordId = current.id;
    async function attempt(base: CareerRecordListItem): Promise<void> {
      const hint = propertyMutationHint(base);
      if (hint) throw new Error(hint);
      const properties = { ...base.properties };
      if (value === null) delete properties[definition.key];
      else if (!("propertyDefinitionId" in value)) properties[definition.key] = value;
      const patch = base.propertyValues !== undefined ? { propertyValues: canonicalPropertyDelta(definition, value) } : { properties };
      try {
        const result = await patchCareerRecord(base.id, base.version, patch);
        if (contextId.current !== recordId || result.kind !== "completed") return;
        setCurrent(previous => ({ ...previous, ...result.record, pendingPropertyMutation: result.record.pendingPropertyMutation, pendingRelationPropertyIds: result.record.pendingRelationPropertyIds }));
      } catch (error) {
        if ([409, 412].includes((error as { status?: number }).status ?? 0)) {
          const fresh = await readCareerRecord(base.id);
          if (contextId.current !== recordId) return;
          setCurrent(previous => ({ ...previous, ...fresh, pendingPropertyMutation: fresh.pendingPropertyMutation, pendingRelationPropertyIds: fresh.pendingRelationPropertyIds }));
          // 최신 version으로 이전 입력을 자동 재적용하면 다른 사용자의 변경을 덮어씁니다.
          setConflict("다른 곳에서 바뀐 값을 불러왔습니다. 확인 후 다시 편집해 주세요.");
          return;
        }
        throw error;
      }
    }
    setSaving(true);
    try { setConflict(null); await attempt(current); } finally { if (contextId.current === recordId) setSaving(false); }
  }

  async function completeWrite() {
    const recordId = current.id;
    const fresh = await readCareerRecord(recordId);
    if (contextId.current !== recordId) return;
    setCurrent(previous => ({ ...previous, ...fresh, pendingPropertyMutation: fresh.pendingPropertyMutation, pendingRelationPropertyIds: fresh.pendingRelationPropertyIds }));
    finish();
  }
  return <section className={styles.propertyList} aria-label="문서 속성" aria-busy={computing}>
    {conflict ? <p role="alert">{conflict}</p> : null}
    {pending ? <WriteOperationStatus operationId={pending.operationId} initial={pending.initial} scope={recordWriteScope(current.id)} producer="career-product" recordId={current.id} onCompleted={completeWrite} /> : null}
    <PropertyMutationNotice record={current} {...(onResumePropertyMutation ? { onResumePropertyMutation } : {})} {...(onCheckPropertyMutation ? { onCheckPropertyMutation } : {})} />
    <div className={styles.titleEditor}>
      <PropertyValueEditor key={current.id} definition={{ id: "00000000-0000-4000-8000-000000000000", key: "title", name: "제목", type: "title", required: false, system: true, config: {}, order: 0, version: 1, deletedAt: null }} value={{ type: "title", value: current.title }} disabled={!!mutationHint} onCommit={async (value) => { if (value?.type === "title") await savePatch({ title: value.value }); }} />
    </div>
    <div className={styles.propertyRow}><label><Icon name="circle-half" size={13}/><span className={styles.propertyName}>상태</span></label><span className={styles.metaValue}>{current.status === "draft" ? "초안" : current.status === "organized" ? "정리됨" : "검증됨"}</span></div>
    {visible.map((definition) => {
      const relation = storedValue(current.properties[definition.key]);
      return <div className={styles.propertyRow} key={current.id + ":" + definition.id}>
        <label title={definition.name}><Icon name={propertyIcon(definition.type)} size={13}/><span className={styles.propertyName}>{definition.name}</span></label>
        {definition.type === "relation" && current.pendingRelationPropertyIds?.includes(definition.id) ? <output className={styles.readOnlyValue} aria-label={definition.name}>관계 변경을 적용하고 있습니다. 완료 후 다시 확인해 주세요.</output> : mutationHint && current.propertyValues !== undefined && canonicalPropertyValue(current, definition) ? <output className={styles.readOnlyValue} aria-label={definition.name}>{canonicalDisplayValue(definition, canonicalPropertyValue(current, definition))}</output> : mutationHint && definition.type === "relation" ? <output className={styles.readOnlyValue} aria-label={definition.name}>{relation?.type === "relation" ? relation.value.map((item) => item.title).join(", ") : "비어 있음"}</output> : definition.type === "relation" ? <RelationEditor recordId={current.id} propertyId={definition.id} definition={definition.config as unknown as CareerRelationDefinition} value={relation?.type === "relation" ? relation.value : []} onConflict={() => window.location.reload()} onCommit={async (targetIds) => {
          const response = await fetch("/api/career/records/" + current.id + "/relations", { method: "PUT", headers: { "content-type": "application/json", "if-match": '"v' + current.version + '"' }, body: JSON.stringify({ propertyId: definition.id, targetIds }) });
          if (!response.ok) throw new Error(response.status + " 관계를 저장하지 못했습니다.");
          const payload = await response.json() as { data: CareerRecordListItem };
          setCurrent((previous) => ({ ...previous, ...payload.data, pendingRelationPropertyIds: payload.data.pendingRelationPropertyIds }));
        }} /> : current.propertyValues !== undefined && canonicalEditableDefinition(definition) ? <CanonicalPropertyValueEditor definition={definition} onCreateOption={definition.type === "select" || definition.type === "multi_select" ? (name) => createOption(definition, name) : undefined} disabled={!!mutationHint} value={canonicalPropertyValue(current, definition)} {...(onEnsureOption ? { onEnsureOption: (label: string) => onEnsureOption(definition, label) } : {})} onCommit={async (value) => saveProperty(definition, value)} /> : <PropertyValueEditor definition={definition} disabled={!!mutationHint} value={resolvedPropertyValue(definition, current)} onCommit={async (value) => saveProperty(definition, value)} {...(definition.type === "select" || definition.type === "multi_select" ? { onCreateOption: (name: string) => createOption(definition, name) } : {})} />}
      </div>;
    })}
    <div className={styles.propertyRow}><label><Icon name="chat-circle-dots" size={13}/><span className={styles.propertyName}>출처</span></label><span className={styles.metaValue}>{current.origin === "manual" ? "직접 작성" : current.origin === "ai" ? "AI 정리" : current.origin === "interview" ? "AI 대화" : "가져오기"}</span></div>
    <div className={styles.propertyRow}><label><Icon name="link-simple" size={13}/><span className={styles.propertyName}>사용처</span></label><span className={styles.metaValue}>{current.usedInCount > 0 ? `${current.usedInCount}곳` : "—"}</span></div>
    <div className={styles.propertyActions}><PropertyCreatePopover categoryId={categoryId} definitions={items} onDefinitionsChange={setItems} onVersionConflict={() => window.location.reload()} /><button type="button" disabled={!!mutationHint} onClick={async()=>{const response=await fetch("/api/career/categories");if(response.ok){const payload=await response.json() as {data:CareerCategory[]};setCategories(payload.data);setMoveOpen(true);}}}>카테고리 이동</button></div>
    <MoveCategoryDialog open={moveOpen} recordId={current.id} currentCategoryId={categoryId} recordVersion={current.version} categories={categories} onClose={()=>setMoveOpen(false)} onMoved={()=>window.location.reload()}/>
  </section>;
}

function propertyIcon(type: CareerPropertyDefinitionV2["type"]): string {
  if (type === "created_time") return "clock";
  if (type === "updated_time") return "clock-clockwise";
  if (type === "date") return "calendar-blank";
  if (type === "formula") return "function";
  if (type === "rollup") return "magnifying-glass";
  if (type === "relation" || type === "url") return "link-simple";
  if (type === "select" || type === "multi_select") return "tag";
  if (type === "number") return "hash";
  if (type === "checkbox") return "check-square";
  if (type === "file" || type === "media") return "paperclip";
  return "text-aa";
}
