"use client";

import {
  isStructuredGroup,
  type StructuredPortfolioSnapshot,
  type StructuredPortfolioSpec,
} from "@expresso/contracts";
import { STRUCTURED_TYPE_LABELS } from "@expresso/portfolio-renderer/editing";
import { useActionState, useTransition } from "react";

import { structuredPageAction } from "./edit-actions";
import styles from "./page.module.css";

type Row = {
  key: string;
  parent: string;
  depth: number;
  index: number;
  /** 이 행이 옮겨 갈 수 있는 자리 [처음, 끝]. 소개 · 연락처는 자리가 고정이라 null이다. */
  bounds: [number, number] | null;
  title: string;
  meta: string;
};

/** 요소가 보이는 글로 행 이름을 정한다. 사례는 섹션 제목, 첫 화면은 이름, 인용은 인용 글이다. */
function describe(snapshot: StructuredPortfolioSnapshot, key: string): { title: string; meta: string } {
  const node = snapshot.spec.elements[key];
  const type = STRUCTURED_TYPE_LABELS[node?.type ?? ""] ?? node?.type ?? "요소";
  const binding = (node?.props as { section?: { $state?: string } } | undefined)?.section?.$state;
  const section = snapshot.content.sections.find((item) => binding === `/sectionById/${item.id}`);
  if (node?.type === "PullQuote" && section?.quote) return { title: section.quote, meta: type };
  if (section) return { title: section.title, meta: type };
  if (node?.type === "NameIntro") return { title: snapshot.content.profile.name, meta: type };
  return { title: type, meta: isStructuredGroup(node) ? `요소 ${node.children.length}개` : "" };
}

function outlineRows(snapshot: StructuredPortfolioSnapshot): Row[] {
  const root = snapshot.spec.elements[snapshot.spec.root];
  if (root?.type !== "PortfolioPage") return [];
  const top = root.children;
  const fixedStart = top.filter((key) => snapshot.spec.elements[key]?.type === "NameIntro").length;
  const fixedEnd = top.filter((key) => snapshot.spec.elements[key]?.type === "Contact").length;
  return top.flatMap((key, index) => {
    const node = snapshot.spec.elements[key];
    const fixed = node?.type === "NameIntro" || node?.type === "Contact";
    const row: Row = {
      key, parent: snapshot.spec.root, depth: 0, index,
      bounds: fixed ? null : [fixedStart, top.length - 1 - fixedEnd],
      ...describe(snapshot, key),
    };
    if (!isStructuredGroup(node)) return [row];
    return [row, ...node.children.map((child, childIndex) => ({
      key: child, parent: key, depth: 1, index: childIndex,
      bounds: [0, node.children.length - 1] as [number, number],
      ...describe(snapshot, child),
    }))];
  });
}

/**
 * 04 왼쪽 목차. 지면의 요소를 읽는 순서대로 보이고, 고르면 미리보기가 그 요소로 간다. 위 · 아래로 옮기면 새 판으로 저장한다.
 * 소개는 맨 앞, 연락처는 맨 끝에 고정이고, 묶음 안의 요소는 그 묶음 안에서만 움직인다.
 */
export function PageOutline({
  snapshot,
  portfolioId,
  revision,
  selected,
  onSelect,
}: {
  snapshot: StructuredPortfolioSnapshot;
  portfolioId: string;
  revision: number;
  selected: string | null;
  onSelect: (key: string) => void;
}) {
  const [state, save, saving] = useActionState(structuredPageAction, {});
  const [, startTransition] = useTransition();
  const rows = outlineRows(snapshot);

  function move(row: Row, step: -1 | 1) {
    const spec: StructuredPortfolioSpec = structuredClone(snapshot.spec);
    const parent = spec.elements[row.parent];
    if (!parent || !("children" in parent)) return;
    const list = parent.children as string[];
    const target = row.index + step;
    [list[row.index], list[target]] = [list[target]!, list[row.index]!];
    const form = new FormData();
    form.set("portfolioId", portfolioId);
    form.set("payload", JSON.stringify({ expectedRevision: revision, spec, patches: [] }));
    startTransition(() => save(form));
  }

  return (
    <>
      <div className={styles.sectionList}>
        {rows.map((row) => (
          <div
            key={row.key}
            role="button"
            tabIndex={0}
            aria-pressed={row.key === selected}
            onClick={() => onSelect(row.key)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(row.key);
              }
            }}
            className={[styles.sectionRow, row.key === selected ? styles.sectionRowActive : null, row.depth ? styles.outlineNested : null].filter(Boolean).join(" ")}
          >
            <span className={styles.sectionMove}>
              <button
                type="button"
                className={styles.sectionMoveButton}
                aria-label={`${row.title} 위로`}
                disabled={!row.bounds || row.index <= row.bounds[0] || saving}
                onClick={(event) => { event.stopPropagation(); move(row, -1); }}
              >
                ↑
              </button>
              <button
                type="button"
                className={styles.sectionMoveButton}
                aria-label={`${row.title} 아래로`}
                disabled={!row.bounds || row.index >= row.bounds[1] || saving}
                onClick={(event) => { event.stopPropagation(); move(row, 1); }}
              >
                ↓
              </button>
            </span>
            <span className={styles.outlineText}>
              <span className={styles.sectionTitle}>{row.title}</span>
              {row.meta ? <span className={styles.sectionMeta}>{row.meta}</span> : null}
            </span>
          </div>
        ))}
      </div>
      {state.error ? <p className={styles.sectionError}>{state.error}</p> : null}
    </>
  );
}
