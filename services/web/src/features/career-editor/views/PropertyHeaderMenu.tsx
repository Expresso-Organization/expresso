"use client";

import type {
  CareerCategory,
  CareerPropertyChangePreview,
  CareerPropertyDefinitionV2,
  CareerPropertySchemaChange,
  CareerViewConfiguration,
} from "@expresso/contracts";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";

import { Icon } from "@/components/ui/Icon";
import { PropertySelect } from "@/features/career-editor/properties/PropertySelect";
import { nextNumberedPropertyName, propertyNameBase } from "@/features/career-editor/properties/property-name";

import styles from "./views.module.css";

type EditableType = "text" | "number" | "select" | "multi_select" | "date" | "checkbox" | "url" | "email" | "phone" | "file" | "media";
type Position = { top: number; left: number; width: number; maxHeight: number };
type PendingAction = {
  preview: CareerPropertyChangePreview;
  title: string;
  description: string;
  nextView?: (category: CareerCategory) => CareerViewConfiguration;
};

const TYPES: ReadonlyArray<{ value: EditableType; label: string; icon: string }> = [
  { value: "text", label: "텍스트", icon: "text-aa" },
  { value: "number", label: "숫자", icon: "hash" },
  { value: "select", label: "선택", icon: "tag" },
  { value: "multi_select", label: "다중 선택", icon: "list-bullets" },
  { value: "date", label: "날짜", icon: "calendar-blank" },
  { value: "checkbox", label: "체크박스", icon: "check-square" },
  { value: "url", label: "URL", icon: "link-simple" },
  { value: "email", label: "이메일", icon: "at" },
  { value: "phone", label: "전화번호", icon: "phone" },
  { value: "file", label: "파일", icon: "paperclip" },
  { value: "media", label: "미디어", icon: "image" },
];

function typeMeta(type: CareerPropertyDefinitionV2["type"]) {
  return TYPES.find((item) => item.value === type) ?? { value: type, label: type, icon: type === "title" ? "text-aa" : "sliders-horizontal" };
}

function configForType(type: EditableType): Record<string, unknown> {
  return type === "select" || type === "multi_select" ? { options: [] } : {};
}

function containsReference(value: unknown, propertyId: string): boolean {
  if (value === propertyId) return true;
  if (Array.isArray(value)) return value.some((item) => containsReference(item, propertyId));
  return !!value && typeof value === "object" && Object.values(value as Record<string, unknown>).some((item) => containsReference(item, propertyId));
}

function withoutKey(source: Record<string, number>, key: string): Record<string, number> {
  return Object.fromEntries(Object.entries(source).filter(([item]) => item !== key));
}

function MenuAction({ icon, children, detail, danger = false, disabled = false, onClick }: { icon: string; children: ReactNode; detail?: string | undefined; danger?: boolean; disabled?: boolean; onClick(): void }) {
  return <button type="button" className={styles.columnMenuAction} data-danger={danger ? "true" : "false"} disabled={disabled} onClick={onClick}>
    <Icon name={icon} size={17} />
    <span>{children}</span>
    {detail ? <small>{detail}</small> : null}
  </button>;
}

