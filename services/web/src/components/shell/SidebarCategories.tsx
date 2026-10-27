"use client";

import type { CareerCategory } from "@expresso/contracts";
import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type FormEvent, type KeyboardEvent } from "react";

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
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "failed">("idle");

  const close = () => { setAdding(false); setName(""); setState("idle"); };
  const create = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || state === "saving") return;
    setState("saving");
    // 키는 주소에 쓰이므로 이름과 별개로 정합니다. 사용자 카테고리는 기본 7종과 겹치지 않게 접두어를 둡니다.
    const key = `custom_${crypto.randomUUID().replaceAll("-", "").slice(0, 8)}`;
    const response = await fetch("/api/career/categories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key, name: trimmed, icon: "folder", defaultView: "table" }),
    }).catch(() => null);
    if (!response?.ok) { setState("failed"); return; }
    close();
    router.push(`/career/${key}` as Route);
    // 사이드바 목록은 레이아웃이 세션에서 읽으므로 레이아웃까지 다시 받습니다.
    router.refresh();
  };
  const cancelOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };

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
      {adding ? (
        <form className={`${styles.row} ${styles.addCategory}`} data-row data-state={state} onSubmit={(event) => void create(event)}>
          <span className={styles.rowLead}>
            <Icon name="folder" size={14} color="var(--ex-fg-muted)" />
          </span>
          <input
            className={`${styles.copy} ${styles.addCategoryInput}`}
            aria-label="새 카테고리 이름"
            aria-invalid={state === "failed"}
            placeholder="카테고리 이름"
            maxLength={120}
            autoFocus
            value={name}
            disabled={state === "saving"}
            onChange={(event) => { setName(event.target.value); if (state === "failed") setState("idle"); }}
            onKeyDown={cancelOnEscape}
            onBlur={() => { if (!name.trim()) close(); }}
          />
        </form>
      ) : (
        <button type="button" className={`${styles.row} ${styles.addCategory}`} data-row title="카테고리 추가" onClick={() => setAdding(true)}>
          <span className={styles.rowLead}>
            <Icon name="plus" size={13} color="var(--ex-fg-muted)" />
          </span>
          <span className={`${styles.copy} ${styles.addCategoryLabel}`}>
            카테고리 추가
          </span>
        </button>
      )}
    </GlideMenu>
  );
}
