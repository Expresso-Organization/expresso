"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Icon } from "@/components/ui/Icon";

import styles from "./page.module.css";

/** 아무것도 안 건 상태의 이름. 버튼에도 목록에도 같은 말이 서야 한다. */
export const ALL = "전체";

export interface FilterOption {
  label: string;
  count: number;
  href: Route;
}

export interface FilterSection {
  key: string;
  title: string;
  /** 칸막이가 겹칠 때처럼, 수를 어떻게 읽어야 하는지 한 줄로 밝힌다. */
  note?: string | undefined;
  /** 지금 걸린 것. 안 걸렸으면 null이고 `전체`가 켜진다. */
  active: string | null;
  options: FilterOption[];
}

/**
 * 목록 필터.
 *
 * 전에는 나라 칩이 목록 위에 한 줄로 깔려 있었다. 걸린 나라가 일곱이라 그
 * 줄만 한 칸을 먹었고, 정작 대부분은 한국만 본다. 그래서 버튼 하나로 접고,
 * 누를 때만 펴 준다 — 축이 늘어도 화면은 그대로다.
 *
 * **축은 화면이 아니라 데이터가 정했다.** 158건을 세어 보고 값이 있는 것만
 * 세웠다: 근무지 158 · 경력 139 · 회사 158 · 근무 형태 39. 마감일과 기술
 * 스택은 **0건**이라 두지 않았다 — 만들면 눌러도 아무것도 안 걸리는 칸이 된다.
 */
export function JobFilter({ sections }: { sections: FilterSection[] }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // 바깥을 누르거나 Esc를 치면 닫는다. 팝아웃을 열어 둔 채로 다른 곳을 눌렀을
  // 때 그대로 떠 있으면, 닫으려고 한 번 더 눌러야 한다.
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

  const on = sections.filter((section) => section.active !== null);

  return (
    <div className={styles.filter} ref={box}>
      <button
        type="button"
        className={`${styles.filterButton} ${on.length > 0 ? styles.filterButtonOn : ""}`}
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Icon name="funnel-simple" size={12} />
        {/*
         * 버튼만 보고도 무엇이 걸려 있는지 알아야 한다. 하나면 그 이름을 그대로
         * 적고, 여럿이면 개수를 적는다 — `한국 · 3년 · 재택 · 당근마켓`은
         * 버튼이 아니라 문장이 된다.
         */}
        {on.length === 0 ? "필터" : on.length === 1 ? on[0]?.active : `필터 ${on.length}`}
      </button>

      {open ? (
        <div className={styles.filterPop}>
          {sections.map((section) => (
            <div
              key={section.key}
              className={styles.filterSection}
              role="group"
              aria-label={section.title}
            >
              <div className={styles.filterPopTitle}>
                {section.title}
                {section.note ? <span className={styles.filterNote}>{section.note}</span> : null}
              </div>
              {section.options.map((option) => {
                const picked = option.label === (section.active ?? ALL);
                return (
                  <Link
                    key={option.label}
                    href={option.href}
                    onClick={() => setOpen(false)}
                    aria-current={picked ? "true" : undefined}
                    className={`${styles.filterOption} ${picked ? styles.filterOptionOn : ""}`}
                  >
                    {option.label}
                    <span className={styles.filterCount}>{option.count}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
