"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { PortfolioIntent, RecipeV2, RecipeV2Edit } from "@expresso/contracts";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { Icon } from "@/components/ui/Icon";

import { JobPostingPicker } from "./JobPostingPicker";
import { useRecipeEditor } from "./recipe-editor";
import styles from "./Workbench.module.css";

/** 문서에서 근거로 걸 수 있는 것 — 이 제작에 고른 기록. */
export type RecordCard = {
  recordId: string;
  title: string;
  categoryName: string;
  categoryIcon: string;
};

/** 고른 공고의 요건. 근거가 요건을 가리키면 이 글이 보인다. */
export type RequirementCard = { id: string; label: string };

type Section = RecipeV2["sections"][number];
type Item = Section["items"][number];
type Binding = Item["sourceBindings"][number];

const SOURCE_LABEL = { record: "기록", requirement: "공고 요건", answer: "대화 답변" } as const;
const SOURCE_ICON = { record: "file-text", requirement: "target", answer: "chat-circle-dots" } as const;

function no(order: number): string {
  return String(order + 1).padStart(2, "0");
}

/** 근거 하나를 화면에 적는 법. 기록은 제목, 요건은 요건 문장, 나머지는 갈래 이름. */
function describe(
  binding: Binding,
  recordById: Map<string, RecordCard>,
  requirementById: Map<string, RequirementCard>,
): { icon: string; title: string; kind: string } {
  if (binding.sourceType === "record") {
    const record = recordById.get(binding.sourceId);
    return { icon: record?.categoryIcon ?? SOURCE_ICON.record, title: record?.title ?? "고른 목록에 없는 기록", kind: record?.categoryName ?? SOURCE_LABEL.record };
  }
  if (binding.sourceType === "requirement") {
    return { icon: SOURCE_ICON.requirement, title: requirementById.get(binding.sourceId)?.label ?? SOURCE_LABEL.requirement, kind: SOURCE_LABEL.requirement };
  }
  return { icon: SOURCE_ICON.answer, title: SOURCE_LABEL.answer, kind: SOURCE_LABEL.answer };
}

function sectionOfItem(sections: Section[], itemId: string): Section | undefined {
  return sections.find(({ items }) => items.some(({ id }) => id === itemId));
}

