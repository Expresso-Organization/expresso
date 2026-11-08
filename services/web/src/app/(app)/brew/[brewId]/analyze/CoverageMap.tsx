"use client";

import type { RequirementCoverage } from "@expresso/contracts";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { Icon } from "@/components/ui/Icon";

import { REQUIREMENT_KIND_LABEL } from "../requirement-kind";
import { sourceLines, sourceSegments } from "./source-marks";
import styles from "./page.module.css";

const KINDS = ["must", "nice", "tone"] as const;

/** 스크린 리더와 툴팁이 읽는 상태 이름. 화면은 표시의 채움으로 말한다. */
const COVERAGE_NAME = {
  covered: "기록 있음",
  partial: "기록 일부",
  missing: "기록 없음",
} as const;

const CELL_CLASS = {
  covered: styles.cellCovered,
  partial: styles.cellPartial,
  missing: styles.cellMissing,
} as const;

const ROW_CLASS = {
  covered: styles.rowCovered,
  partial: styles.rowPartial,
  missing: styles.rowMissing,
} as const;

const MARK_CLASS = {
  covered: styles.markCovered,
  partial: styles.markPartial,
  missing: styles.markMissing,
} as const;

const LINE_CLASS = {
  heading: styles.lineHeading,
  item: styles.lineItem,
  text: styles.lineText,
} as const;

