"use client";

import type { CareerCategory } from "@expresso/contracts";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { GlideMenu } from "@/components/ui/GlideMenu";
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
    <GlideMenu className={`${styles.categories} ${styles.navGroup}`}>
      {categories.map((category) => {
        const isActive = pathname === `/career/${category.key}`;
        return (
          <Link
            key={category.id}
            href={`/career/${category.key}` as Route}
            data-row
            title={category.name}
            className={`${styles.row} ${styles.categoryItem} ${
              isActive
                ? `${styles.rowActive} ${styles.categoryItemActive}`
                : ""
            }`}
            aria-current={isActive ? "page" : undefined}
          >
            <span className={styles.categoryCaret}>
              <Icon name="caret-right" size={10} color="var(--ex-border-firm)" />
            </span>
            <span className={styles.rowLead}>
              <Icon
                name={CATEGORY_ICONS[category.key] ?? "file-text"}
                weight={isActive ? "fill" : "regular"}
                size={14}
                color={isActive ? "var(--ex-fg)" : "var(--ex-fg-muted)"}
              />
            </span>
            <span className={`${styles.copy} ${styles.categoryName}`}>
              {category.name}
            </span>
            <span className={`${styles.copy} ${styles.categoryCount}`}>
              {category.recordCount}
            </span>
            <span className={styles.copy}>
              <Icon name="plus" size={11} color="var(--ex-border-firm)" />
            </span>
          </Link>
        );
      })}
      <div className={`${styles.row} ${styles.addCategory}`} data-row title="카테고리 추가">
        <span className={styles.rowLead}>
          <Icon name="plus" size={13} color="var(--ex-fg-muted)" />
        </span>
        <span className={`${styles.copy} ${styles.addCategoryLabel}`}>
          카테고리 추가
        </span>
      </div>
    </GlideMenu>
  );
}
