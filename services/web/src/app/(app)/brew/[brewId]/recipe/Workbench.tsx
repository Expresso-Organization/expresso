"use client";

import type { PortfolioIntent, RecipeV2, RecipeV2Edit } from "@expresso/contracts";
import type { Route } from "next";
import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { Icon } from "@/components/ui/Icon";

import { JobPostingPicker } from "./JobPostingPicker";
import { editRecipeAction, reorderRecipeAction } from "./recipe-actions";
import styles from "./Workbench.module.css";

export type RecordCard = {
  recordId: string;
  title: string;
  categoryName: string;
  categoryIcon: string;
  periodFrom: string | null;
  periodTo: string | null;
  reason: string;
};

type Item = RecipeV2["sections"][number]["items"][number];

const SOURCE_LABEL = { record: "기록", requirement: "공고 요건", answer: "대화 답변" } as const;

function no(order: number): string {
  return String(order + 1).padStart(2, "0");
}

function period(from: string | null, to: string | null): string {
  if (!from && !to) return "기간 없음";
  return `${from?.slice(0, 7) ?? "?"} — ${to?.slice(0, 7) ?? "현재"}`;
}

/**
 * 02 레시피.
 *
 * 여기서 정하는 것은 **어떤 내용이 어떤 순서로 들어갈지**뿐이다. 지면의 모양은
 * 01에서 고른 디자인 안에서 03 생성이 정한다.
 */