function prefersStill(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * 요건과 원문을 잇는 지도.
 *
 * 왼쪽 행과 오른쪽 문장은 같은 요건을 가리키는 두 자리다. 하나를 가리키면 다른 쪽이
 * 함께 밝아진다 — 근거가 어디에 있는지를 문장으로 옮겨 적지 않고 자리로 보여 준다.
 * 눌러서 고정한 것이 있으면 포인터가 떠나도 그 요건으로 돌아온다.
 */
export function CoverageMap({
  requirements,
  sourceText,
  head,
}: {
  requirements: RequirementCoverage[];
  sourceText: string | null;
  /** 어느 공고인가. 원문이 있으면 원문의 머리에, 없으면 목록 위에 선다. */
  head: ReactNode;
}) {
  const [pinned, setPinned] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const active = hovered ?? pinned;
  const rowRefs = useRef(new Map<string, HTMLElement>());
  const markRefs = useRef(new Map<string, HTMLElement>());

  const groups = useMemo(
    () =>
      KINDS.map((kind) => ({
        kind,
        rows: requirements.filter((one) => one.kind === kind),
      })).filter(({ rows }) => rows.length > 0),
    [requirements],
  );
  const sourcePanel = useRef<HTMLElement>(null);
  const stopAligning = useRef<() => void>(() => undefined);
  const segments = useMemo(
    () =>
      sourceText
        ? sourceSegments(
            sourceText,
            requirements.map(({ requirementId, sourceSpan }) => ({
              id: requirementId,
              start: sourceSpan.start,
              end: sourceSpan.end,
            })),
          )
        : [],
    [requirements, sourceText],
  );
  const coverageOf = useMemo(
    () => new Map(requirements.map((one) => [one.requirementId, one.coverage])),
    [requirements],
  );

  const lines = useMemo(() => sourceLines(segments), [segments]);

  // 근거는 대개 회사 소개 뒤에 있다. 처음부터 첫 표시가 보이는 자리에서 연다.
  // 글꼴과 스타일이 늦게 붙으면 자리가 바뀌므로 패널 크기가 변할 때 다시 맞추고,
  // 사용자가 직접 움직이면 그 뒤로는 손대지 않는다.
  useEffect(() => {
    const panel = sourcePanel.current;
    const first = panel?.querySelector("mark");
    if (!panel || !first) return;
    const align = () => {
      const heading = panel.querySelector("header")?.getBoundingClientRect().height ?? 0;
      panel.scrollTop += first.getBoundingClientRect().top - panel.getBoundingClientRect().top - heading - 56;
    };
    const observer = new ResizeObserver(align);
    const stop = () => observer.disconnect();
    stopAligning.current = stop;
    align();
    observer.observe(panel);
    void document.fonts?.ready.then(() => {
      if (panel.isConnected) align();
    });
    for (const type of ["wheel", "touchmove", "pointerdown", "keydown"]) {
      panel.addEventListener(type, stop, { once: true, passive: true });
    }
    return stop;
  }, [lines]);

  const reveal = (element: HTMLElement | undefined) => {
    element?.scrollIntoView({ block: "center", behavior: prefersStill() ? "auto" : "smooth" });
  };

  const pinFromRow = (id: string) => {
    stopAligning.current();
    const next = pinned === id ? null : id;
    setPinned(next);
    if (next) reveal(markRefs.current.get(id));
  };

  const pinFromMark = (id: string) => {
    stopAligning.current();
    setPinned(id);
    reveal(rowRefs.current.get(id));
  };

  return (
    <>
      <div className={styles.left}>
        {sourceText ? null : head}
        {groups.length > 0 ? (
          <div className={styles.strip} role="img" aria-label={requirements.map((one) => `${one.label}: ${COVERAGE_NAME[one.coverage]}`).join(", ")}>
            {groups.map(({ kind, rows }) => (
              <div key={kind} className={styles.stripGroup} style={{ flexGrow: rows.length }}>
                {rows.map((one) => (
                  <span
                    key={one.requirementId}
                    className={`${styles.cell} ${CELL_CLASS[one.coverage]} ${active === one.requirementId ? styles.cellActive : ""}`}
                    onMouseEnter={() => setHovered(one.requirementId)}
                    onMouseLeave={() => setHovered(null)}
                  />
                ))}
              </div>
            ))}
          </div>
        ) : null}

        {groups.map(({ kind, rows }) => (
          <section key={kind} className={styles.group}>
            <h2 className={styles.groupName}>{REQUIREMENT_KIND_LABEL[kind]}</h2>
            {rows.map((one) => {
              const hasMark = segments.some(({ id }) => id === one.requirementId);
              return (
                <button
                  key={one.requirementId}
                  type="button"
                  ref={(element) => {
                    if (element) rowRefs.current.set(one.requirementId, element);
                    else rowRefs.current.delete(one.requirementId);
                  }}
                  className={`${styles.row} ${ROW_CLASS[one.coverage]} ${active === one.requirementId ? styles.rowActive : ""}`}
                  aria-pressed={pinned === one.requirementId}
                  disabled={!hasMark}
                  onMouseEnter={() => setHovered(one.requirementId)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(one.requirementId)}
                  onBlur={() => setHovered(null)}
                  onClick={() => pinFromRow(one.requirementId)}
                >
                  <span className={styles.state} title={COVERAGE_NAME[one.coverage]} aria-label={COVERAGE_NAME[one.coverage]} />
                  <span className={styles.rowLabel}>{one.label}</span>
                  {one.coveredBy.length > 0 ? (
                    <span className={styles.evidence} title={`근거 기록 ${one.coveredBy.length}건`}>
                      <Icon name="file-text" size={13} />
                      {one.coveredBy.length}
                    </span>
                  ) : null}
                  <span className={styles.gapSlot}>
                    {one.coverage === "covered" ? null : (
                      <span title="AI 대화에서 채웁니다" aria-label="AI 대화에서 채웁니다">
                        <Icon name="chat-teardrop-dots" size={16} />
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </section>
        ))}
      </div>

      {sourceText ? (
        <article ref={sourcePanel} className={styles.right}>
          {head}
          {lines.map((line) => {
            if (line.kind === "blank") return null;
            const LineTag = line.kind === "heading" ? "h3" : "p";
            return (
              <LineTag
                key={line.key}
                className={LINE_CLASS[line.kind]}
                style={line.depth > 0 ? { marginLeft: `${line.depth * 18}px` } : undefined}
                data-ordinal={line.ordinal ?? undefined}
              >
                {line.parts.map((part) => {
                  if (part.id === null) return <span key={part.key}>{part.text}</span>;
                  const id = part.id;
                  const coverage = coverageOf.get(id) ?? "missing";
                  return (
                    <mark
                      key={part.key}
                      ref={(element) => {
                        if (element) markRefs.current.set(id, element);
                      }}
                      className={`${styles.mark} ${MARK_CLASS[coverage]} ${active === id ? styles.markActive : ""}`}
                      onMouseEnter={() => setHovered(id)}
                      onMouseLeave={() => setHovered(null)}
                      onClick={() => pinFromMark(id)}
                    >
                      {part.text}
                    </mark>
                  );
                })}
              </LineTag>
            );
          })}
        </article>
      ) : null}
    </>
  );
}
