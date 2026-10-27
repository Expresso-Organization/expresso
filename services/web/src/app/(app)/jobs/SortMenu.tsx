"use client";

import type { Route } from "next";
import Link from "next/link";

import { Icon } from "@/components/ui/Icon";

import styles from "./page.module.css";
import { usePopover } from "./use-popover";

export interface SortOption {
  key: string;
  label: string;
  href: Route;
  active: boolean;
}

/**
 * 06 카테고리 줄 오른쪽의 정렬. 버튼에는 지금 정렬의 이름이 선다.
 *
 * 고르면 `?sort=`만 바뀐 주소로 간다. 걸린 조건은 그대로 들고 간다 — 주소는
 * 서버 컴포넌트가 미리 계산해 넘긴다.
 */
export function SortMenu({ options }: { options: SortOption[] }) {
  const { open, setOpen, box } = usePopover();
  const current = options.find((option) => option.active) ?? options[0];

  return (
    <div className={styles.sortMenu} ref={box}>
      <button
        type="button"
        className={styles.sortSelect}
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        aria-haspopup="true"
      >
        {current?.label}
        <Icon name="caret-down" size={10} />
      </button>
      {open ? (
        <div className={styles.filterPop}>
          {options.map((option) => (
            <Link
              key={option.key}
              href={option.href}
              onClick={() => setOpen(false)}
              aria-current={option.active ? "true" : undefined}
              className={`${styles.filterOption} ${option.active ? styles.filterOptionOn : ""}`}
            >
              {option.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
