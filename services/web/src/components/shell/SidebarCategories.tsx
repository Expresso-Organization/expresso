"use client";

import type { CareerCategory } from "@expresso/contracts";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon } from "@/components/ui/Icon";

import styles from "./Sidebar.module.css";

/** §3.5 카테고리 7종의 아이콘은 고정 매핑이다. 다른 아이콘으로 대체하지 않는다. */
const CATEGORY_ICONS: Record<string, string> = {
  experience: "chat-circle-dots",
  project: "briefcase",
  education_history: "graduation-cap",
  certification_award: "certificate",
  academic_writing: "article",
  activity_leadership: "users-three",
  skill_tool: "code",
};

/** 열려 있는 카테고리도 주소가 안다 — `/career/{key}`. */
export function SidebarCategories({
  categories,
}: {
  categories: readonly CareerCategory[];
}) {
  const pathname = usePathname();

  return (
    <div className={styles.categories}>
      {categories.map((category) => {
        const isActive = pathname === `/career/${category.key}`;
        return (
          <Link
            key={category.id}
            href={`/career/${category.key}` as Route}
            className={`${styles.categoryItem} ${
              isActive ? styles.categoryItemActive : ""
            }`}
            aria-current={isActive ? "page" : undefined}
          >
            <Icon name="caret-right" size={10} color="var(--ex-border-strong)" />
            <Icon
              name={CATEGORY_ICONS[category.key] ?? "file-text"}
              weight={isActive ? "fill" : "regular"}
              size={14}
              color={isActive ? "var(--ex-ink-900)" : "var(--ex-slate-500)"}
            />
            <span className={styles.categoryName}>{category.name}</span>
            <span className={styles.categoryCount}>{category.recordCount}</span>
            <Icon name="plus" size={11} color="var(--ex-border-strong)" />
          </Link>
        );
      })}
      <div className={styles.addCategory}>
        <Icon name="plus" size={13} color="var(--ex-slate-500)" />
        <span className={styles.addCategoryLabel}>카테고리 추가</span>
      </div>
    </div>
  );
}