export function Workbench({
  brewId,
  initialRecipe,
  records,
  designName,
  draftAction,
}: {
  brewId: string;
  initialRecipe: RecipeV2;
  records: RecordCard[];
  designName: string | null;
  /** 「초안 다시 만들기」. 잡을 걸고 화면은 서버 상태를 다시 읽는다. */
  draftAction: (formData: FormData) => Promise<void>;
}) {
  const [recipe, setRecipe] = useState(initialRecipe);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [query, setQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [postingMenu, setPostingMenu] = useState(false);
  const [intentOpen, setIntentOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(false);

  const placed = useMemo(
    () => recipe.sections.flatMap((section) => section.items.map((item) => ({ section, item }))),
    [recipe],
  );
  const selected = placed.find(({ item }) => item.id === selectedId) ?? null;
  const recordById = useMemo(() => new Map(records.map((record) => [record.recordId, record])), [records]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return records;
    return records.filter(
      (record) =>
        record.title.toLowerCase().includes(needle) || record.categoryName.toLowerCase().includes(needle),
    );
  }, [records, query]);

  /** 어느 기록이 레시피의 어디에 쓰이는지(§7.5). */
  const usage = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const { section, item } of placed) {
      for (const binding of item.sourceBindings) {
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
      setPostingMenu(false);
      setRailOpen(false);
    }
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);

  async function run(edit: RecipeV2Edit) {
    setPending(true);
    setError(null);
    const result = await editRecipeAction(recipe.id, edit);
    if (result.ok) setRecipe(result.recipe);
    else setError(result.error);
    setPending(false);
  }

  async function saveOrder(sections: RecipeV2["sections"]) {
    setPending(true);
    setError(null);
    const result = await reorderRecipeAction(recipe.id, {
      sections: sections.map((section) => ({
        sectionId: section.id,
        itemIds: section.items.map(({ id }) => id),
      })),
    });
    if (result.ok) setRecipe(result.recipe);
    else setError(result.error);
    setPending(false);
  }

  function moveSection(index: number, delta: number) {
    const next = [...recipe.sections];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    void saveOrder(next);
  }

  /** 섹션 안에서 옮기고, 끝을 넘으면 이웃 섹션으로 넘긴다. */
  function moveItem(sectionIndex: number, itemIndex: number, delta: number) {
    const sections = recipe.sections.map((section) => ({ ...section, items: [...section.items] }));
    const from = sections[sectionIndex]!;
    const target = itemIndex + delta;
    if (target >= 0 && target < from.items.length) {
      [from.items[itemIndex], from.items[target]] = [from.items[target]!, from.items[itemIndex]!];
      void saveOrder(sections);
      return;
    }
    const neighbourIndex = sectionIndex + delta;
    if (neighbourIndex < 0 || neighbourIndex >= sections.length) return;
    const [moved] = from.items.splice(itemIndex, 1);
    const neighbour = sections[neighbourIndex]!;
    neighbour.items.splice(delta < 0 ? neighbour.items.length : 0, 0, moved!);
    void saveOrder(sections);
  }

  function saveIntent(patch: Partial<PortfolioIntent>) {
    const intent = { ...recipe.intent, ...patch };
    if (JSON.stringify(intent) === JSON.stringify(recipe.intent)) return;
    void run({ operation: "update_intent", intent });
  }

  function reveal(id: string) {
    document.getElementById(id)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  return (
    <div className={styles.workbench} data-pending={pending ? "1" : undefined}>
      {/* ── 상단 한 줄 ─────────────────────────────────────── */}
      <header className={styles.topBar}>
        <button
          type="button"
          className={styles.railToggle}
          onClick={() => setRailOpen((open) => !open)}
          aria-label="목차와 기록"
        >
          <Icon name="list" size={15} />
        </button>
        <input
          className={styles.title}
          defaultValue={recipe.title}
          placeholder="포트폴리오 제목"
          maxLength={300}
          onBlur={(event) => {
            const title = event.target.value.trim();
            if (title !== recipe.title) void run({ operation: "update_title", title });
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
          <Icon name="palette" size={12} /> {designName ?? "디자인 고르기"}
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
              {recipe.jobPosting
                ? `${recipe.jobPosting.companyName} · ${recipe.jobPosting.title}`
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
                onClick={() => { setPostingMenu(false); setPickerOpen(true); }}
              >
                <Icon name="clipboard-text" size={13} />
                <span>
                  <strong>공고 붙여넣기</strong>
                  목록에 없는 공고를 원문으로 넣습니다
                </span>
              </button>
              {recipe.jobPosting ? (
                <button
                  type="button"
                  className={styles.menuItem}
                  onClick={() => { setPostingMenu(false); saveIntent({ jobPostingId: null }); }}
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
        <span className={styles.counts}>섹션 {recipe.sections.length} · 내용 {placed.length}</span>
        <form action={draftAction} className={styles.redraft}>
          <input type="hidden" name="brewId" value={brewId} />
          <input type="hidden" name="previousRecipeId" value={recipe.id} />
          <button type="submit" title="지금 내용을 버리고 AI가 다시 짭니다">
            <Icon name="sparkle" size={12} /> 초안 다시
          </button>
        </form>
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

      {error ? <p className={styles.error} role="alert">{error}</p> : null}

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
              <h2>커리어 기록</h2>
              <span>{records.length}</span>
            </div>
            <input
              className={styles.search}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="검색"
            />
            <p className={styles.railHint}>
              {selected ? "누르면 고른 내용의 근거가 됩니다." : "내용을 먼저 고르면 근거로 붙일 수 있습니다."}
            </p>
            {records.length === 0 ? (
              <p className={styles.railEmpty}>
                걸린 기록이 없습니다. 근거 없이도 무엇을 말할지 적어 만들 수 있습니다.
              </p>
            ) : (
              <ul className={styles.recordList}>
                {shown.map((record) => {
                  const used = usage.get(record.recordId) ?? [];
                  const bound = selected?.item.sourceBindings.some(({ sourceId }) => sourceId === record.recordId) ?? false;
                  return (
                    <li key={record.recordId}>
                      <button
                        type="button"
                        className={styles.recordRow}
                        data-bound={bound ? "1" : undefined}
                        data-used={used.length ? "1" : undefined}
                        disabled={!selected || bound || pending}
                        onClick={() =>
                          selected &&
                          run({
                            operation: "bind_source",
                            itemId: selected.item.id,
                            sourceType: "record",
                            sourceId: record.recordId,
                            role: selected.item.sourceBindings.some(({ role }) => role === "primary")
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

            {recipe.unusedSources.length ? (
              <div className={styles.unused}>
                <h3>이번엔 안 쓴 기록</h3>
                <ul>
                  {recipe.unusedSources.map(({ recordId, reason }) => (
                    <li key={recordId}>
                      <strong>{recordById.get(recordId)?.title ?? "지난 기록"}</strong>
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        </aside>

        {/* ── 가운데 · 레시피 ──────────────────────────────── */}
        <main className={styles.sheet}>
          <div className={styles.doc}>
            {recipe.sections.map((section, sectionIndex) => (
              <section key={section.id} id={`section-${section.id}`} className={styles.section}>
                <div className={styles.sectionHead}>
                  <span className={styles.sectionNo}>{no(section.order)}</span>
                  <input
                    className={styles.sectionTitle}
                    defaultValue={section.title}
                    placeholder="섹션 이름"
                    maxLength={300}
                    onBlur={(event) => {
                      const title = event.target.value.trim();
                      if (title !== section.title) void run({ operation: "update_section", sectionId: section.id, title });
                    }}
                  />
                  <span className={styles.sectionTools}>
                    <button type="button" onClick={() => moveSection(sectionIndex, -1)} disabled={pending || sectionIndex === 0} aria-label="섹션 위로">
                      <Icon name="arrow-up" size={12} />
                    </button>
                    <button type="button" onClick={() => moveSection(sectionIndex, 1)} disabled={pending || sectionIndex === recipe.sections.length - 1} aria-label="섹션 아래로">
                      <Icon name="arrow-down" size={12} />
                    </button>
                    <button type="button" onClick={() => run({ operation: "delete_section", sectionId: section.id })} disabled={pending} aria-label="섹션 지우기">
                      <Icon name="trash" size={12} />
                    </button>
                  </span>
                </div>
                <input
                  className={styles.sectionPurpose}
                  defaultValue={section.purpose}
                  placeholder="이 섹션을 왜 두는지"
                  maxLength={1_000}
                  onBlur={(event) => {
                    const purpose = event.target.value.trim();
                    if (purpose !== section.purpose) void run({ operation: "update_section", sectionId: section.id, purpose });
                  }}
                />
                <label className={styles.takeawayRow}>
                  <span>남길 것</span>
                  <input
                    defaultValue={section.takeaway}
                    placeholder="읽고 나면 남는 한 줄"
                    maxLength={500}
                    onBlur={(event) => {
                      const takeaway = event.target.value.trim();
                      if (takeaway !== section.takeaway) void run({ operation: "update_section", sectionId: section.id, takeaway });
                    }}
                  />
                </label>

                <ul className={styles.items}>
                  {section.items.map((item, itemIndex) => (
                    <li
                      key={item.id}
                      className={styles.item}
                      data-selected={item.id === selectedId ? "1" : undefined}
                      onFocusCapture={() => setSelectedId(item.id)}
                      onClick={() => setSelectedId(item.id)}
                    >
                      <span className={styles.itemMark} aria-hidden="true" />
                      <div className={styles.itemBody}>
                        <AutoTextarea
                          className={styles.itemText}
                          value={item.text}
                          maxLength={2_000}
                          placeholder="여기서 무엇을 말할지"
                          onCommit={(text) => {
                            if (text !== item.text) void run({ operation: "update_item", itemId: item.id, text });
                          }}
                        />
                        <SourceChips
                          item={item}
                          recordById={recordById}
                          pending={pending}
                          onUnbind={(sourceId) => run({ operation: "unbind_source", itemId: item.id, sourceId })}
                        />
                      </div>
                      <span className={styles.itemTools}>
                        <button type="button" onClick={() => moveItem(sectionIndex, itemIndex, -1)} disabled={pending} aria-label="위로">
                          <Icon name="arrow-up" size={11} />
                        </button>
                        <button type="button" onClick={() => moveItem(sectionIndex, itemIndex, 1)} disabled={pending} aria-label="아래로">
                          <Icon name="arrow-down" size={11} />
                        </button>
                        <button type="button" onClick={() => run({ operation: "duplicate_item", itemId: item.id })} disabled={pending} aria-label="복제">
                          <Icon name="copy" size={11} />
                        </button>
                        <button type="button" onClick={() => run({ operation: "delete_item", itemId: item.id })} disabled={pending} aria-label="지우기">
                          <Icon name="trash" size={11} />
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  className={styles.addItem}
                  onClick={() => run({ operation: "add_item", sectionId: section.id })}
                  disabled={pending}
                >
                  <Icon name="plus" size={12} /> 내용 추가
                </button>
              </section>
            ))}

            <button
              type="button"
              className={styles.addSection}
              onClick={() => run({ operation: "add_section", title: "", purpose: "" })}
              disabled={pending}
            >
              <Icon name="plus" size={13} /> 섹션 추가
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

/**
 * 내용 한 줄. 글이 길어지면 칸이 따라 자란다.
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
}: {
  value: string;
  onCommit: (text: string) => void;
  className?: string | undefined;
  maxLength?: number | undefined;
  placeholder?: string | undefined;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function fit(area: HTMLTextAreaElement | null) {
    if (!area) return;
    area.style.height = "auto";
    area.style.height = `${area.scrollHeight}px`;
  }

  // 값이 밖에서 바뀌어도(초안 교체 · 순서 변경) 다시 맞춘다.
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
      onInput={(event) => fit(event.currentTarget)}
      onBlur={(event) => onCommit(event.target.value.trim())}
    />
  );
}

/** 이 내용이 딛는 근거. 중심 하나와 보조들. */
function SourceChips({
  item,
  recordById,
  pending,
  onUnbind,
}: {
  item: Item;
  recordById: Map<string, RecordCard>;
  pending: boolean;
  onUnbind: (sourceId: string) => void;
}) {
  if (item.sourceBindings.length === 0) return null;
  return (
    <span className={styles.chips}>
      {item.sourceBindings.map((binding) => (
        <span key={binding.sourceId} className={styles.sourceChip} data-primary={binding.role === "primary" ? "1" : undefined}>
          {binding.sourceType === "record"
            ? recordById.get(binding.sourceId)?.title ?? "지난 기록"
            : SOURCE_LABEL[binding.sourceType]}
          <button type="button" onClick={() => onUnbind(binding.sourceId)} disabled={pending} aria-label="근거 떼기">
            <Icon name="x" size={9} />
          </button>
        </span>
      ))}
    </span>
  );
}
