"use client";

import {
  CareerPropertyValueV2Schema,
  type CareerPropertyDefinitionV2,
  type CareerPropertyValueV2,
  type CareerCategory,
  type CareerRecordListItem,
} from "@expresso/contracts";
import { useMemo, useState } from "react";

import { PropertySchemaDialog } from "./PropertySchemaDialog";
import { PropertyValueEditor } from "./PropertyValueEditor";
import { RelationEditor, type CareerRelationDefinition } from "./RelationEditor";
import { MoveCategoryDialog } from "../move/MoveCategoryDialog";
import { Icon } from "@/components/ui/Icon";
import styles from "./properties.module.css";

function asV2Value(definition: CareerPropertyDefinitionV2, raw: unknown): CareerPropertyValueV2 | null {
  const parsed = CareerPropertyValueV2Schema.safeParse(raw);
  if (parsed.success) return parsed.data;
  if (raw === null || raw === undefined) return null;
  if (definition.type === "number" && typeof raw === "number") return { type: "number", value: raw };
  if (definition.type === "checkbox" && typeof raw === "boolean") return { type: "checkbox", value: raw };
  if (definition.type === "multi_select" && Array.isArray(raw)) return { type: "multi_select", value: raw.filter((item): item is string => typeof item === "string") };
  if (definition.type === "date" && typeof raw === "string") return { type: "date", value: { start: raw.length === 7 ? `${raw}-01` : raw, end: null, timezone: null } };
  if (["text", "title", "url", "email", "phone"].includes(definition.type) && typeof raw === "string") return { type: definition.type as "text" | "title" | "url" | "email" | "phone", value: raw };
  return null;
}

export function PropertyList({
  record,
  definitions,
  categoryId,
  categoryVersion,
  schemaMutable = true,
}: {
  record: CareerRecordListItem;
  definitions: readonly CareerPropertyDefinitionV2[];
  categoryId: string;
  categoryVersion: number;
  schemaMutable?: boolean;
}) {
  const [current, setCurrent] = useState(record);
  const [schemaOpen, setSchemaOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [categories, setCategories] = useState<CareerCategory[]>([]);
  const [items, setItems] = useState(() => [...definitions]);
  const visible = useMemo(() => items.filter((item) => item.deletedAt === null).sort((left, right) => left.order - right.order), [items]);

  async function savePatch(patch: { title?: string; properties?: Record<string, unknown> }) {
    const response = await fetch(`/api/career/records/${current.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "if-match": `"v${current.version}"` },
      body: JSON.stringify(patch),
    });
    if (!response.ok) throw new Error(response.status === 409 || response.status === 412 ? "다른 곳에서 바뀌었습니다. 새로 불러와 주세요." : "값을 저장하지 못했습니다.");
    const payload = await response.json() as { data: CareerRecordListItem };
    setCurrent((previous) => ({ ...previous, ...payload.data }));
  }

  return <section className={styles.propertyList} aria-label="문서 속성">
    <div className={styles.titleEditor}>
      <PropertyValueEditor definition={{ id: "00000000-0000-4000-8000-000000000000", key: "title", name: "제목", type: "title", required: false, system: true, config: {}, order: 0, version: 1, deletedAt: null }} value={{ type: "title", value: current.title }} onCommit={async (value) => { if (value?.type === "title") await savePatch({ title: value.value }); }} />
    </div>
    <div className={styles.propertyRow}><label><Icon name="circle-half" size={13}/><span className={styles.propertyName}>상태</span></label><span className={styles.metaValue}>{current.status === "draft" ? "초안" : current.status === "organized" ? "정리됨" : "검증됨"}</span></div>
    {visible.map((definition) => <div className={styles.propertyRow} key={definition.id}><label title={definition.name}><Icon name={propertyIcon(definition.type)} size={13}/><span className={styles.propertyName}>{definition.name}</span></label>{definition.type==="relation"?<RelationEditor recordId={current.id} propertyId={definition.id} definition={definition.config as unknown as CareerRelationDefinition} value={asV2Value(definition,current.properties[definition.key])?.type==="relation"?(asV2Value(definition,current.properties[definition.key]) as Extract<CareerPropertyValueV2,{type:"relation"}>).value:[]} onConflict={()=>window.location.reload()} onCommit={async targetIds=>{const response=await fetch(`/api/career/records/${current.id}/relations`,{method:"PUT",headers:{"content-type":"application/json","if-match":`"v${current.version}"`},body:JSON.stringify({propertyId:definition.id,targetIds})});if(!response.ok)throw new Error(`${response.status} 관계를 저장하지 못했습니다.`);const payload=await response.json() as {data:CareerRecordListItem};setCurrent(previous=>({...previous,...payload.data}));}}/>:<PropertyValueEditor definition={definition} value={asV2Value(definition, definition.type === "formula" || definition.type === "rollup" ? current.computedProperties?.[definition.key] : current.properties[definition.key])} onCommit={async (value) => { const properties = { ...current.properties, [definition.key]: value }; if (value === null) delete properties[definition.key]; await savePatch({ properties }); }} />}</div>)}
    <div className={styles.propertyRow}><label><Icon name="chat-circle-dots" size={13}/><span className={styles.propertyName}>출처</span></label><span className={styles.metaValue}>{current.origin === "manual" ? "직접 작성" : current.origin === "ai" ? "AI 정리" : current.origin === "interview" ? "AI 대화" : "가져오기"}</span></div>
    <div className={styles.propertyRow}><label><Icon name="link-simple" size={13}/><span className={styles.propertyName}>사용처</span></label><span className={styles.metaValue}>{current.usedInCount > 0 ? `${current.usedInCount}곳` : "—"}</span></div>
    <div className={styles.propertyActions}><button type="button" disabled={!schemaMutable} title={schemaMutable ? "속성 추가·관리" : "기본 카테고리의 속성 구성은 고정되어 있습니다."} onClick={() => setSchemaOpen(true)}><Icon name="plus" size={13}/>속성 추가</button><button type="button" onClick={async()=>{const response=await fetch("/api/career/categories");if(response.ok){const payload=await response.json() as {data:CareerCategory[]};setCategories(payload.data);setMoveOpen(true);}}}>카테고리 이동</button></div>
    <PropertySchemaDialog open={schemaOpen} categoryId={categoryId} version={categoryVersion} definitions={items} onClose={() => setSchemaOpen(false)} onDefinitionsChange={setItems} onVersionConflict={() => window.location.reload()} />
    <MoveCategoryDialog open={moveOpen} recordId={current.id} currentCategoryId={categoryId} recordVersion={current.version} categories={categories} onClose={()=>setMoveOpen(false)} onMoved={()=>window.location.reload()}/>
  </section>;
}

function propertyIcon(type: CareerPropertyDefinitionV2["type"]): string {
  if (type === "date" || type === "created_time" || type === "updated_time") return "calendar-blank";
  if (type === "relation" || type === "url") return "link-simple";
  if (type === "select" || type === "multi_select") return "tag";
  if (type === "number") return "hash";
  if (type === "checkbox") return "check-square";
  if (type === "file" || type === "media") return "paperclip";
  return "text-aa";
}
