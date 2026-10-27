"use client";

import type { CareerCategory } from "@expresso/contracts";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { GlideMenu } from "@/components/ui/GlideMenu";
import { Icon } from "@/components/ui/Icon";
import { CAREER_CATEGORY_ICONS } from "@/lib/career-category-icons";

import styles from "./Sidebar.module.css";

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
            <span className={styles.rowLead}>
              <Icon
                name={CAREER_CATEGORY_ICONS[category.key] ?? "file-text"}
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
