"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Icon } from "@/components/ui/Icon";

import styles from "./page.module.css";

export interface ConditionChipOption {
  label: string;
  count?: number;
  active: boolean;
  href: Route;
}

/**
 * "이렇게 이해했습니다" 줄의 칩 하나.
 *
 * `JobFilter`와 같은 팝오버 여닫이(바깥 클릭·Esc로 닫기)를 쓰지만, 필터
 * 전체가 아니라 축 하나만 다룬다 — 눌러서 다른 값을 고르거나 맨 위 "끄기"로
 * 그 조건을 뺄 수 있다. 옵션의 `href`는 서버 컴포넌트(`SearchQueryCard`)가
 * 미리 계산해 넘긴다 — 여기서는 여닫기만 다룬다.
 */
export function ConditionChip({
  axisLabel,
  valueLabel,
  enabled,
  options,
  offHref,
}: {
  axisLabel: string;
  valueLabel: string;
  enabled: boolean;
  options: ConditionChipOption[];
  offHref: Route;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div className={styles.parsedChipBox} ref={box}>
      <button
        type="button"
        className={styles.parsedChip}
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        aria-haspopup="true"
      >
        {axisLabel} · {valueLabel}
        <Icon
          name={enabled ? "caret-down" : "x"}
          size={10}
          color={enabled ? undefined : "var(--ex-accent-text)"}
        />
      </button>
      {open ? (
        <div className={styles.parsedChipPop}>
          <Link href={offHref} onClick={() => setOpen(false)} className={styles.parsedChipOff}>
            <Icon name="x" size={11} />
            끄기
          </Link>
          {options.map((option) => (
            <Link
              key={option.label}
              href={option.href}
              onClick={() => setOpen(false)}
              aria-current={option.active ? "true" : undefined}
              className={`${styles.filterOption} ${option.active ? styles.filterOptionOn : ""}`}
            >
              {option.label}
              {option.count !== undefined ? (
                <span className={styles.filterCount}>{option.count}</span>
              ) : null}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
