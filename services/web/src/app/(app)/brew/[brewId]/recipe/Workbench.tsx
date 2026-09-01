"use client";

import {
  presentationVariantsFor,
  type BlueprintEdit,
  type BlueprintElementKind,
  type PortfolioIntent,
  type RecipeV2,
} from "@expresso/contracts";
import type { Route } from "next";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { Icon } from "@/components/ui/Icon";

import { ElementSketch } from "./ElementSketch";
import { JobPostingPicker } from "./JobPostingPicker";
import { editBlueprintAction, reorderBlueprintAction } from "./blueprint-actions";
import styles from "./Workbench.module.css";

export type RecordCard = {
  recordId: string;
  title: string;
  categoryName: string;
  categoryIcon: string;
  periodFrom: string | null;
  periodTo: string | null;
  selected: boolean;
  reason: string;
};

/** 캔버스가 빌려 쓰는 디자인의 낯. 지면 전체를 흉내 내지 않는다(§7.6). */
export type DesignFace = {
  name: string;
  accent: string;
  text: string;
  displayFamily: string;
  displayFallback: string;
};

type Element = RecipeV2["sections"][number]["elements"][number];

const KIND_LABEL: Record<BlueprintElementKind, string> = {
  hero: "히어로",
  project: "프로젝트",
  metric: "수치",
  chart: "차트",
  timeline: "경력",
  skills: "기술",
  text: "본문",
  gallery: "갤러리",
  quote: "인용",
  profile: "프로필",
  contact: "연락",
};

const KIND_ICON: Record<BlueprintElementKind, string> = {
  hero: "text-h-one",
  project: "cards",
  metric: "number-square-four",
  chart: "chart-bar",
  timeline: "git-commit",
  skills: "tag",
  text: "text-align-left",
  gallery: "images",
  quote: "quotes",
  profile: "user",
  contact: "paper-plane-tilt",
};

/** 요소를 놓는 차례. 지면에서 만나는 순서에 가깝게 세운다. */
const KIND_ORDER: BlueprintElementKind[] = [
  "hero", "project", "metric", "chart", "timeline",
  "skills", "gallery", "text", "quote", "profile", "contact",
];

const EMPHASIS = [
  { value: "primary", label: "중심" },
  { value: "secondary", label: "보조" },
  { value: "supporting", label: "배경" },
] as const;

const WIDTH = [
  { value: "narrow", label: "1/3" },
  { value: "content", label: "2/3" },
  { value: "wide", label: "5/6" },
  { value: "full", label: "전체" },
] as const;

function no(order: number): string {
  return String(order + 1).padStart(2, "0");
}

function period(from: string | null, to: string | null): string {
  if (!from && !to) return "기간 없음";
  return `${from?.slice(0, 7) ?? "?"} — ${to?.slice(0, 7) ?? "현재"}`;
}

function variantLabel(element: Element): string {
  return (
    presentationVariantsFor(element.kind).find(({ id }) => id === element.presentationVariant)?.label ??
    element.presentationVariant
  );
}

