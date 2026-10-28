"use client";

import {
  CareerPropertyValueV2Schema,
  type CareerPropertyDefinitionV2,
  type CareerPropertyValueV2,
  type CareerCategory,
  type CareerRecordListItem,
} from "@expresso/contracts";
import { useEffect, useMemo, useState } from "react";

import { useComputedRefresh } from "./computed-refresh";
import { PropertyCreatePopover } from "./PropertyCreatePopover";
import { createPropertyOption } from "./property-options";
import { PropertyValueEditor } from "./PropertyValueEditor";
import { useCareerRecordSync } from "./record-sync";
import { RelationEditor, type CareerRelationDefinition } from "./RelationEditor";
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
}: {
  record: CareerRecordListItem;
  definitions: readonly CareerPropertyDefinitionV2[];
  categoryId: string;
}) {
  const sync = useCareerRecordSync();
  const [current, setCurrent] = useState(record);
  const [moveOpen, setMoveOpen] = useState(false);
  const [categories, setCategories] = useState<CareerCategory[]>([]);
  const [items, setItems] = useState(() => [...definitions]);
  // 표 · 보드에서 고친 값이 더 새 버전으로 들어오면 패널도 그 값을 보인다.
  useEffect(() => { if (record.version > current.version) setCurrent(record); }, [record]);
  const visible = useMemo(() => items.filter((item) => item.deletedAt === null).sort((left, right) => left.order - right.order), [items]);
  const computing = useComputedRefresh(current, items, setCurrent);

  async function savePatch(patch: { title?: string; properties?: Record<string, unknown> }) {
    const response = await fetch(`/api/career/records/${current.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "if-match": `"v${current.version}"` },
      body: JSON.stringify(patch),
    });
    if (!response.ok) throw new Error(response.status === 409 || response.status === 412 ? "다른 곳에서 바뀌었습니다. 새로 불러와 주세요." : "값을 저장하지 못했습니다.");
    const payload = await response.json() as { data: CareerRecordListItem };
    setCurrent((previous) => ({ ...previous, ...payload.data }));
    sync.onRecordChange(payload.data);
  }

  async function createOption(definition: CareerPropertyDefinitionV2, name: string): Promise<string> {
    const created = await createPropertyOption(categoryId, definition, name);
    if (created.category) { setItems(created.category.propertySchemaV2); sync.onCategoryChange(created.category); }
    return created.optionId;
  }

  async function saveProperty(key: string, value: CareerPropertyValueV2 | null) {
    async function attempt(base: CareerRecordListItem, retry: boolean): Promise<void> {
      const properties = { ...base.properties, [key]: value };
      if (value === null) delete properties[key];
      const response = await fetch(`/api/career/records/${base.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", "if-match": `"v${base.version}"` },
        body: JSON.stringify({ properties }),
      });
      if ((response.status === 409 || response.status === 412) && retry) {
        const latestResponse = await fetch(`/api/career/records/${base.id}`);
        if (!latestResponse.ok) throw new Error("최신 기록을 불러오지 못했습니다.");
        const latestPayload = await latestResponse.json() as { data: Partial<CareerRecordListItem> & Pick<CareerRecordListItem, "id" | "properties" | "version"> };
        const latest = { ...base, ...latestPayload.data };
        setCurrent((previous) => ({ ...previous, ...latestPayload.data }));
        return attempt(latest, false);
      }
      if (!response.ok) throw new Error(response.status === 409 || response.status === 412 ? "다른 곳에서 바뀌었습니다. 새로 불러와 주세요." : "값을 저장하지 못했습니다.");
      const payload = await response.json() as { data: CareerRecordListItem };
      setCurrent((previous) => ({ ...previous, ...payload.data }));
      sync.onRecordChange(payload.data);
    }
    await attempt(current, true);
  }

  return <section className={styles.propertyList} aria-label="문서 속성" aria-busy={computing}>
    <div className={styles.titleEditor}>
      <PropertyValueEditor definition={{ id: "00000000-0000-4000-8000-000000000000", key: "title", name: "제목", type: "title", required: false, system: true, config: {}, order: 0, version: 1, deletedAt: null }} value={{ type: "title", value: current.title }} onCommit={async (value) => { if (value?.type === "title") await savePatch({ title: value.value }); }} />
    </div>
    <div className={styles.propertyRow}><label><Icon name="circle-half" size={13}/><span className={styles.propertyName}>상태</span></label><span className={styles.metaValue}>{current.status === "draft" ? "초안" : current.status === "organized" ? "정리됨" : "검증됨"}</span></div>
    {visible.map((definition) => <div className={styles.propertyRow} key={definition.id}><label title={definition.name}><Icon name={propertyIcon(definition.type)} size={13}/><span className={styles.propertyName}>{definition.name}</span></label>{definition.type==="relation"?<RelationEditor recordId={current.id} propertyId={definition.id} definition={definition.config as unknown as CareerRelationDefinition} value={(() => { const stored = storedValue(current.properties[definition.key]); return stored?.type === "relation" ? stored.value : []; })()} onConflict={()=>window.location.reload()} onCommit={async targetIds=>{const response=await fetch(`/api/career/records/${current.id}/relations`,{method:"PUT",headers:{"content-type":"application/json","if-match":`"v${current.version}"`},body:JSON.stringify({propertyId:definition.id,targetIds})});if(!response.ok)throw new Error(`${response.status} 관계를 저장하지 못했습니다.`);const payload=await response.json() as {data:CareerRecordListItem};setCurrent(previous=>({...previous,...payload.data}));sync.onRecordChange(payload.data);}}/>:<PropertyValueEditor definition={definition} value={resolvedPropertyValue(definition, current)} onCommit={async (value) => saveProperty(definition.key, value)} {...(definition.type === "select" || definition.type === "multi_select" ? { onCreateOption: (name: string) => createOption(definition, name) } : {})} />}</div>)}
    <div className={styles.propertyRow}><label><Icon name="chat-circle-dots" size={13}/><span className={styles.propertyName}>출처</span></label><span className={styles.metaValue}>{current.origin === "manual" ? "직접 작성" : current.origin === "ai" ? "AI 정리" : current.origin === "interview" ? "AI 대화" : "가져오기"}</span></div>
    <div className={styles.propertyRow}><label><Icon name="link-simple" size={13}/><span className={styles.propertyName}>사용처</span></label><span className={styles.metaValue}>{current.usedInCount > 0 ? `${current.usedInCount}곳` : "—"}</span></div>
    <div className={styles.propertyActions}><PropertyCreatePopover categoryId={categoryId} definitions={items} onDefinitionsChange={(next, nextCategory) => { setItems(next); sync.onCategoryChange(nextCategory); }} onVersionConflict={() => window.location.reload()} /><button type="button" onClick={async()=>{const response=await fetch("/api/career/categories");if(response.ok){const payload=await response.json() as {data:CareerCategory[]};setCategories(payload.data);setMoveOpen(true);}}}>카테고리 이동</button></div>
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
