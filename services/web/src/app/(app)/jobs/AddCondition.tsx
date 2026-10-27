"use client";

import type { Route } from "next";
import Link from "next/link";

import { Icon } from "@/components/ui/Icon";

import styles from "./page.module.css";
import { usePopover } from "./use-popover";

export interface AddConditionSection {
  key: string;
  title: string;
  options: { label: string; count?: number; href: Route }[];
}

/**
 * "이렇게 이해했습니다" 줄 끝의 「조건 추가」.
 *
 * 검색어가 읽어내지 못한 축(칩이 없는 축)만 늘어놓는다. 값을 고르면 그 축이
 * 주소에 실리고, 다음 화면에서 그 축의 칩이 생긴다 — 바꾸거나 끄는 일은 그
 * 칩이 맡는다. 주소는 서버 컴포넌트가 칩과 같은 `conditionHref`로 미리
 * 계산해 넘긴다.
 */
export function AddCondition({ sections }: { sections: AddConditionSection[] }) {
  const { open, setOpen, box } = usePopover();

  return (
    <div className={styles.parsedChipBox} ref={box}>
      <button
        type="button"
        className={styles.parsedAdd}
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Icon name="plus" size={11} />
        조건 추가
      </button>
      {open ? (
        <div className={styles.parsedChipPop}>
          {sections.map((section) => (
            <div
              key={section.key}
              className={styles.filterSection}
              role="group"
              aria-label={section.title}
            >
              <div className={styles.filterPopTitle}>{section.title}</div>
              {section.options.map((option) => (
                <Link
                  key={option.label}
                  href={option.href}
                  onClick={() => setOpen(false)}
                  className={styles.filterOption}
                >
                  {option.label}
                  {option.count !== undefined ? (
                    <span className={styles.filterCount}>{option.count}</span>
                  ) : null}
                </Link>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
