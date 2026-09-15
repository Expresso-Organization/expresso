"use client";

import { PRESENTATION_LABEL, PRESENTATIONS_BY_ROLE, SECTION_ROLE_LABEL, type RecipeV2, type RecipeV2Presentation } from "@expresso/contracts";
import type { ReactNode } from "react";

import { Icon } from "@/components/ui/Icon";

import styles from "./FormatPanel.module.css";
import { Wireframe } from "./Wireframe";

/**
 * 오른쪽 — 보여주는 형식을 고른다.
 *
 * 고른 섹션의 역할에 맞는 형식(§7.9)이 와이어프레임으로 선다. 누르면 그 섹션의
 * 형식이다. 어느 디자인을 골랐든 같은 목록이다 — 그 형식을 디자인 안에서
 * 조판하는 일은 03 이다.
 */

type Section = RecipeV2["sections"][number];

function no(order: number): string {
  return String(order + 1).padStart(2, "0");
}

export function FormatPanel({
  section,
  onPick,
  foot,
}: {
  section: Section | null;
  onPick: (presentation: RecipeV2Presentation | null) => void;
  /** 바닥 — 다음 단계로 가는 버튼. */
  foot: ReactNode;
}) {
  const candidates = section ? PRESENTATIONS_BY_ROLE[section.role] : [];

  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <h2>보여주는 형식</h2>
        {section ? (
          <p className={styles.target}>
            <span className={styles.no}>{no(section.order)}</span>
            <b>{section.title || "이름 없는 섹션"}</b>
            <em>{SECTION_ROLE_LABEL[section.role]}</em>
          </p>
        ) : null}
      </div>

      {section ? (
        // 섹션이 바뀌면 목록이 새로 선다 — 와이어프레임이 다시 들어온다.
        <div key={section.id} className={styles.list} role="radiogroup" aria-label="형식">
          {candidates.map((presentation) => {
            const on = section.presentation === presentation;
            return (
              <button
                key={presentation}
                type="button"
                role="radio"
                aria-checked={on}
                className={styles.option}
                data-on={on ? "1" : undefined}
                onClick={() => onPick(on ? null : presentation)}
              >
                <Wireframe presentation={presentation} />
                <span className={styles.label}>
                  {PRESENTATION_LABEL[presentation]}
                  {on ? <Icon name="check" size={12} weight="bold" /> : null}
                </span>
              </button>
            );
          })}
          <p className={styles.note}>
            {section.presentation
              ? "다시 누르면 비웁니다. 비우면 03이 디자인에 맞춰 정합니다."
              : "정하지 않으면 03이 디자인에 맞춰 정합니다."}
          </p>
        </div>
      ) : (
        <p className={styles.empty}>섹션을 고르면 형식이 보입니다.</p>
      )}

      <div className={styles.foot}>{foot}</div>
    </div>
  );
}
