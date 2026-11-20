"use client";

import { Icon } from "@/components/ui/Icon";

import styles from "./views.module.css";

/**
 * 기록 하나를 고르는 상자입니다. 표 행 · 보드 카드 · 타임라인 카드가 같은 무채색 상자를 씁니다.
 * 실제 입력은 숨긴 기본 체크박스라 키보드 · 보조기기 동작은 그대로이고, 보이는 상자만 디자인 토큰으로 그립니다.
 * 언제 보일지(호버 · 포커스 · 골랐을 때)는 놓인 자리의 선택자가 정합니다.
 */
export function RecordSelectBox({ title, checked, onToggle, className, text }: { title: string; checked: boolean; onToggle(): void; className?: string | undefined; text?: string | undefined }) {
  return <label className={className ?? styles.rowCheckbox} data-checked={checked ? "true" : "false"} onClick={(event) => event.stopPropagation()}>
    <input aria-label={`${title || "제목 없음"} 선택`} type="checkbox" checked={checked} onChange={onToggle} />
    <span aria-hidden="true" className={styles.checkMark}>{checked ? <Icon name="check" size={11} weight="bold" /> : null}</span>
    {text ? <span>{text}</span> : null}
  </label>;
}
