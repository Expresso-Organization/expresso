"use client";

import type { BrewMaterial, BrewMaterials, EntitlementUsage } from "@expresso/contracts";
import type { Route } from "next";
import Link from "next/link";
import { useActionState, useMemo, useState, useTransition } from "react";

import { Icon } from "@/components/ui/Icon";

import {
  selectMaterialsAction,
  setModeAction,
  type MaterialsResult,
} from "./materials-actions";
import styles from "./page.module.css";

/**
 * 01b 재료 고르기.
 *
 * 순위는 제작을 시작할 때 공고 요건에 맞춰 이미 매겨져 있다. 이 화면이 하는 일은
 * 그 줄을 보여주고 **어디까지 담을지**를 정하는 것이다. 체크는 곧바로 저장된다 —
 * 다음 화면으로 넘어가야 반영되는 체크는 체크가 아니다.
 */

/** 매칭 게이지 채움 색은 점수 구간으로 갈린다 (정의서). */
function fillColor(score: number, top: number): string {
  const ratio = top === 0 ? 0 : score / top;
  if (ratio >= 0.8) return "var(--ex-ink-900)";
  if (ratio >= 0.4) return "var(--ex-slate-500)";
  return "var(--ex-border-strong)";
}

/** 카테고리 띠는 무채색 단계로 나눈다 (§5.4). */
const MIX_SHADES = ["#16223A", "#5A6B87", "#93A2BA", "#C7D2E2", "#E3E9F2"];

const EXCLUSION_LABEL: Record<string, string> = {
  AUTO_LIMIT: "담을 수 있는 수를 넘음",
  USER_DESELECTED: "직접 뺌",
};

const STATUS_LABEL = { organized: "정리됨", verified: "검증됨" } as const;

const SORTS = [
  { id: "match", label: "매칭순" },
  { id: "title", label: "제목순" },
  { id: "recent", label: "최근 일 순" },
] as const;

function periodLabel(material: BrewMaterial): string {
  if (!material.periodFrom) return "—";
  const from = material.periodFrom.slice(0, 7).replace("-", ".");
  if (!material.periodTo) return `${from}~`;
  const to = material.periodTo.slice(0, 7).replace("-", ".");
  return from === to ? from : `${from}~${to}`;
}

