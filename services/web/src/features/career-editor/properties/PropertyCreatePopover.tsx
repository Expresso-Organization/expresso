"use client";

import type {
  CareerCategory,
  CareerFormulaPreview,
  CareerPropertyDefinitionV2,
  CareerPropertySchemaChange,
  CareerRollupPreview,
} from "@expresso/contracts";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { Icon } from "@/components/ui/Icon";

import { FormulaEditor } from "./FormulaEditor";
import { PropertySelect } from "./PropertySelect";
import { RollupEditor, type RollupConfiguration } from "./RollupEditor";
import styles from "./properties.module.css";

type CreatableType = Exclude<CareerPropertyDefinitionV2["type"], "title" | "created_time" | "updated_time">;

const PROPERTY_TYPES: ReadonlyArray<{ value: CreatableType; label: string; icon: string; needsSetup?: boolean }> = [
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
  { value: "relation", label: "관계", icon: "arrow-up-right", needsSetup: true },
  { value: "formula", label: "수식", icon: "function", needsSetup: true },
  { value: "rollup", label: "롤업", icon: "magnifying-glass", needsSetup: true },
];

interface PopoverPosition { top: number; left: number; width: number; maxHeight: number }

export function PropertyCreatePopover({ categoryId, definitions, disabled, onDefinitionsChange, onVersionConflict }: {
  categoryId: string;
  definitions: readonly CareerPropertyDefinitionV2[];
  disabled: boolean;
  onDefinitionsChange(definitions: CareerPropertyDefinitionV2[]): void;
  onVersionConflict(): void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [setupType, setSetupType] = useState<CreatableType | null>(null);
  const [busyType, setBusyType] = useState<CreatableType | null>(null);
  const [issue, setIssue] = useState<string | null>(null);
  const [categories, setCategories] = useState<CareerCategory[]>([]);
  const [targetCategoryId, setTargetCategoryId] = useState("");
  const [cardinality, setCardinality] = useState<"single" | "multiple">("multiple");
  const [position, setPosition] = useState<PopoverPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const activeDefinitions = useMemo(() => definitions.filter((definition) => definition.deletedAt === null), [definitions]);

  const positionPopover = useCallback(() => {
    const trigger = triggerRef.current;
    const popover = popoverRef.current;
    if (!trigger) return;
    const anchor = trigger.getBoundingClientRect();
    const viewportGap = 12;
    const gap = 7;
    const width = Math.min(320, window.innerWidth - viewportGap * 2);
    const measuredHeight = Math.min(popover?.scrollHeight ?? 520, window.innerHeight - viewportGap * 2);
    const roomBelow = window.innerHeight - anchor.bottom - gap - viewportGap;
    const roomAbove = anchor.top - gap - viewportGap;
    const openAbove = roomBelow < Math.min(measuredHeight, 360) && roomAbove > roomBelow;
    const maxHeight = Math.max(220, openAbove ? roomAbove : roomBelow);
    const top = openAbove ? Math.max(viewportGap, anchor.top - Math.min(measuredHeight, maxHeight) - gap) : anchor.bottom + gap;
    const left = Math.min(Math.max(viewportGap, anchor.left), window.innerWidth - width - viewportGap);
    setPosition({ top: Math.round(top), left: Math.round(left), width: Math.round(width), maxHeight: Math.round(maxHeight) });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    positionPopover();
  }, [open, setupType, positionPopover]);

  useEffect(() => {
    if (!open) return;
    const reposition = () => positionPopover();
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (target instanceof Element && target.closest("[data-property-floating-layer]")) return;
      if (!triggerRef.current?.contains(target) && !popoverRef.current?.contains(target)) setOpen(false);
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    window.document.addEventListener("pointerdown", closeOutside);
    window.document.addEventListener("keydown", closeWithEscape);
    queueMicrotask(() => nameRef.current?.focus());
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      window.document.removeEventListener("pointerdown", closeOutside);
      window.document.removeEventListener("keydown", closeWithEscape);
    };
  }, [open, positionPopover]);

  useEffect(() => {
    if (!open || (setupType !== "relation" && setupType !== "rollup")) return;
    void fetch("/api/career/categories")
      .then(async (response) => response.ok ? response.json() as Promise<{ data: CareerCategory[] }> : Promise.reject(new Error("카테고리를 불러오지 못했습니다.")))
      .then((payload) => {
        setCategories(payload.data);
        setTargetCategoryId((current) => current || payload.data[0]?.id || "");
      })
      .catch(() => setIssue("연결할 카테고리를 불러오지 못했습니다."));
  }, [open, setupType]);

  function openPopover() {
    if (!open) {
      setName("");
      setSetupType(null);
      setIssue(null);
      setTargetCategoryId("");
      setCardinality("multiple");
    }
    setOpen((current) => !current);
  }

  function propertyName(type: CreatableType): string {
    return name.trim() || PROPERTY_TYPES.find((option) => option.value === type)?.label || "새 속성";
  }

  async function createProperty(type: CreatableType, config: Record<string, unknown>) {
    setBusyType(type);
    setIssue(null);
    const change: CareerPropertySchemaChange = {
      kind: "create",
      property: {
        key: `property_${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`,
        name: propertyName(type),
        type,
        required: false,
        system: false,
        config,
      },
    };
    try {
      const previewResponse = await fetch(`/api/career/categories/${categoryId}/property-schema/preview`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(change),
      });
      if (!previewResponse.ok) throw new Error("속성을 확인하지 못했습니다.");
      const preview = (await previewResponse.json() as { data: { categoryVersion: number; previewToken: string } }).data;
      const applyResponse = await fetch(`/api/career/categories/${categoryId}/property-schema/apply`, {
        method: "POST",
        headers: { "content-type": "application/json", "if-match": `"v${preview.categoryVersion}"`, "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ change, previewToken: preview.previewToken, confirmLossy: false }),
      });
      if (applyResponse.status === 409 || applyResponse.status === 412) {
        onVersionConflict();
        return;
      }
      if (!applyResponse.ok) throw new Error("속성을 추가하지 못했습니다.");
      const payload = await applyResponse.json() as { data: { propertySchemaV2?: CareerPropertyDefinitionV2[] } };
      if (payload.data.propertySchemaV2) onDefinitionsChange(payload.data.propertySchemaV2);
      setOpen(false);
    } catch (error) {
      setIssue(error instanceof Error ? error.message : "속성을 추가하지 못했습니다.");
    } finally {
      setBusyType(null);
    }
  }

  async function chooseType(type: CreatableType) {
    const option = PROPERTY_TYPES.find((item) => item.value === type);
    if (option?.needsSetup) {
      setSetupType(type);
      setIssue(null);
      return;
    }
    await createProperty(type, type === "select" || type === "multi_select" ? { options: [] } : {});
  }

  async function previewFormula(source: string): Promise<CareerFormulaPreview> {
    const response = await fetch("/api/career/formulas/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ categoryId, source }) });
    if (!response.ok) throw new Error("수식을 확인하지 못했습니다.");
    return ((await response.json()) as { data: CareerFormulaPreview }).data;
  }

  async function previewRollup(configuration: RollupConfiguration): Promise<CareerRollupPreview> {
    const response = await fetch("/api/career/rollups/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ categoryId, ...configuration }) });
    if (!response.ok) throw new Error("롤업을 확인하지 못했습니다.");
    return ((await response.json()) as { data: CareerRollupPreview }).data;
  }

  function targetProperties(relationPropertyId: string): readonly CareerPropertyDefinitionV2[] {
    const relation = definitions.find((definition) => definition.id === relationPropertyId);
    const relatedCategoryId = typeof relation?.config.targetCategoryId === "string" ? relation.config.targetCategoryId : null;
    return categories.find((category) => category.id === relatedCategoryId)?.propertySchemaV2 ?? [];
  }

  const popover = open ? <section
    ref={popoverRef}
    className={styles.propertyCreatePopover}
    style={position ? { top: position.top, left: position.left, width: position.width, maxHeight: position.maxHeight } as CSSProperties : { visibility: "hidden" }}
    role="dialog"
    aria-modal="false"
    aria-label="속성 추가"
  >
    <div className={styles.propertyCreateNameRow}>
      <span className={styles.propertyCreateIcon} aria-hidden="true"><Icon name={setupType ? PROPERTY_TYPES.find((option) => option.value === setupType)?.icon ?? "text-aa" : "text-aa"} size={18} /></span>
      <input ref={nameRef} value={name} maxLength={80} aria-label="속성 이름" placeholder="속성 이름" onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !setupType) { event.preventDefault(); void chooseType("text"); } }} />
    </div>
    {setupType ? <div className={styles.propertyCreateSetup}>
      <button type="button" className={styles.propertyCreateBack} onClick={() => { setSetupType(null); setIssue(null); }}><Icon name="caret-left" size={14} />유형 선택</button>
      <strong>{PROPERTY_TYPES.find((option) => option.value === setupType)?.label} 설정</strong>
      {setupType === "relation" ? <>
        <label>대상 카테고리<PropertySelect label="대상 카테고리" value={targetCategoryId} placeholder="카테고리를 선택하세요" options={categories.map((category) => ({ value: category.id, label: category.name }))} onChange={setTargetCategoryId} /></label>
        <label>연결 방식<PropertySelect label="연결 방식" value={cardinality} placeholder="연결 방식을 선택하세요" options={[{ value: "multiple", label: "여러 기록" }, { value: "single", label: "한 기록" }]} onChange={(value) => setCardinality(value as "single" | "multiple")} /></label>
        <button type="button" className={styles.propertyCreateCommit} disabled={!targetCategoryId || busyType !== null} onClick={() => void createProperty("relation", { targetCategoryId, inversePropertyId: null, cardinality, deletePolicy: "nullify" })}>관계 속성 추가</button>
      </> : null}
      {setupType === "formula" ? <FormulaEditor source="" properties={activeDefinitions} preview={previewFormula} onCommit={async (source) => { const formula = await previewFormula(source); await createProperty("formula", { source, ast: formula.ast, diagnostics: formula.diagnostics }); }} /> : null}
      {setupType === "rollup" ? <RollupEditor configuration={null} properties={activeDefinitions} targetProperties={targetProperties} preview={previewRollup} onCommit={async (configuration) => createProperty("rollup", { ...configuration })} /> : null}
    </div> : <>
      <div className={styles.propertyTypeHeading}><span>유형</span><Icon name="magnifying-glass" size={14} /></div>
      <div className={styles.propertyTypeList} role="listbox" aria-label="속성 유형">
        {PROPERTY_TYPES.map((option) => <button key={option.value} type="button" role="option" aria-selected="false" disabled={busyType !== null} onClick={() => void chooseType(option.value)}>
          <Icon name={option.icon} size={18} />
          <span>{option.label}</span>
          {option.needsSetup ? <Icon name="caret-right" size={13} /> : null}
        </button>)}
      </div>
    </>}
    {busyType ? <p className={styles.propertyCreateStatus} role="status">{propertyName(busyType)} 속성을 추가하는 중입니다.</p> : null}
    {issue ? <p className={styles.issue} role="alert">{issue}</p> : null}
  </section> : null;

  return <div className={styles.propertyCreateAnchor}>
    <button ref={triggerRef} type="button" disabled={disabled} aria-haspopup="dialog" aria-expanded={open} title={disabled ? "기본 카테고리의 속성 구성은 고정되어 있습니다." : "속성 추가"} onClick={openPopover}><Icon name="plus" size={13}/>속성 추가</button>
    {popover && typeof document !== "undefined" ? createPortal(popover, document.body) : null}
  </div>;
}
