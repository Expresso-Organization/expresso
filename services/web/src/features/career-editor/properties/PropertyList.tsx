"use client";

import {
  type CareerPropertyDefinitionV2,
  type CareerPropertyValueV2,
  type CareerCategory,
  type CareerRecordListItem,
} from "@expresso/contracts";
import { useMemo, useState } from "react";

import { PropertyCreatePopover } from "./PropertyCreatePopover";
import { PropertyValueEditor } from "./PropertyValueEditor";
import { propertyValueForDefinition, type CareerPropertyEditorValue } from "./canonical-property-values";
import { RelationEditor, type CareerRelationDefinition } from "./RelationEditor";
import { MoveCategoryDialog } from "../move/MoveCategoryDialog";
import { Icon } from "@/components/ui/Icon";
import styles from "./properties.module.css";

const TITLE_DEFINITION: CareerPropertyDefinitionV2 = {
  id: "00000000-0000-4000-8000-000000000000",
  key: "title",
  name: "제목",
  type: "title",
  required: false,
  system: true,
  config: {},
  order: 0,
  version: 1,
  deletedAt: null,
};

export function PropertyList({
  record,
  definitions,
  categoryId,
  schemaMutable = true,
  onRecordCommit,
  onRecordAccepted,
}: {
  record: CareerRecordListItem;
  definitions: readonly CareerPropertyDefinitionV2[];
  categoryId: string;
  schemaMutable?: boolean;
  onRecordCommit?: ((recordId: string, definition: CareerPropertyDefinitionV2, value: CareerPropertyEditorValue | null) => Promise<void>) | undefined;
  onRecordAccepted?: ((record: CareerRecordListItem) => void) | undefined;
}) {
  const [moveOpen, setMoveOpen] = useState(false);
  const [categories, setCategories] = useState<CareerCategory[]>([]);
  const [items, setItems] = useState(() => [...definitions]);
  const visible = useMemo(() => items.filter((item) => item.deletedAt === null).sort((left, right) => left.order - right.order), [items]);

  return <section className={styles.propertyList} aria-label="문서 속성">
    <div className={styles.titleEditor}>
      <PropertyValueEditor definition={TITLE_DEFINITION} value={{ type: "title", value: record.title }} disabled={!onRecordCommit} onCommit={async (value) => { if (value?.type === "title") await onRecordCommit?.(record.id, TITLE_DEFINITION, value); }} />
    </div>
    <div className={styles.propertyRow}><label><Icon name="circle-half" size={13}/><span className={styles.propertyName}>상태</span></label><span className={styles.metaValue}>{record.status === "draft" ? "초안" : record.status === "organized" ? "정리됨" : "검증됨"}</span></div>
    {visible.map((definition) => { const resolved = propertyValueForDefinition(record, definition); return <div className={styles.propertyRow} key={definition.id}><label title={definition.name}><Icon name={propertyIcon(definition.type)} size={13}/><span className={styles.propertyName}>{definition.name}</span></label>{definition.type==="relation"?<RelationEditor recordId={record.id} propertyId={definition.id} definition={definition.config as unknown as CareerRelationDefinition} value={resolved?.type==="relation"?(resolved as Extract<CareerPropertyValueV2,{type:"relation"}>).value:[]} onConflict={()=>window.location.reload()} onCommit={async targetIds=>{const response=await fetch(`/api/career/records/${record.id}/relations`,{method:"PUT",headers:{"content-type":"application/json","if-match":`"v${record.version}"`},body:JSON.stringify({propertyId:definition.id,targetIds})});if(!response.ok)throw new Error(`${response.status} 관계를 저장하지 못했습니다.`);const payload=await response.json() as {data:CareerRecordListItem};if(onRecordAccepted)onRecordAccepted(payload.data);else window.location.reload();}}/>:<PropertyValueEditor definition={definition} value={resolved} disabled={!onRecordCommit} onCommit={async (value) => { await onRecordCommit?.(record.id, definition, value); }} />}</div>; })}
    <div className={styles.propertyRow}><label><Icon name="chat-circle-dots" size={13}/><span className={styles.propertyName}>출처</span></label><span className={styles.metaValue}>{record.origin === "manual" ? "직접 작성" : record.origin === "ai" ? "AI 정리" : record.origin === "interview" ? "AI 대화" : "가져오기"}</span></div>
    <div className={styles.propertyRow}><label><Icon name="link-simple" size={13}/><span className={styles.propertyName}>사용처</span></label><span className={styles.metaValue}>{record.usedInCount > 0 ? `${record.usedInCount}곳` : "—"}</span></div>
    <div className={styles.propertyActions}><PropertyCreatePopover categoryId={categoryId} definitions={items} disabled={!schemaMutable} onDefinitionsChange={setItems} onVersionConflict={() => window.location.reload()} /><button type="button" onClick={async()=>{const response=await fetch("/api/career/categories");if(response.ok){const payload=await response.json() as {data:CareerCategory[]};setCategories(payload.data);setMoveOpen(true);}}}>카테고리 이동</button></div>
    <MoveCategoryDialog open={moveOpen} recordId={record.id} currentCategoryId={categoryId} recordVersion={record.version} categories={categories} onClose={()=>setMoveOpen(false)} onMoved={()=>window.location.reload()}/>
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