export function MaterialPicker({
  brewId,
  materials,
  coworkAllowed,
  quota,
}: {
  brewId: string;
  materials: BrewMaterials;
  coworkAllowed: boolean;
  quota: EntitlementUsage | null;
}) {
  const [chosen, setChosen] = useState<ReadonlySet<string>>(
    () => new Set(materials.materials.filter((row) => row.selected).map((row) => row.recordId)),
  );
  const [filter, setFilter] = useState<"all" | "chosen" | "excluded">("all");
  const [sort, setSort] = useState<(typeof SORTS)[number]["id"]>("match");
  const [blocked, setBlocked] = useState<string | null>(null);

  const [saved, save] = useActionState<MaterialsResult, FormData>(selectMaterialsAction, {});
  const [mode, setMode] = useActionState<MaterialsResult, FormData>(setModeAction, {});
  const [, startTransition] = useTransition();

  const limit = materials.selectionLimit;
  const rows = useMemo(() => {
    const filtered = materials.materials.filter((row) =>
      filter === "all" ? true : filter === "chosen" ? chosen.has(row.recordId) : !chosen.has(row.recordId));
    const sorted = [...filtered];
    if (sort === "title") sorted.sort((left, right) => left.title.localeCompare(right.title, "ko"));
    if (sort === "recent") {
      sorted.sort((left, right) => (right.periodFrom ?? "").localeCompare(left.periodFrom ?? ""));
    }
    return sorted;
  }, [materials.materials, filter, sort, chosen]);

  const top = Math.max(...materials.materials.map(({ score }) => score), 1);

  function toggle(recordId: string) {
    const next = new Set(chosen);
    if (next.has(recordId)) next.delete(recordId);
    else if (next.size >= limit) {
      setBlocked(`한 번에 ${limit}건까지 담을 수 있습니다. 빼고 다시 골라 주세요.`);
      return;
    } else next.add(recordId);

    setBlocked(null);
    setChosen(next);
    // 0건은 저장하지 않는다 — 서버가 최소 1건을 요구하고, 그게 맞는 규칙이다.
    if (next.size === 0) return;
    const formData = new FormData();
    formData.set("brewId", brewId);
    for (const id of next) formData.append("recordIds", id);
    startTransition(() => save(formData));
  }

  function chooseMode(next: "solo" | "collab") {
    const formData = new FormData();
    formData.set("brewId", brewId);
    formData.set("mode", next);
    startTransition(() => setMode(formData));
  }

  const picked = materials.materials.filter((row) => chosen.has(row.recordId));
  const mix = groupBy(picked, (row) => row.categoryName);
  const excludedReasons = groupBy(
    materials.materials.filter((row) => !chosen.has(row.recordId)),
    (row) => EXCLUSION_LABEL[row.excludedReason ?? ""] ?? "담지 않음",
  );
  const notice = blocked ?? saved.error ?? mode.error;
  const currentMode = mode.mode ?? materials.mode;

  return (
    <div className={styles.body}>
      <div className={styles.left}>
        <div className={styles.head}>
          <span className={styles.headIcon}>
            <Icon name="list-checks" weight="fill" size={18} color="var(--ex-espresso)" />
          </span>
          <span className={styles.headTitle}>무엇을 담을까요</span>
          <span className={styles.headNote}>공고 매칭도가 높은 순</span>
        </div>
        <p className={styles.blurb}>
          정리된 기록 {materials.materials.length}건을 이 공고의 요건에 맞춰 줄 세웠습니다.
          한 번에 {limit}건까지 담을 수 있고, 지금 {chosen.size}건을 골랐습니다. 체크는
          바꾸는 즉시 저장됩니다.
        </p>

        <div className={styles.tabs}>
          {([
            { id: "all", label: `전체 ${materials.materials.length}` },
            { id: "chosen", label: `고른 것 ${chosen.size}` },
            { id: "excluded", label: `뺀 것 ${materials.materials.length - chosen.size}` },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`${styles.tab} ${filter === tab.id ? styles.tabActive : ""}`}
              onClick={() => setFilter(tab.id)}
            >
              {tab.label}
            </button>
          ))}
          <div className={styles.tabsRight}>
            {SORTS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={styles.tabsAction}
                aria-pressed={sort === option.id}
                style={sort === option.id ? { color: "var(--ex-ink-900)", fontWeight: 600 } : undefined}
                onClick={() => setSort(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {notice ? <p className={styles.notice}>{notice}</p> : null}

        <div className={styles.table}>
          <div className={`${styles.row} ${styles.headRow}`}>
            <div className={styles.headCell}>
              <Icon name="text-aa" size={12} color="var(--ex-slate-500)" />
              <span className={styles.headLabel}>제목</span>
            </div>
            <div className={styles.headCell}>
              <Icon name="folder-simple" size={12} color="var(--ex-slate-500)" />
              <span className={styles.headLabel}>카테고리</span>
            </div>
            <div className={styles.headCell}>
              <Icon name="calendar-blank" size={12} color="var(--ex-slate-500)" />
              <span className={styles.headLabel}>시기</span>
            </div>
            <div className={styles.headCell}>
              <Icon name="seal-check" size={12} color="var(--ex-slate-500)" />
              <span className={styles.headLabel}>상태</span>
            </div>
            <div className={styles.headCell}>
              <Icon name="target" size={12} color="var(--ex-espresso)" />
              <span className={styles.headLabel}>매칭</span>
            </div>
          </div>

          {rows.map((row) => {
            const on = chosen.has(row.recordId);
            return (
              <div
                key={row.recordId}
                role="checkbox"
                aria-checked={on}
                tabIndex={0}
                title={row.reason}
                onClick={() => toggle(row.recordId)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    toggle(row.recordId);
                  }
                }}
                className={`${styles.row} ${styles.bodyRow} ${on ? styles.bodyRowSelected : ""}`}
              >
                <div className={styles.titleCell}>
                  <span className={`${styles.checkbox} ${on ? styles.checkboxOn : ""}`}>
                    {on ? <Icon name="check" size={10} color="var(--ex-white)" /> : null}
                  </span>
                  <Icon name="file-text" size={14} color="var(--ex-slate-500)" />
                  <span className={styles.title}>{row.title}</span>
                  {row.origin === "ai" || row.origin === "interview" ? (
                    <span className={styles.aiBadge}>AI</span>
                  ) : null}
                </div>
                <div className={styles.cell}>{row.categoryName}</div>
                <div className={styles.cell}>{periodLabel(row)}</div>
                <div className={`${styles.cell} ${styles.cellTags}`}>
                  <span className={styles.tag}>{STATUS_LABEL[row.status]}</span>
                </div>
                <div className={styles.scoreCell}>
                  <span className={styles.scoreTrack}>
                    <span
                      className={styles.scoreFill}
                      style={{
                        width: `${Math.round((row.score / top) * 100)}%`,
                        background: fillColor(row.score, top),
                      }}
                    />
                  </span>
                  <span className={styles.scoreValue}>{row.score}</span>
                </div>
              </div>
            );
          })}

          {rows.length === 0 ? (
            <div className={styles.emptyRow}>여기에 해당하는 기록이 없습니다.</div>
          ) : null}
        </div>

        <div className={styles.footNote}>
          <span className={styles.footNoteText}>
            체크한 {chosen.size}건만 이번 포트폴리오에 들어갑니다
          </span>
          <span className={styles.footNoteDot}>·</span>
          <span className={styles.footNoteText}>
            줄에 마우스를 올리면 왜 이 순위인지 보입니다
          </span>
        </div>
      </div>

      <aside className={styles.rail}>
        <div style={{ flexShrink: 0 }}>
          <div className={styles.railHead}>
            <span className={styles.railTitle}>고른 재료 {chosen.size}건</span>
            <span className={styles.railNote}>
              {materials.materials.length - chosen.size}건 제외됨
            </span>
          </div>
          <div className={styles.mixCard}>
            {mix.length === 0 ? (
              <div className={styles.railRowBody}>아직 고른 재료가 없습니다.</div>
            ) : (
              <>
                <div className={styles.mixBar}>
                  {mix.map((slice, index) => (
                    <span
                      key={slice.label}
                      className={styles.mixSlot}
                      style={{
                        flex: slice.count,
                        background: MIX_SHADES[index % MIX_SHADES.length],
                      }}
                    />
                  ))}
                </div>
                <div className={styles.mixList}>
                  {mix.map((slice, index) => (
                    <div key={slice.label} className={styles.mixRow}>
                      <span
                        className={styles.mixSwatch}
                        style={{ background: MIX_SHADES[index % MIX_SHADES.length] }}
                      />
                      <span className={styles.mixLabel}>{slice.label}</span>
                      <span className={styles.mixCount}>{slice.count}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div className={styles.railSection}>
          <div className={styles.modeHead}>
            <span className={styles.modeLabel}>MODE</span>
            <span className={styles.modeTitle}>어떻게 만들까요</span>
          </div>
          <div className={styles.modes} role="radiogroup" aria-label="제작 모드">
            <button
              type="button"
              role="radio"
              aria-checked={currentMode === "solo"}
              onClick={() => chooseMode("solo")}
              className={`${styles.mode} ${currentMode === "solo" ? styles.modeSelected : ""}`}
            >
              <span className={styles.modeMark} />
              <span style={{ minWidth: 0 }}>
                <span className={styles.modeName} style={{ display: "block" }}>
                  에이전트 모드
                </span>
                <span className={styles.modeDesc} style={{ display: "block" }}>
                  질문에 답하면 나머지는 맡깁니다
                </span>
              </span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={currentMode === "collab"}
              disabled={!coworkAllowed}
              onClick={() => chooseMode("collab")}
              className={`${styles.mode} ${currentMode === "collab" ? styles.modeSelected : ""}`}
            >
              <span className={styles.modeMark} />
              <span style={{ minWidth: 0 }}>
                <span className={styles.modeName} style={{ display: "block" }}>
                  Cowork 모드
                  {coworkAllowed ? null : <span className={styles.proTag}>PRO</span>}
                </span>
                <span className={styles.modeDesc} style={{ display: "block" }}>
                  {coworkAllowed
                    ? "섹션마다 함께 고칩니다. 결과는 더 내 것에 가깝습니다"
                    : "PRO에서 섹션마다 함께 고칠 수 있습니다"}
                </span>
              </span>
            </button>
          </div>
        </div>

        <div className={`${styles.railSection} ${styles.railSectionWide}`}>
          <div className={styles.railRowTitle} style={{ marginBottom: "11px" }}>
            뺀 {materials.materials.length - chosen.size}건은 왜 빠졌나요
          </div>
          {excludedReasons.length === 0 ? (
            <div className={styles.railRowBody}>줄 세운 기록을 모두 담았습니다.</div>
          ) : (
            <div className={styles.reasons}>
              {excludedReasons.map((reason) => (
                <div key={reason.label} className={styles.reasonRow}>
                  <span className={styles.reasonDot} />
                  <span className={styles.reasonLabel}>{reason.label}</span>
                  <span className={styles.reasonCount}>{reason.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={styles.quota}>
          {quota ? (
            <>
              <div className={styles.quotaHead}>
                <span className={styles.quotaLabel}>이번 달 추출</span>
                <span className={styles.quotaValue}>
                  {quota.used} / {quota.limit ?? "무제한"}
                </span>
              </div>
              {quota.limit === null ? null : (
                <div className={styles.quotaSlots}>
                  {Array.from({ length: quota.limit }, (_, index) => (
                    <span
                      key={index}
                      className={`${styles.quotaSlot} ${index < quota.used ? styles.quotaSlotUsed : ""}`}
                    />
                  ))}
                </div>
              )}
            </>
          ) : null}
          {/* 체크 0건이면 CTA 비활성 (정의서 01b 규칙) */}
          {chosen.size === 0 ? (
            <button type="button" className={styles.brew} disabled>
              최소 1건을 골라주세요
            </button>
          ) : (
            <Link href={`/brew/${brewId}/counter` as Route} className={styles.brew}>
              AI와 대화 시작
            </Link>
          )}
        </div>
      </aside>
    </div>
  );
}

/** 무엇이 몇 건인지. 많은 것부터. */
function groupBy(rows: BrewMaterial[], key: (row: BrewMaterial) => string) {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(key(row), (counts.get(key(row)) ?? 0) + 1);
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count);
}