export function Workbench({
  brewId,
  initialBlueprint,
  records,
  design,
}: {
  brewId: string;
  initialBlueprint: RecipeV2;
  records: RecordCard[];
  design: DesignFace | null;
}) {
  const [blueprint, setBlueprint] = useState(initialBlueprint);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [query, setQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [postingMenu, setPostingMenu] = useState(false);
  const [intentOpen, setIntentOpen] = useState(false);
  const [paletteFor, setPaletteFor] = useState<string | null>(null);
  /** 좁은 화면에서 두 레일은 서랍이 된다(§7.3). */
  const [drawer, setDrawer] = useState<"records" | "inspector" | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const placed = useMemo(
    () => blueprint.sections.flatMap((section) => section.elements.map((element) => ({ section, element }))),
    [blueprint],
  );
  const selected = placed.find(({ element }) => element.id === selectedId) ?? null;
  const recordById = useMemo(() => new Map(records.map((record) => [record.recordId, record])), [records]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return records;
    return records.filter(
      (record) =>
        record.title.toLowerCase().includes(needle) || record.categoryName.toLowerCase().includes(needle),
    );
  }, [records, query]);

  /** 어느 기록이 지면의 어디에 쓰이는지(§7.5). */
  const usage = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const { section, element } of placed) {
      for (const binding of element.sourceBindings) {
        if (binding.sourceType !== "record") continue;
        const at = `${no(section.order)} ${section.title || "이름 없는 섹션"}`;
        map.set(binding.sourceId, [...new Set([...(map.get(binding.sourceId) ?? []), at])]);
      }
    }
    return map;
  }, [placed]);

  useEffect(() => {
    function close(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setPaletteFor(null);
      setDrawer(null);
      setPostingMenu(false);
    }
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);

  async function run(edit: BlueprintEdit) {
    setPending(true);
    setError(null);
    const result = await editBlueprintAction(blueprint.id, edit);
    if (result.ok) setBlueprint(result.recipe);
    else setError(result.error);
    setPending(false);
    return result.ok;
  }

  async function saveOrder(sections: RecipeV2["sections"]) {
    setPending(true);
    setError(null);
    const result = await reorderBlueprintAction(blueprint.id, {
      sections: sections.map((section) => ({
        sectionId: section.id,
        elementIds: section.elements.map(({ id }) => id),
      })),
    });
    if (result.ok) setBlueprint(result.recipe);
    else setError(result.error);
    setPending(false);
  }

  function moveSection(index: number, delta: number) {
    const next = [...blueprint.sections];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    void saveOrder(next);
  }

  /** 섹션 안에서 옮기고, 끝을 넘으면 이웃 섹션으로 넘긴다. */
  function moveElement(sectionIndex: number, elementIndex: number, delta: number) {
    const sections = blueprint.sections.map((section) => ({ ...section, elements: [...section.elements] }));
    const from = sections[sectionIndex]!;
    const target = elementIndex + delta;
    if (target >= 0 && target < from.elements.length) {
      [from.elements[elementIndex], from.elements[target]] = [from.elements[target]!, from.elements[elementIndex]!];
      void saveOrder(sections);
      return;
    }
    const neighbourIndex = sectionIndex + delta;
    if (neighbourIndex < 0 || neighbourIndex >= sections.length) return;
    const [moved] = from.elements.splice(elementIndex, 1);
    const neighbour = sections[neighbourIndex]!;
    neighbour.elements.splice(delta < 0 ? neighbour.elements.length : 0, 0, moved!);
    void saveOrder(sections);
  }

  /** 목차에서 고른 자리로 지면을 데려간다. */
  function reveal(id: string) {
    document.getElementById(id)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function saveIntent(patch: Partial<PortfolioIntent>) {
    const intent = { ...blueprint.intent, ...patch };
    if (JSON.stringify(intent) === JSON.stringify(blueprint.intent)) return;
    void run({ operation: "update_intent", intent });
  }

  function update(patch: Omit<Extract<BlueprintEdit, { operation: "update_element" }>, "operation" | "elementId">) {
    if (!selected) return;
    void run({ operation: "update_element", elementId: selected.element.id, ...patch });
  }

  const face = design
    ? ({
        "--sketch-accent": design.accent,
        "--sketch-display": `"${design.displayFamily}", ${design.displayFallback}`,
      } as React.CSSProperties)
    : undefined;

  return (
    <div className={styles.workbench} data-pending={pending ? "1" : undefined}>
      {/* ── 상단 한 줄 ─────────────────────────────────────── */}
      <header className={styles.topBar}>
        <button
          type="button"
          className={styles.railToggle}
          onClick={() => setDrawer(drawer === "records" ? null : "records")}
          aria-label="커리어 기록"
        >
          <Icon name="files" size={15} />
        </button>
        <input
          className={styles.title}
          defaultValue={blueprint.title}
          placeholder="포트폴리오 제목"
          maxLength={300}
          onBlur={(event) => {
            const title = event.target.value.trim();
            if (title !== blueprint.title) void run({ operation: "update_title", title });
          }}
        />
        <button
          type="button"
          className={styles.chip}
          data-open={intentOpen ? "1" : undefined}
          onClick={() => setIntentOpen((open) => !open)}
        >
          <Icon name="sliders-horizontal" size={12} /> 제작 의도
        </button>
        <Link href={`/brew/${brewId}/design` as Route} className={styles.chip}>
          {design ? (
            <>
              <i className={styles.swatch} style={{ background: design.accent }} /> {design.name}
            </>
          ) : (
            <>
              <Icon name="palette" size={12} /> 디자인 고르기
            </>
          )}
        </Link>
        <span className={styles.chipMenu}>
          <button
            type="button"
            className={styles.chip}
            data-open={postingMenu ? "1" : undefined}
            onClick={() => setPostingMenu((open) => !open)}
            aria-expanded={postingMenu}
          >
            <Icon name="target" size={12} />
            <span className={styles.chipText}>
              {blueprint.jobPosting
                ? `${blueprint.jobPosting.companyName} · ${blueprint.jobPosting.title}`
                : "지원할 공고"}
            </span>
            <Icon name="caret-down" size={10} />
          </button>
          {postingMenu ? (
            <div className={styles.menu}>
              {/* 모아 둔 공고에서 고르는 일은 실제 공고 탐색 화면이 한다. */}
              <Link href={`/jobs?pick=${brewId}` as Route} className={styles.menuItem}>
                <Icon name="magnifying-glass" size={13} />
                <span>
                  <strong>공고 탐색에서 고르기</strong>
                  필터 · 일치도 · 마감을 그대로 보고 고릅니다
                </span>
              </Link>
              <button
                type="button"
                className={styles.menuItem}
                onClick={() => {
                  setPostingMenu(false);
                  setPickerOpen(true);
                }}
              >
                <Icon name="clipboard-text" size={13} />
                <span>
                  <strong>공고 붙여넣기</strong>
                  목록에 없는 공고를 원문으로 넣습니다
                </span>
              </button>
              {blueprint.jobPosting ? (
                <button
                  type="button"
                  className={styles.menuItem}
                  onClick={() => {
                    setPostingMenu(false);
                    saveIntent({ jobPostingId: null });
                  }}
                >
                  <Icon name="x" size={13} />
                  <span>
                    <strong>공고 없이 진행</strong>
                    고른 공고를 비웁니다
                  </span>
                </button>
              ) : null}
            </div>
          ) : null}
        </span>
        <span className={styles.counts}>
          섹션 {blueprint.sections.length} · 요소 {placed.length}
        </span>
        <button
          type="button"
          className={styles.railToggle}
          onClick={() => setDrawer(drawer === "inspector" ? null : "inspector")}
          aria-label="요소 설정"
        >
          <Icon name="sidebar-simple" size={15} />
        </button>
      </header>

      {intentOpen ? (
        <div className={styles.intentSheet}>
          <label className={styles.field}>
            <span>보여주고 싶은 역할 · 분야</span>
            <input
              defaultValue={blueprint.intent.role}
              maxLength={200}
              placeholder="예: 결제 플랫폼 백엔드"
              onBlur={(event) => saveIntent({ role: event.target.value.trim() })}
            />
          </label>
          <label className={styles.field}>
            <span>주요 독자</span>
            <input
              defaultValue={blueprint.intent.audience}
              maxLength={200}
              placeholder="예: 채용 담당자 · 실무 리드"
              onBlur={(event) => saveIntent({ audience: event.target.value.trim() })}
            />
          </label>
          <label className={styles.field}>
            <span>원하는 분량</span>
            <select
              defaultValue={blueprint.intent.lengthPreset}
              onChange={(event) =>
                saveIntent({ lengthPreset: event.target.value as PortfolioIntent["lengthPreset"] })
              }
            >
              <option value="single">짧게 · 한 장</option>
              <option value="double">보통 · 두 장</option>
              <option value="triple">길게 · 세 장</option>
            </select>
          </label>
          <label className={styles.field}>
            <span>가장 강조할 경험</span>
            <textarea
              defaultValue={blueprint.intent.highlight}
              maxLength={1_000}
              rows={2}
              placeholder="비워 두면 고른 기록과 디자인만으로 만듭니다."
              onBlur={(event) => saveIntent({ highlight: event.target.value.trim() })}
            />
          </label>
          <label className={styles.field}>
            <span>추가 요청</span>
            <textarea
              defaultValue={blueprint.intent.extraRequest}
              maxLength={2_000}
              rows={2}
              placeholder="구성이나 표현에 바라는 것이 있으면 적어 주세요."
              onBlur={(event) => saveIntent({ extraRequest: event.target.value.trim() })}
            />
          </label>
        </div>
      ) : null}

      {error ? <p className={styles.error} role="alert">{error}</p> : null}

      <div className={styles.panes} data-drawer={drawer ?? undefined}>
        {/* ── 왼쪽 · 커리어 기록 ───────────────────────────── */}
        <aside className={styles.rail} data-open={drawer === "records" ? "1" : undefined}>
          <section className={styles.railBlock} data-part="outline">
            <div className={styles.railHead}>
              <h2>포트폴리오 목차</h2>
              <span>{blueprint.sections.length} · {placed.length}</span>
            </div>
            {blueprint.sections.length === 0 ? (
              <p className={styles.railEmpty}>아직 띠가 없습니다. 지면에서 첫 띠를 두면 여기에 섭니다.</p>
            ) : (
              <ol className={styles.outline}>
                {blueprint.sections.map((section) => (
                  <li key={section.id}>
                    <button
                      type="button"
                      className={styles.outlineBand}
                      onClick={() => {
                        reveal(`band-${section.id}`);
                        setDrawer(null);
                      }}
                    >
                      <span className={styles.outlineNo}>{no(section.order)}</span>
                      <span className={styles.outlineName}>{section.title || "이름 없는 띠"}</span>
                      <i>{section.elements.length}</i>
                    </button>
                    {section.elements.length ? (
                      <ul className={styles.outlineElements}>
                        {section.elements.map((element) => (
                          <li key={element.id}>
                            <button
                              type="button"
                              className={styles.outlineElement}
                              data-selected={element.id === selectedId ? "1" : undefined}
                              onClick={() => {
                                setSelectedId(element.id);
                                reveal(`element-${element.id}`);
                                setDrawer(null);
                              }}
                            >
                              <Icon name={KIND_ICON[element.kind]} size={11} />
                              <span className={styles.outlineName}>
                                {element.intent || `${KIND_LABEL[element.kind]} · ${variantLabel(element)}`}
                              </span>
                              {element.sourceBindings.length ? (
                                <i><Icon name="link-simple" size={9} /> {element.sourceBindings.length}</i>
                              ) : null}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className={styles.railBlock} data-part="records">
          <div className={styles.railHead}>
            <h2>커리어 기록</h2>
            <span>{records.length}</span>
          </div>
          <input
            className={styles.search}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="검색"
          />
          {records.length === 0 ? (
            <p className={styles.railEmpty}>
              걸린 기록이 없습니다. 기록 없이도 요소를 두고 의도를 적어 만들 수 있습니다.
            </p>
          ) : (
            <ul className={styles.recordList}>
              {shown.map((record) => {
                const used = usage.get(record.recordId) ?? [];
                const bound =
                  selected?.element.sourceBindings.some(({ sourceId }) => sourceId === record.recordId) ?? false;
                return (
                  <li key={record.recordId}>
                    <button
                      type="button"
                      className={styles.recordRow}
                      data-bound={bound ? "1" : undefined}
                      data-used={used.length ? "1" : undefined}
                      disabled={!selected || bound || pending}
                      title={
                        bound
                          ? "고른 요소에 이미 연결되어 있습니다"
                          : selected
                            ? "고른 요소에 연결"
                            : "요소를 먼저 고르세요"
                      }
                      onClick={() =>
                        selected &&
                        run({
                          operation: "bind_source",
                          elementId: selected.element.id,
                          sourceType: "record",
                          sourceId: record.recordId,
                          role: selected.element.sourceBindings.some(({ role }) => role === "primary")
                            ? "supporting"
                            : "primary",
                        })
                      }
                    >
                      <Icon name={record.categoryIcon} size={13} />
                      <span className={styles.recordText}>
                        <strong>{record.title}</strong>
                        <small>{record.categoryName} · {period(record.periodFrom, record.periodTo)}</small>
                        {used.length ? <em>{used.join(" · ")}</em> : null}
                      </span>
                      <Icon name={bound ? "check" : "plus"} size={12} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          </section>
        </aside>

        {/* ── 가운데 · 지면 ────────────────────────────────── */}
        <main className={styles.canvas} ref={canvasRef} onClick={() => setPaletteFor(null)}>
          <div className={styles.sheet} style={face}>
            {blueprint.sections.length === 0 ? (
              <div className={styles.sheetEmpty}>
                <h2>지면이 비어 있습니다</h2>
                <p>
                  섹션은 지면의 한 띠입니다. 그 안에 요소를 놓고 무엇을 말할지와 어떤
                  모양으로 보여줄지를 정하면, 03 생성이 이 도면을 그대로 씁니다.
                </p>
                <button
                  type="button"
                  onClick={() => run({ operation: "add_section", title: "", purpose: "" })}
                  disabled={pending}
                >
                  <Icon name="plus" size={13} /> 첫 띠 두기
                </button>
              </div>
            ) : (
              blueprint.sections.map((section, sectionIndex) => (
                <section key={section.id} id={`band-${section.id}`} className={styles.band}>
                  <div className={styles.bandHead}>
                    <span className={styles.bandNo}>{no(section.order)}</span>
                    <input
                      className={styles.bandTitle}
                      defaultValue={section.title}
                      placeholder="띠 이름"
                      maxLength={300}
                      onBlur={(event) => {
                        const title = event.target.value.trim();
                        if (title !== section.title) {
                          void run({ operation: "update_section", sectionId: section.id, title });
                        }
                      }}
                    />
                    <input
                      className={styles.bandPurpose}
                      defaultValue={section.purpose}
                      placeholder="여기서 읽는 사람이 무엇을 알게 되는지"
                      maxLength={1_000}
                      onBlur={(event) => {
                        const purpose = event.target.value.trim();
                        if (purpose !== section.purpose) {
                          void run({ operation: "update_section", sectionId: section.id, purpose });
                        }
                      }}
                    />
                    <span className={styles.bandTools}>
                      <button type="button" onClick={() => moveSection(sectionIndex, -1)} disabled={pending || sectionIndex === 0} aria-label="띠 위로">
                        <Icon name="arrow-up" size={12} />
                      </button>
                      <button type="button" onClick={() => moveSection(sectionIndex, 1)} disabled={pending || sectionIndex === blueprint.sections.length - 1} aria-label="띠 아래로">
                        <Icon name="arrow-down" size={12} />
                      </button>
                      <button type="button" onClick={() => run({ operation: "delete_section", sectionId: section.id })} disabled={pending} aria-label="띠 지우기">
                        <Icon name="trash" size={12} />
                      </button>
                    </span>
                  </div>

                  <div className={styles.grid}>
                    {section.elements.map((element, elementIndex) => (
                      <div
                        key={element.id}
                        id={`element-${element.id}`}
                        className={styles.block}
                        data-width={element.width}
                        data-emphasis={element.emphasis}
                        data-selected={element.id === selectedId ? "1" : undefined}
                      >
                        <button
                          type="button"
                          className={styles.blockHit}
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedId(element.id);
                            setDrawer(null);
                          }}
                          aria-label={`${KIND_LABEL[element.kind]} · ${variantLabel(element)}`}
                        >
                          <ElementSketch element={element} />
                        </button>
                        <span className={styles.blockTag}>
                          <Icon name={KIND_ICON[element.kind]} size={11} />
                          {KIND_LABEL[element.kind]} · {variantLabel(element)}
                          {element.sourceBindings.length ? (
                            <i><Icon name="link-simple" size={10} /> {element.sourceBindings.length}</i>
                          ) : null}
                        </span>
                        <span className={styles.blockTools}>
                          <button type="button" onClick={() => moveElement(sectionIndex, elementIndex, -1)} disabled={pending} aria-label="앞으로">
                            <Icon name="arrow-up" size={11} />
                          </button>
                          <button type="button" onClick={() => moveElement(sectionIndex, elementIndex, 1)} disabled={pending} aria-label="뒤로">
                            <Icon name="arrow-down" size={11} />
                          </button>
                          <button type="button" onClick={() => run({ operation: "duplicate_element", elementId: element.id })} disabled={pending} aria-label="복제">
                            <Icon name="copy" size={11} />
                          </button>
                          <button type="button" onClick={() => run({ operation: "delete_element", elementId: element.id })} disabled={pending} aria-label="지우기">
                            <Icon name="trash" size={11} />
                          </button>
                        </span>
                      </div>
                    ))}

                    <div className={styles.slot}>
                      <button
                        type="button"
                        className={styles.slotButton}
                        onClick={(event) => {
                          event.stopPropagation();
                          setPaletteFor(paletteFor === section.id ? null : section.id);
                        }}
                        aria-expanded={paletteFor === section.id}
                      >
                        <Icon name="plus" size={13} /> 요소
                      </button>
                      {paletteFor === section.id ? (
                        <div className={styles.palette} onClick={(event) => event.stopPropagation()}>
                          {KIND_ORDER.map((kind) => (
                            <button
                              key={kind}
                              type="button"
                              onClick={async () => {
                                setPaletteFor(null);
                                await run({ operation: "add_element", sectionId: section.id, kind });
                              }}
                              disabled={pending}
                            >
                              <Icon name={KIND_ICON[kind]} size={14} />
                              {KIND_LABEL[kind]}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </section>
              ))
            )}

            {blueprint.sections.length > 0 ? (
              <button
                type="button"
                className={styles.addBand}
                onClick={() => run({ operation: "add_section", title: "", purpose: "" })}
                disabled={pending}
              >
                <Icon name="plus" size={13} /> 띠 추가
              </button>
            ) : null}
          </div>
        </main>

        {/* ── 오른쪽 · 요소 설정 ───────────────────────────── */}
        <aside className={styles.inspector} data-open={drawer === "inspector" ? "1" : undefined}>
          {selected ? (
            <>
              <div className={styles.railHead}>
                <h2>
                  <Icon name={KIND_ICON[selected.element.kind]} size={13} /> {KIND_LABEL[selected.element.kind]}
                </h2>
                <span>{no(selected.section.order)}</span>
              </div>

              <div className={styles.inspectorBody}>
                <div className={styles.group}>
                  <span className={styles.groupLabel}>표시 방식</span>
                  <div className={styles.variantGrid}>
                    {presentationVariantsFor(selected.element.kind).map((variant) => (
                      <button
                        key={variant.id}
                        type="button"
                        data-active={variant.id === selected.element.presentationVariant ? "1" : undefined}
                        onClick={() => update({ presentationVariant: variant.id })}
                        disabled={pending}
                      >
                        {variant.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className={styles.group}>
                  <span className={styles.groupLabel}>이 자리에서 무엇을 말하나</span>
                  <textarea
                    key={`intent-${selected.element.id}`}
                    className={styles.quietInput}
                    defaultValue={selected.element.intent}
                    rows={3}
                    maxLength={1_000}
                    placeholder="적으면 지면의 그 자리에 그대로 나타납니다."
                    onBlur={(event) => {
                      const intent = event.target.value.trim();
                      if (intent !== selected.element.intent) update({ intent });
                    }}
                  />
                </div>

                <div className={styles.group}>
                  <span className={styles.groupLabel}>핵심 메시지</span>
                  <input
                    key={`takeaway-${selected.element.id}`}
                    className={styles.quietInput}
                    defaultValue={selected.element.takeaway}
                    maxLength={500}
                    placeholder="읽고 나면 남는 한 줄"
                    onBlur={(event) => {
                      const takeaway = event.target.value.trim();
                      if (takeaway !== selected.element.takeaway) update({ takeaway });
                    }}
                  />
                </div>

                <div className={styles.group}>
                  <span className={styles.groupLabel}>강조</span>
                  <div className={styles.segmented}>
                    {EMPHASIS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        data-active={option.value === selected.element.emphasis ? "1" : undefined}
                        onClick={() => update({ emphasis: option.value })}
                        disabled={pending}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className={styles.group}>
                  <span className={styles.groupLabel}>폭</span>
                  <div className={styles.segmented}>
                    {WIDTH.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        data-active={option.value === selected.element.width ? "1" : undefined}
                        onClick={() => update({ width: option.value })}
                        disabled={pending}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className={styles.group}>
                  <span className={styles.groupLabel}>
                    근거
                    <i>{selected.element.sourceBindings.length}건</i>
                  </span>
                  {selected.element.sourceBindings.length === 0 ? (
                    <p className={styles.railEmpty}>
                      왼쪽에서 기록을 눌러 연결합니다. 없어도 의도만으로 만들 수 있습니다.
                    </p>
                  ) : (
                    <ul className={styles.bindings}>
                      {selected.element.sourceBindings.map((binding) => (
                        <li key={binding.sourceId}>
                          <b data-primary={binding.role === "primary" ? "1" : undefined}>
                            {binding.role === "primary" ? "중심" : "보조"}
                          </b>
                          <span>{recordById.get(binding.sourceId)?.title ?? "이 제작 밖의 근거"}</span>
                          <button
                            type="button"
                            onClick={() =>
                              run({
                                operation: "unbind_source",
                                elementId: selected.element.id,
                                sourceId: binding.sourceId,
                              })
                            }
                            disabled={pending}
                            aria-label="연결 끊기"
                          >
                            <Icon name="x" size={11} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className={styles.groupRow}>
                  <label className={styles.field}>
                    <span>종류 바꾸기</span>
                    <select
                      value={selected.element.kind}
                      onChange={(event) => update({ kind: event.target.value as BlueprintElementKind })}
                    >
                      {KIND_ORDER.map((kind) => (
                        <option key={kind} value={kind}>{KIND_LABEL[kind]}</option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.field}>
                    <span>글자 수 제안</span>
                    <input
                      key={`length-${selected.element.id}`}
                      type="number"
                      min={0}
                      max={4_000}
                      defaultValue={selected.element.targetLength}
                      onBlur={(event) => {
                        const targetLength = Number(event.target.value);
                        if (Number.isInteger(targetLength) && targetLength !== selected.element.targetLength) {
                          update({ targetLength });
                        }
                      }}
                    />
                  </label>
                </div>

                <div className={styles.group}>
                  <span className={styles.groupLabel}>메모</span>
                  <textarea
                    key={`note-${selected.element.id}`}
                    className={styles.quietInput}
                    defaultValue={selected.element.note}
                    rows={2}
                    maxLength={1_000}
                    placeholder="나만 보는 메모"
                    onBlur={(event) => {
                      const note = event.target.value.trim();
                      if (note !== selected.element.note) update({ note });
                    }}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className={styles.inspectorEmpty}>
              <Icon name="cursor-click" size={22} color="var(--ex-fg-faint)" />
              <p>지면에서 요소를 고르면 표시 방식과 근거를 여기서 정합니다.</p>
            </div>
          )}
        </aside>

        {drawer ? <button type="button" className={styles.scrim} onClick={() => setDrawer(null)} aria-label="닫기" /> : null}
      </div>

      {pickerOpen ? (
        <JobPostingPicker
          current={blueprint.jobPosting}
          onClose={() => setPickerOpen(false)}
          onPick={(jobPostingId) => {
            setPickerOpen(false);
            saveIntent({ jobPostingId });
          }}
        />
      ) : null}
    </div>
  );
}