export function PropertyHeaderMenu({ category, definition, view, sortDirection, onViewChange, onCategoryChange }: {
  category: CareerCategory;
  definition: CareerPropertyDefinitionV2;
  view: CareerViewConfiguration;
  sortDirection: "asc" | "desc" | null;
  onViewChange(next: CareerViewConfiguration): void;
  onCategoryChange(nextCategory: CareerCategory, nextView?: CareerViewConfiguration): void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(definition.name);
  const [position, setPosition] = useState<Position | null>(null);
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const meta = typeMeta(definition.type);
  const editableType = TYPES.some((item) => item.value === definition.type);
  const schemaEditable = !category.isSystem && !definition.system;
  const typeEditable = schemaEditable && editableType;

  useEffect(() => setName(definition.name), [definition.name]);

  const positionMenu = useCallback(() => {
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger) return;
    const anchor = trigger.getBoundingClientRect();
    const viewportGap = 12;
    const gap = 4;
    const width = Math.min(320, window.innerWidth - viewportGap * 2);
    const desiredHeight = Math.min(menu?.scrollHeight ?? 560, window.innerHeight - viewportGap * 2);
    const roomBelow = window.innerHeight - anchor.bottom - gap - viewportGap;
    const roomAbove = anchor.top - gap - viewportGap;
    const openAbove = roomBelow < Math.min(desiredHeight, 360) && roomAbove > roomBelow;
    const maxHeight = Math.max(240, openAbove ? roomAbove : roomBelow);
    const top = openAbove ? Math.max(viewportGap, anchor.top - Math.min(desiredHeight, maxHeight) - gap) : anchor.bottom + gap;
    const left = Math.min(Math.max(viewportGap, anchor.left), window.innerWidth - width - viewportGap);
    setPosition({ top: Math.round(top), left: Math.round(left), width: Math.round(width), maxHeight: Math.round(maxHeight) });
  }, []);

  useLayoutEffect(() => { if (open) positionMenu(); }, [open, pending, positionMenu]);

  useEffect(() => {
    if (!open) return;
    const reposition = () => positionMenu();
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (target instanceof Element && target.closest("[data-property-floating-layer]")) return;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    const closeWithEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (pending) { setPending(null); return; }
      setOpen(false);
      triggerRef.current?.focus();
    };
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeWithEscape);
    if (!pending) queueMicrotask(() => nameRef.current?.focus());
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeWithEscape);
    };
  }, [open, pending, positionMenu]);

  async function previewChange(change: CareerPropertySchemaChange): Promise<CareerPropertyChangePreview> {
    const response = await fetch(`/api/career/categories/${category.id}/property-schema/preview`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(change) });
    if (!response.ok) throw new Error("속성 변경 영향을 확인하지 못했습니다.");
    return ((await response.json()) as { data: CareerPropertyChangePreview }).data;
  }

  async function applyPreview(preview: CareerPropertyChangePreview, confirmLossy: boolean, nextView?: (category: CareerCategory) => CareerViewConfiguration) {
    const response = await fetch(`/api/career/categories/${category.id}/property-schema/apply`, {
      method: "POST",
      headers: { "content-type": "application/json", "if-match": `"v${preview.categoryVersion}"`, "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify({ change: preview.change, previewToken: preview.previewToken, confirmLossy }),
    });
    if (response.status === 409 || response.status === 412) throw new Error("속성이 바뀌었습니다. 새로고침한 뒤 다시 시도해 주세요.");
    if (!response.ok) throw new Error("속성을 변경하지 못했습니다.");
    const nextCategory = ((await response.json()) as { data: CareerCategory }).data;
    onCategoryChange(nextCategory, nextView?.(nextCategory));
    setPending(null);
    return nextCategory;
  }

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setIssue(null);
    try { await task(); }
    catch (error) { setIssue(error instanceof Error ? error.message : "속성을 변경하지 못했습니다."); }
    finally { setBusy(false); }
  }

  async function rename() {
    const nextName = name.trim();
    if (!schemaEditable || !nextName || nextName === definition.name) { setName(definition.name); return; }
    await run(async () => { await applyPreview(await previewChange({ kind: "rename", propertyId: definition.id, name: nextName }), false); });
  }

  async function changeType(type: string) {
    if (!typeEditable || type === definition.type || !TYPES.some((item) => item.value === type)) return;
    await run(async () => {
      const preview = await previewChange({ kind: "type-change", propertyId: definition.id, type: type as EditableType, config: configForType(type as EditableType) });
      const lossy = preview.impact.lossyExamples.length > 0 || preview.impact.convertibleCount < preview.impact.affectedRecordCount;
      if (lossy) {
        setPending({ preview, title: "유형을 변경할까요?", description: `${preview.impact.affectedRecordCount}개 값 중 ${preview.impact.convertibleCount}개를 변환할 수 있습니다.` });
        return;
      }
      await applyPreview(preview, false);
    });
  }

  function insertIntoView(propertyId: string, side: "left" | "right") {
    const order = view.propertyOrder.filter((id) => id !== propertyId);
    const anchor = Math.max(0, order.indexOf(definition.id));
    order.splice(side === "left" ? anchor : anchor + 1, 0, propertyId);
    return { ...view, visiblePropertyIds: view.visiblePropertyIds.includes(propertyId) ? view.visiblePropertyIds : [...view.visiblePropertyIds, propertyId], propertyOrder: order };
  }

  async function createProperty(kind: "insert-left" | "insert-right" | "duplicate") {
    await run(async () => {
      const id = crypto.randomUUID();
      const duplicate = kind === "duplicate";
      const type = duplicate ? definition.type : "text";
      const definitions = category.propertySchemaV2 ?? [];
      const generatedName = duplicate
        ? nextNumberedPropertyName(propertyNameBase(definition.name), definitions)
        : nextNumberedPropertyName("텍스트", definitions);
      const change: CareerPropertySchemaChange = {
        kind: "create",
        property: {
          id,
          key: `property_${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`,
          name: generatedName,
          type,
          required: false,
          system: false,
          config: duplicate ? { ...definition.config } : {},
          order: kind === "insert-left" ? definition.order : definition.order + 1,
        },
      };
      const preview = await previewChange(change);
      const side = kind === "insert-left" ? "left" : "right";
      await applyPreview(preview, false, () => insertIntoView(id, side));
      setOpen(false);
    });
  }

  function viewAfterDelete(): CareerViewConfiguration {
    return {
      ...view,
      filter: containsReference(view.filter, definition.id) ? null : view.filter,
      sorts: view.sorts.filter((sort) => sort.propertyId !== definition.id),
      groupPropertyId: view.groupPropertyId === definition.id ? null : view.groupPropertyId,
      visiblePropertyIds: view.visiblePropertyIds.filter((id) => id !== definition.id),
      propertyOrder: view.propertyOrder.filter((id) => id !== definition.id),
      columnWidths: withoutKey(view.columnWidths, definition.id),
      gallery: view.gallery ? { coverPropertyId: view.gallery.coverPropertyId === definition.id ? null : view.gallery.coverPropertyId, previewPropertyIds: view.gallery.previewPropertyIds.filter((id) => id !== definition.id) } : null,
      timeline: view.timeline && (view.timeline.startPropertyId === definition.id || view.timeline.endPropertyId === definition.id) ? null : view.timeline,
    };
  }

  async function requestDelete() {
    if (!schemaEditable) return;
    await run(async () => {
      const preview = await previewChange({ kind: "delete", propertyId: definition.id });
      setPending({ preview, title: "속성을 삭제할까요?", description: `${preview.impact.affectedRecordCount}개 기록의 값과 연결된 보기 ${preview.impact.dependentViews.length}개에 영향을 줍니다.`, nextView: () => viewAfterDelete() });
    });
  }

  function setSort(direction: "asc" | "desc") {
    onViewChange({ ...view, sorts: [{ propertyId: definition.id, direction, nulls: "last" }] });
    setOpen(false);
  }

  function hideProperty() {
    if (definition.type === "title") return;
    onViewChange({ ...view, visiblePropertyIds: view.visiblePropertyIds.filter((id) => id !== definition.id) });
    setOpen(false);
  }

  const menu = open ? <section
    ref={menuRef}
    className={styles.columnMenu}
    style={position ? { top: position.top, left: position.left, width: position.width, maxHeight: position.maxHeight } as CSSProperties : { visibility: "hidden" }}
    role="dialog"
    aria-modal="false"
    aria-label={`${definition.name} 속성 편집`}
    data-table-property-menu
  >
    <div className={styles.columnMenuNameRow}>
      <span><Icon name={meta.icon} size={18} /></span>
      <input ref={nameRef} aria-label="속성 이름" value={name} disabled={!schemaEditable || busy} maxLength={80} onChange={(event) => setName(event.target.value)} onBlur={() => void rename()} onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }} />
    </div>
    <div className={styles.columnMenuTypeRow}>
      <Icon name="arrows-left-right" size={17} />
      <span>유형</span>
      <PropertySelect label="속성 유형" value={editableType ? definition.type : ""} placeholder={meta.label} disabled={!typeEditable || busy} options={TYPES.map((item) => ({ value: item.value, label: item.label }))} onChange={(type) => void changeType(type)} />
    </div>
    <div className={styles.columnMenuSection}>
      <MenuAction icon="funnel" disabled={busy} onClick={() => { onViewChange({ ...view, filter: { propertyId: definition.id, operator: "is_not_empty", operand: null } }); setOpen(false); }}>필터</MenuAction>
      <MenuAction icon="sort-ascending" detail={sortDirection === "asc" ? "적용됨" : undefined} disabled={busy} onClick={() => setSort("asc")}>오름차순 정렬</MenuAction>
      <MenuAction icon="sort-descending" detail={sortDirection === "desc" ? "적용됨" : undefined} disabled={busy} onClick={() => setSort("desc")}>내림차순 정렬</MenuAction>
      <MenuAction icon="stack" detail={view.groupPropertyId === definition.id ? "적용됨" : undefined} disabled={busy} onClick={() => { onViewChange({ ...view, groupPropertyId: definition.id }); setOpen(false); }}>그룹화</MenuAction>
      <MenuAction icon="eye-slash" disabled={busy || definition.type === "title"} onClick={hideProperty}>숨기기</MenuAction>
    </div>
    <div className={styles.columnMenuSection}>
      <MenuAction icon="arrow-line-left" disabled={busy || category.isSystem} onClick={() => void createProperty("insert-left")}>왼쪽에 삽입</MenuAction>
      <MenuAction icon="arrow-line-right" disabled={busy || category.isSystem} onClick={() => void createProperty("insert-right")}>오른쪽에 삽입</MenuAction>
      <MenuAction icon="copy" disabled={busy || category.isSystem || definition.system} onClick={() => void createProperty("duplicate")}>속성 복제</MenuAction>
      <MenuAction icon="trash" danger disabled={busy || !schemaEditable} onClick={() => void requestDelete()}>속성 삭제</MenuAction>
    </div>
    {pending ? <div className={styles.columnMenuConfirm} role="alertdialog" aria-label={pending.title}>
      <strong>{pending.title}</strong>
      <p>{pending.description}</p>
      <div><button type="button" onClick={() => setPending(null)}>취소</button><button type="button" disabled={busy} onClick={() => void run(async () => { await applyPreview(pending.preview, true, pending.nextView); if (pending.preview.change.kind === "delete") setOpen(false); })}>변경 적용</button></div>
    </div> : null}
    {busy ? <p className={styles.columnMenuStatus} role="status">속성을 변경하고 있습니다.</p> : null}
    {issue ? <p className={styles.columnMenuIssue} role="alert">{issue}</p> : null}
  </section> : null;

  return <>
    <button ref={triggerRef} type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => { setIssue(null); setPending(null); setOpen((current) => !current); }}>
      <Icon name={meta.icon} size={13} />
      <span>{definition.name}</span>
      {sortDirection ? <Icon name={sortDirection === "asc" ? "sort-ascending" : "sort-descending"} size={12} /> : <Icon name="caret-down" size={11} />}
    </button>
    {menu && typeof document !== "undefined" ? createPortal(menu, document.body) : null}
  </>;
}