function sameOrder(a: Section[], b: Section[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((section, index) => {
    const other = b[index]!;
    return section.id === other.id
      && section.items.length === other.items.length
      && section.items.every(({ id }, at) => id === other.items[at]!.id);
  });
}

/**
 * 02 레시피.
 *
 * 여기서 정하는 것은 **어떤 내용이 어떤 순서로 들어갈지**뿐이다. 지면의 모양은
 * 01에서 고른 디자인 안에서 03 생성이 정한다.
 *
 * 두 영역이다 — 왼쪽은 목차와 안 쓴 기록, 가운데는 섹션 카드다. 편집은 화면에
 * 먼저 반영되고 저장이 뒤따른다(`useRecipeEditor`).
 */
export function Workbench({
  brewId,
  initialRecipe,
  records,
  requirements,
  designName,
}: {
  brewId: string;
  initialRecipe: RecipeV2;
  records: RecordCard[];
  requirements: RequirementCard[];
  designName: string | null;
}) {
  const router = useRouter();
  const editor = useRecipeEditor(initialRecipe);
  /** dnd-kit 이 접근성 설명 요소에 붙이는 id. 서버와 클라이언트가 같은 값을 써야 hydration 이 맞는다. */
  const dndId = useId();
  const { recipe } = editor;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [postingMenu, setPostingMenu] = useState(false);
  const [intentOpen, setIntentOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  /** 드래그하는 동안의 순서. 놓으면 한 번 저장하고 비운다. */
  const [live, setLive] = useState<Section[] | null>(null);
  const [dragType, setDragType] = useState<"section" | "item" | null>(null);

  const sections = live ?? recipe.sections;
  const placed = useMemo(() => recipe.sections.flatMap((section) => section.items), [recipe]);
  const recordById = useMemo(() => new Map(records.map((record) => [record.recordId, record])), [records]);
  const requirementById = useMemo(() => new Map(requirements.map((requirement) => [requirement.id, requirement])), [requirements]);
  const selected = useMemo(() => placed.find(({ id }) => id === selectedId) ?? null, [placed, selectedId]);

  /** 어디에도 걸리지 않은 기록. 초안이 남긴 이유와 함께 왼쪽에 선다. */
  const unused = useMemo(() => {
    const used = new Set(placed.flatMap(({ sourceBindings }) => sourceBindings.map(({ sourceId }) => sourceId)));
    return recipe.unusedSources.flatMap(({ recordId, reason }) => {
      const record = recordById.get(recordId);
      return record && !used.has(recordId) ? [{ record, reason }] : [];
    });
  }, [placed, recipe.unusedSources, recordById]);

  const { undo, redo } = editor;
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPostingMenu(false);
        setRailOpen(false);
        setSelectedId(null);
        return;
      }
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z") return;
      // 글 입력 칸 안에서는 브라우저의 되돌리기가 먼저다.
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  function saveIntent(patch: Partial<PortfolioIntent>) {
    const intent = { ...recipe.intent, ...patch };
    if (JSON.stringify(intent) === JSON.stringify(recipe.intent)) return;
    void editor.apply({ operation: "update_intent", intent });
  }

  function reveal(id: string) {
    document.getElementById(id)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  /** 고른 문장에 기록을 건다. 중심이 없으면 중심, 있으면 보조다. */
  function bindToSelected(recordId: string) {
    if (!selected) return;
    const primary = selected.sourceBindings.some(({ role }) => role === "primary");
    void editor.apply({ operation: "bind_source", itemId: selected.id, sourceType: "record", sourceId: recordId, role: primary ? "supporting" : "primary" });
  }

  async function confirm() {
    setConfirming(true);
    const ok = await editor.apply({ operation: "confirm" });
    setConfirming(false);
    if (ok) router.push(`/brew/${brewId}/generate` as Route);
  }

  // ── 순서 — 드래그 ──────────────────────────────────────────

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /** 섹션을 끌면 섹션끼리만, 문장을 끌면 문장과 빈 섹션 자리만 본다. */
  const collision: CollisionDetection = (args) => {
    const type = args.active.data.current?.["type"];
    const containers = args.droppableContainers.filter((container) => {
      const kind = container.data.current?.["type"];
      return type === "section" ? kind === "section" : kind === "item" || kind === "zone";
    });
    return closestCorners({ ...args, droppableContainers: containers });
  };

  function onDragStart({ active }: DragStartEvent) {
    setLive(recipe.sections);
    setDragType(active.data.current?.["type"] === "section" ? "section" : "item");
    setPostingMenu(false);
  }

  /** 문장이 다른 섹션 위로 가면 그 섹션으로 옮겨 둔다. 같은 섹션 안은 놓을 때 정한다. */
  function onDragOver({ active, over }: DragOverEvent) {
    if (!over || active.data.current?.["type"] !== "item") return;
    setLive((current) => {
      const now = current ?? recipe.sections;
      const from = sectionOfItem(now, String(active.id));
      const overKind = over.data.current?.["type"];
      const toId = overKind === "zone"
        ? String(over.data.current?.["sectionId"])
        : overKind === "item" ? sectionOfItem(now, String(over.id))?.id : undefined;
      if (!from || !toId || from.id === toId) return current;
      const moving = from.items.find(({ id }) => id === active.id)!;
      return now.map((section) => {
        if (section.id === from.id) return { ...section, items: section.items.filter(({ id }) => id !== moving.id) };
        if (section.id !== toId) return section;
        const at = overKind === "item" ? section.items.findIndex(({ id }) => id === over.id) : section.items.length;
        const items = [...section.items];
        items.splice(at < 0 ? items.length : at, 0, moving);
        return { ...section, items };
      });
    });
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    let next = live ?? recipe.sections;
    if (over && active.id !== over.id) {
      if (dragType === "section") {
        const from = next.findIndex(({ id }) => id === active.id);
        const to = next.findIndex(({ id }) => id === over.id);
        if (from >= 0 && to >= 0) next = arrayMove(next, from, to);
      } else if (over.data.current?.["type"] === "item") {
        const section = sectionOfItem(next, String(active.id));
        if (section && section.items.some(({ id }) => id === over.id)) {
          const from = section.items.findIndex(({ id }) => id === active.id);
          const to = section.items.findIndex(({ id }) => id === over.id);
          next = next.map((entry) => entry.id === section.id ? { ...entry, items: arrayMove(entry.items, from, to) } : entry);
        }
      }
    }
    setLive(null);
    setDragType(null);
    if (!sameOrder(next, recipe.sections)) editor.reorder(next);
  }

  // ── 순서 — 메뉴 ──────────────────────────────────────────

  function moveSection(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= recipe.sections.length) return;
    editor.reorder(arrayMove(recipe.sections, index, target));
  }

  /** 문장을 같은 섹션 안의 자리로, 또는 다른 섹션의 끝으로. */
  function moveItem(itemId: string, to: { index: number } | { sectionId: string }) {
    const from = sectionOfItem(recipe.sections, itemId);
    if (!from) return;
    const item = from.items.find(({ id }) => id === itemId)!;
    if ("index" in to) {
      const at = from.items.findIndex(({ id }) => id === itemId);
      const target = Math.max(0, Math.min(from.items.length - 1, to.index));
      if (at === target) return;
      editor.reorder(recipe.sections.map((section) => section.id === from.id ? { ...section, items: arrayMove(section.items, at, target) } : section));
      return;
    }
    if (to.sectionId === from.id) return;
    editor.reorder(recipe.sections.map((section) => {
      if (section.id === from.id) return { ...section, items: section.items.filter(({ id }) => id !== itemId) };
      if (section.id === to.sectionId) return { ...section, items: [...section.items, item] };
      return section;
    }));
  }

  const failed = editor.saveState === "failed";

  return (
    <div className={styles.workbench} data-dragging={dragType ?? undefined}>
      {/* ── 상단 한 줄 ─────────────────────────────────────── */}
      <header className={styles.topBar}>
        <button
          type="button"
          className={styles.iconButton}
          onClick={() => setRailOpen((open) => !open)}
          aria-label="목차와 기록"
          data-rail-toggle=""
        >
          <Icon name="list" size={16} />
        </button>
        <input
          className={styles.title}
          defaultValue={recipe.title}
          placeholder="포트폴리오 제목"
          maxLength={300}
          aria-label="포트폴리오 제목"
          onBlur={(event) => {
            const title = event.target.value.trim();
            if (title !== recipe.title) void editor.apply({ operation: "update_title", title });
          }}
        />
        <button
          type="button"
          className={styles.chip}
          data-open={intentOpen ? "1" : undefined}
          onClick={() => setIntentOpen((open) => !open)}
          aria-expanded={intentOpen}
        >
          <Icon name="sliders-horizontal" size={13} /> 제작 의도
        </button>
        <Link href={`/brew/${brewId}/design` as Route} className={styles.chip}>
          <Icon name="palette" size={13} /> {designName ?? "디자인 고르기"}
        </Link>
        <span className={styles.chipMenu}>
          <button
            type="button"
            className={styles.chip}
            data-open={postingMenu ? "1" : undefined}
            onClick={() => setPostingMenu((open) => !open)}
            aria-expanded={postingMenu}
          >
            <Icon name="target" size={13} />
            <span className={styles.chipText}>
              {recipe.jobPosting
                ? `${recipe.jobPosting.companyName} · ${recipe.jobPosting.title}`
                : "지원할 공고"}
            </span>
            <Icon name="caret-down" size={11} />
          </button>
          {postingMenu ? (
            <div className={styles.menu} role="menu">
              {/* 모아 둔 공고에서 고르는 일은 실제 공고 탐색 화면이 한다. */}
              <Link href={`/jobs?pick=${brewId}` as Route} className={styles.menuItem} role="menuitem">
                <Icon name="magnifying-glass" size={14} />
                <span>
                  <strong>공고 탐색에서 고르기</strong>
                  필터 · 일치도 · 마감을 그대로 보고 고릅니다
                </span>
              </Link>
              <button
                type="button"
                className={styles.menuItem}
                role="menuitem"
                onClick={() => { setPostingMenu(false); setPickerOpen(true); }}
              >
                <Icon name="clipboard-text" size={14} />
                <span>
                  <strong>공고 붙여넣기</strong>
                  목록에 없는 공고를 원문으로 넣습니다
                </span>
              </button>
              {recipe.jobPosting ? (
                <button
                  type="button"
                  className={styles.menuItem}
                  role="menuitem"
                  onClick={() => { setPostingMenu(false); saveIntent({ jobPostingId: null }); }}
                >
                  <Icon name="x" size={14} />
                  <span>
                    <strong>공고 없이 진행</strong>
                    고른 공고를 비웁니다
                  </span>
                </button>
              ) : null}
            </div>
          ) : null}
        </span>
        <span className={styles.history}>
          <button type="button" className={styles.iconButton} onClick={editor.undo} disabled={!editor.canUndo} aria-label="실행 취소" title="실행 취소 ⌘Z">
            <Icon name="arrow-u-up-left" size={15} />
          </button>
          <button type="button" className={styles.iconButton} onClick={editor.redo} disabled={!editor.canRedo} aria-label="다시 실행" title="다시 실행 ⇧⌘Z">
            <Icon name="arrow-u-up-right" size={15} />
          </button>
        </span>
        <span className={styles.counts}>섹션 {recipe.sections.length} · 내용 {placed.length}</span>
      </header>

      {intentOpen ? (
        <div className={styles.intentSheet}>
          <label className={styles.field}>
            <span>보여주고 싶은 역할 · 분야</span>
            <input
              defaultValue={recipe.intent.role}
              maxLength={200}
              placeholder="예: 결제 플랫폼 백엔드"
              onBlur={(event) => saveIntent({ role: event.target.value.trim() })}
            />
          </label>
          <label className={styles.field}>
            <span>주요 독자</span>
            <input
              defaultValue={recipe.intent.audience}
              maxLength={200}
              placeholder="예: 채용 담당자 · 실무 리드"
              onBlur={(event) => saveIntent({ audience: event.target.value.trim() })}
            />
          </label>
          <label className={styles.field}>
            <span>원하는 분량</span>
            <select
              defaultValue={recipe.intent.lengthPreset}
              onChange={(event) => saveIntent({ lengthPreset: event.target.value as PortfolioIntent["lengthPreset"] })}
            >
              <option value="single">짧게 · 한 장</option>
              <option value="double">보통 · 두 장</option>
              <option value="triple">길게 · 세 장</option>
            </select>
          </label>
          <label className={styles.field}>
            <span>가장 강조할 경험</span>
            <textarea
              defaultValue={recipe.intent.highlight}
              maxLength={1_000}
              rows={2}
              placeholder="비워 두면 고른 기록만으로 짭니다."
              onBlur={(event) => saveIntent({ highlight: event.target.value.trim() })}
            />
          </label>
          <label className={styles.field}>
            <span>추가 요청</span>
            <textarea
              defaultValue={recipe.intent.extraRequest}
              maxLength={2_000}
              rows={2}
              placeholder="담고 싶은 내용이나 순서에 바라는 것이 있으면 적어 주세요."
              onBlur={(event) => saveIntent({ extraRequest: event.target.value.trim() })}
            />
          </label>
        </div>
      ) : null}

      {editor.error ? (
        <p className={styles.error} role="alert">
          <Icon name="warning-circle" size={14} />
          <span>{editor.error}</span>
          <button type="button" onClick={editor.dismissError} aria-label="닫기"><Icon name="x" size={13} /></button>
        </p>
      ) : null}

      <div className={styles.panes}>
        {/* ── 왼쪽 · 목차와 기록 ───────────────────────────── */}
        <aside className={styles.rail} data-open={railOpen ? "1" : undefined}>
          <section className={styles.railBlock}>
            <div className={styles.railHead}>
              <h2>목차</h2>
              <span>{recipe.sections.length}</span>
            </div>
            {recipe.sections.length === 0 ? (
              <p className={styles.railEmpty}>아직 섹션이 없습니다.</p>
            ) : (
              <ol className={styles.outline}>
                {recipe.sections.map((section) => (
                  <li key={section.id}>
                    <button
                      type="button"
                      className={styles.outlineSection}
                      onClick={() => { reveal(`section-${section.id}`); setRailOpen(false); }}
                    >
                      <span className={styles.outlineNo}>{no(section.order)}</span>
                      <span className={styles.outlineName}>{section.title || "이름 없는 섹션"}</span>
                      <i>{section.items.length}</i>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className={styles.railBlock} data-grow="1">
            <div className={styles.railHead}>
              <h2>안 쓴 기록</h2>
              <span>{unused.length}</span>
            </div>
            {unused.length === 0 ? (
              <p className={styles.railEmpty}>고른 기록을 모두 썼습니다.</p>
            ) : (
              <ul className={styles.unused}>
                {unused.map(({ record, reason }) => (
                  <li key={record.recordId} className={styles.unusedRow}>
                    <span className={styles.unusedHead}>
                      <Icon name={record.categoryIcon} size={13} />
                      <b>{record.title}</b>
                      {selected ? (
                        <button type="button" onClick={() => bindToSelected(record.recordId)} aria-label={`${record.title}을(를) 고른 문장에 붙이기`}>
                          <Icon name="plus" size={12} /> 붙이기
                        </button>
                      ) : null}
                    </span>
                    {reason ? <span className={styles.unusedReason}>{reason}</span> : null}
                  </li>
                ))}
              </ul>
            )}
            {unused.length > 0 && !selected ? (
              <p className={styles.railHint}>문장을 고르면 여기서 바로 붙일 수 있습니다.</p>
            ) : null}
          </section>

          <div className={styles.railFoot}>
            <button
              type="button"
              className={styles.primary}
              onClick={() => void confirm()}
              disabled={confirming || failed || recipe.sections.length === 0}
            >
              <Icon name="coffee" size={15} /> 이 레시피로 생성하기
            </button>
            <Link href={`/brew/${brewId}/recipe?setup=1` as Route} className={styles.secondary}>
              <Icon name="arrow-counter-clockwise" size={13} /> 재료 다시 고르기
            </Link>
          </div>
        </aside>

        {/* ── 가운데 · 레시피 ──────────────────────────────── */}
        <main className={styles.sheet}>
          <div className={styles.doc}>
            <DndContext
              id={dndId}
              sensors={sensors}
              collisionDetection={collision}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDragEnd={onDragEnd}
              onDragCancel={() => { setLive(null); setDragType(null); }}
            >
              <SortableContext items={sections.map(({ id }) => id)} strategy={verticalListSortingStrategy}>
                {sections.map((section, sectionIndex) => (
                  <SectionCard
                    key={section.id}
                    section={section}
                    index={sectionIndex}
                    count={sections.length}
                    sections={recipe.sections}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    records={records}
                    recordById={recordById}
                    requirementById={requirementById}
                    apply={editor.apply}
                    onMoveSection={(delta) => moveSection(sectionIndex, delta)}
                    onMoveItem={moveItem}
                  />
                ))}
              </SortableContext>
            </DndContext>

            <button
              type="button"
              className={styles.addSection}
              onClick={() => void editor.apply({ operation: "add_section", title: "", purpose: "" })}
            >
              <Icon name="plus" size={14} /> 섹션 추가
            </button>
          </div>
        </main>

        {railOpen ? <button type="button" className={styles.scrim} onClick={() => setRailOpen(false)} aria-label="닫기" /> : null}
      </div>

      {pickerOpen ? (
        <JobPostingPicker
          current={recipe.jobPosting}
          onClose={() => setPickerOpen(false)}
          onPick={(jobPostingId) => { setPickerOpen(false); saveIntent({ jobPostingId }); }}
        />
      ) : null}
    </div>
  );
}

// ── 섹션 카드 ──────────────────────────────────────────────

function SectionCard({
  section,
  index,
  count,
  sections,
  selectedId,
  onSelect,
  records,
  recordById,
  requirementById,
  apply,
  onMoveSection,
  onMoveItem,
}: {
  section: Section;
  index: number;
  count: number;
  sections: Section[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  records: RecordCard[];
  recordById: Map<string, RecordCard>;
  requirementById: Map<string, RequirementCard>;
  apply: (edit: RecipeV2Edit) => Promise<boolean>;
  onMoveSection: (delta: number) => void;
  onMoveItem: (itemId: string, to: { index: number } | { sectionId: string }) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: section.id,
    data: { type: "section" },
  });
  const zone = useDroppable({ id: `zone:${section.id}`, data: { type: "zone", sectionId: section.id } });

  // 섹션이 참고한 것 — 문장 여럿이 같은 기록을 걸어도 카드는 하나다.
  const referenced = new Map<string, Binding>();
  for (const item of section.items) {
    for (const binding of item.sourceBindings) {
      const key = `${binding.sourceType}:${binding.sourceId}`;
      if (!referenced.has(key)) referenced.set(key, binding);
    }
  }

  const style: CSSProperties = { transform: CSS.Transform.toString(transform), transition };

  return (
    <section
      ref={setNodeRef}
      id={`section-${section.id}`}
      className={styles.section}
      style={style}
      data-dragging={isDragging ? "1" : undefined}
    >
      <div className={styles.sectionHead}>
        <button
          ref={setActivatorNodeRef}
          type="button"
          className={styles.handle}
          aria-label="섹션 끌어서 옮기기"
          {...attributes}
          {...listeners}
        >
          <Icon name="dots-six-vertical" size={16} />
        </button>
        <span className={styles.sectionNo}>{no(index)}</span>
        <AutoTextarea
          className={styles.sectionTitle}
          value={section.title}
          maxLength={300}
          placeholder="섹션 이름"
          ariaLabel="섹션 이름"
          onCommit={(title) => {
            if (title !== section.title) void apply({ operation: "update_section", sectionId: section.id, title });
          }}
        />
        <span className={styles.tools}>
          <button type="button" className={styles.tool} onClick={() => onMoveSection(-1)} disabled={index === 0} aria-label="섹션 위로">
            <Icon name="arrow-up" size={14} />
          </button>
          <button type="button" className={styles.tool} onClick={() => onMoveSection(1)} disabled={index === count - 1} aria-label="섹션 아래로">
            <Icon name="arrow-down" size={14} />
          </button>
          <button type="button" className={styles.tool} onClick={() => void apply({ operation: "delete_section", sectionId: section.id })} aria-label="섹션 지우기">
            <Icon name="trash" size={14} />
          </button>
        </span>
      </div>

      <div className={styles.sectionBody}>
        <AutoTextarea
          className={styles.sectionPurpose}
          value={section.purpose}
          maxLength={1_000}
          placeholder="이 섹션을 왜 두는지"
          ariaLabel="섹션 목적"
          onCommit={(purpose) => {
            if (purpose !== section.purpose) void apply({ operation: "update_section", sectionId: section.id, purpose });
          }}
        />
        {/* 기획서 §7.8 의 이름 그대로. 풀어 쓰지 않는다. */}
        <div className={styles.takeawayRow}>
          <span className={styles.takeawayLabel}>핵심 메시지</span>
          <AutoTextarea
            className={styles.takeaway}
            value={section.takeaway}
            maxLength={500}
            placeholder="이 섹션을 읽고 나면 남아야 하는 한 문장"
            ariaLabel="핵심 메시지"
            onCommit={(takeaway) => {
              if (takeaway !== section.takeaway) void apply({ operation: "update_section", sectionId: section.id, takeaway });
            }}
          />
        </div>

        <SortableContext items={section.items.map(({ id }) => id)} strategy={verticalListSortingStrategy}>
          <ul ref={zone.setNodeRef} className={styles.items} data-over={zone.isOver ? "1" : undefined}>
            {section.items.map((item, itemIndex) => (
              <ItemRow
                key={item.id}
                item={item}
                index={itemIndex}
                count={section.items.length}
                section={section}
                sections={sections}
                selected={item.id === selectedId}
                onSelect={() => onSelect(item.id)}
                records={records}
                recordById={recordById}
                requirementById={requirementById}
                apply={apply}
                onMove={onMoveItem}
              />
            ))}
            {section.items.length === 0 ? (
              <li className={styles.itemsEmpty}>문장을 여기로 끌어오거나 아래에서 더합니다.</li>
            ) : null}
          </ul>
        </SortableContext>

        <button
          type="button"
          className={styles.addItem}
          onClick={() => void apply({ operation: "add_item", sectionId: section.id })}
        >
          <Icon name="plus" size={13} /> 내용 추가
        </button>

        {referenced.size > 0 ? (
          <div className={styles.sources}>
            <span className={styles.sourcesHead}>참고한 기록</span>
            <div className={styles.sourceCards}>
              {[...referenced.values()].map((binding) => {
                const shown = describe(binding, recordById, requirementById);
                return (
                  <span key={`${binding.sourceType}:${binding.sourceId}`} className={styles.sourceCard}>
                    <Icon name={shown.icon} size={13} />
                    <b>{shown.title}</b>
                    <em>{shown.kind}</em>
                  </span>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

// ── 문장 한 줄 ─────────────────────────────────────────────

function ItemRow({
  item,
  index,
  count,
  section,
  sections,
  selected,
  onSelect,
  records,
  recordById,
  requirementById,
  apply,
  onMove,
}: {
  item: Item;
  index: number;
  count: number;
  section: Section;
  sections: Section[];
  selected: boolean;
  onSelect: () => void;
  records: RecordCard[];
  recordById: Map<string, RecordCard>;
  requirementById: Map<string, RequirementCard>;
  apply: (edit: RecipeV2Edit) => Promise<boolean>;
  onMove: (itemId: string, to: { index: number } | { sectionId: string }) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    data: { type: "item", sectionId: section.id },
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const menuRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!menuOpen && !addOpen) return;
    function onPointer(event: PointerEvent) {
      if (menuRef.current?.contains(event.target as Node)) return;
      setMenuOpen(false);
      setMoveOpen(false);
      setAddOpen(false);
    }
    window.addEventListener("pointerdown", onPointer);
    return () => window.removeEventListener("pointerdown", onPointer);
  }, [menuOpen, addOpen]);

  const primary = item.sourceBindings.find(({ role }) => role === "primary")?.sourceId ?? null;
  const bound = new Set(item.sourceBindings.map(({ sourceId }) => sourceId));
  const unbound = records.filter(({ recordId }) => !bound.has(recordId));
  const others = sections.filter(({ id }) => id !== section.id);

  const style: CSSProperties = { transform: CSS.Transform.toString(transform), transition };

  return (
    <li
      ref={setNodeRef}
      className={styles.item}
      style={style}
      data-selected={selected ? "1" : undefined}
      data-dragging={isDragging ? "1" : undefined}
      onFocusCapture={onSelect}
      onClick={onSelect}
    >
      <div className={styles.itemRow}>
        <button
          ref={setActivatorNodeRef}
          type="button"
          className={styles.handle}
          aria-label="문장 끌어서 옮기기"
          {...attributes}
          {...listeners}
        >
          <Icon name="dots-six-vertical" size={16} />
        </button>
        <AutoTextarea
          className={styles.itemText}
          value={item.text}
          maxLength={2_000}
          placeholder="여기서 무엇을 말할지"
          ariaLabel="문장"
          onCommit={(text) => {
            if (text !== item.text) void apply({ operation: "update_item", itemId: item.id, text });
          }}
        />
        <span className={styles.tools} ref={menuRef}>
          <span className={styles.toolMenu}>
            <button
              type="button"
              className={styles.tool}
              onClick={(event) => { event.stopPropagation(); setMenuOpen((open) => !open); setMoveOpen(false); }}
              aria-label="옮기기"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
            >
              <Icon name="dots-three" size={15} weight="bold" />
            </button>
            {menuOpen ? (
              <span className={styles.menu} role="menu" onClick={(event) => event.stopPropagation()}>
                <button type="button" role="menuitem" className={styles.menuLine} disabled={index === 0} onClick={() => { setMenuOpen(false); onMove(item.id, { index: index - 1 }); }}>
                  <Icon name="arrow-up" size={13} /> 위로
                </button>
                <button type="button" role="menuitem" className={styles.menuLine} disabled={index === count - 1} onClick={() => { setMenuOpen(false); onMove(item.id, { index: index + 1 }); }}>
                  <Icon name="arrow-down" size={13} /> 아래로
                </button>
                <button type="button" role="menuitem" className={styles.menuLine} disabled={index === 0} onClick={() => { setMenuOpen(false); onMove(item.id, { index: 0 }); }}>
                  <Icon name="arrow-line-up" size={13} /> 맨 앞으로
                </button>
                <button type="button" role="menuitem" className={styles.menuLine} disabled={index === count - 1} onClick={() => { setMenuOpen(false); onMove(item.id, { index: count - 1 }); }}>
                  <Icon name="arrow-line-down" size={13} /> 맨 뒤로
                </button>
                <button type="button" role="menuitem" className={styles.menuLine} disabled={others.length === 0} aria-expanded={moveOpen} onClick={() => setMoveOpen((open) => !open)}>
                  <Icon name="arrow-bend-up-right" size={13} /> 섹션으로 이동
                  <Icon name={moveOpen ? "caret-up" : "caret-down"} size={11} />
                </button>
                {moveOpen ? others.map((other) => (
                  <button key={other.id} type="button" role="menuitem" className={styles.menuSub} onClick={() => { setMenuOpen(false); setMoveOpen(false); onMove(item.id, { sectionId: other.id }); }}>
                    <span className={styles.outlineNo}>{no(other.order)}</span>
                    <span className={styles.outlineName}>{other.title || "이름 없는 섹션"}</span>
                  </button>
                )) : null}
                <span className={styles.menuRule} />
                <button type="button" role="menuitem" className={styles.menuLine} onClick={() => { setMenuOpen(false); void apply({ operation: "duplicate_item", itemId: item.id }); }}>
                  <Icon name="copy" size={13} /> 복제
                </button>
                <button type="button" role="menuitem" className={styles.menuLine} data-danger="1" onClick={() => { setMenuOpen(false); void apply({ operation: "delete_item", itemId: item.id }); }}>
                  <Icon name="trash" size={13} /> 지우기
                </button>
              </span>
            ) : null}
          </span>
        </span>
      </div>

      {selected ? (
        <div className={styles.evidence} onClick={(event) => event.stopPropagation()}>
          <span className={styles.evidenceHead}>근거</span>
          {item.sourceBindings.map((binding) => {
            const shown = describe(binding, recordById, requirementById);
            const isPrimary = binding.sourceId === primary;
            return (
              <button
                key={binding.sourceId}
                type="button"
                className={styles.evidenceChip}
                data-primary={isPrimary ? "1" : undefined}
                onClick={() => void apply({ operation: "unbind_source", itemId: item.id, sourceId: binding.sourceId })}
                title="누르면 뗍니다"
              >
                <Icon name={shown.icon} size={13} />
                <b>{shown.title}</b>
                <em>{isPrimary ? "중심" : "보조"}</em>
                <Icon name="x" size={11} />
              </button>
            );
          })}
          <span className={styles.toolMenu}>
            <button
              type="button"
              className={styles.evidenceAdd}
              onClick={() => setAddOpen((open) => !open)}
              aria-expanded={addOpen}
              aria-haspopup="menu"
            >
              <Icon name="plus" size={12} /> 기록
            </button>
            {addOpen ? (
              <span className={styles.menu} role="menu">
                {unbound.length === 0 ? (
                  <em className={styles.menuEmpty}>고른 기록을 이 문장에 모두 걸었습니다.</em>
                ) : unbound.map((record) => (
                  <button
                    key={record.recordId}
                    type="button"
                    role="menuitem"
                    className={styles.menuLine}
                    onClick={() => {
                      setAddOpen(false);
                      void apply({ operation: "bind_source", itemId: item.id, sourceType: "record", sourceId: record.recordId, role: primary ? "supporting" : "primary" });
                    }}
                  >
                    <Icon name={record.categoryIcon} size={13} />
                    <span className={styles.outlineName}>{record.title}</span>
                  </button>
                ))}
              </span>
            ) : null}
          </span>
        </div>
      ) : null}
    </li>
  );
}

/**
 * 글 한 칸. 글이 길어지면 칸이 따라 자란다.
 *
 * 높이는 **붙는 순간에도** 재야 한다 — 입력할 때만 재면 서버가 그려 준 항목이
 * 한 줄로 접힌 채 남는다. AI 초안은 전부 그 경우다.
 */
function AutoTextarea({
  value,
  onCommit,
  className,
  maxLength,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onCommit: (text: string) => void;
  className?: string | undefined;
  maxLength?: number | undefined;
  placeholder?: string | undefined;
  ariaLabel?: string | undefined;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function fit(area: HTMLTextAreaElement | null) {
    if (!area) return;
    area.style.height = "auto";
    area.style.height = `${area.scrollHeight}px`;
  }

  // 값이 밖에서 바뀌어도(초안 교체 · 순서 변경 · 되돌리기) 다시 맞춘다.
  useLayoutEffect(() => {
    const area = ref.current;
    if (!area) return;
    if (document.activeElement !== area) area.value = value;
    fit(area);
  }, [value]);

  return (
    <textarea
      ref={ref}
      className={className}
      defaultValue={value}
      rows={1}
      maxLength={maxLength}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onInput={(event) => fit(event.currentTarget)}
      onBlur={(event) => onCommit(event.target.value.trim())}
    />
  );
}
