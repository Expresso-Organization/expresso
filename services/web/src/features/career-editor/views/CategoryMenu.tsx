"use client";

import type { CareerCategory } from "@expresso/contracts";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Icon } from "@/components/ui/Icon";

import { AnchoredMenu } from "./AnchoredMenu";
import { setCategoryArchived } from "./category-archive";
import { CategoryDeleteDialog } from "./CategoryDeleteDialog";
import styles from "./views.module.css";

/** 카테고리 머리말의 「…」. 기본 카테고리는 보관만, 직접 만든 카테고리는 삭제까지 한다. */
export function CategoryMenu({ category, onOpenTrash }: { category: CareerCategory; onOpenTrash(): void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState("");
  const anchorRef = useRef<HTMLButtonElement>(null);
  const archived = category.archivedAt !== null;

  async function toggleArchive() {
    setBusy(true); setIssue("");
    const ok = await setCategoryArchived(category.id, !archived);
    setBusy(false);
    if (!ok) { setIssue(archived ? "보관을 해제하지 못했습니다." : "보관하지 못했습니다."); return; }
    setOpen(false);
    router.refresh();
  }

  return <>
    <button ref={anchorRef} type="button" className={styles.headerMenuButton} aria-label={`${category.name} 메뉴`} aria-haspopup="menu" aria-expanded={open} onClick={() => { setIssue(""); setOpen((current) => !current); }}><Icon name="dots-three" size={16} /></button>
    {open ? <AnchoredMenu anchorRef={anchorRef} label={`${category.name} 메뉴`} onClose={() => setOpen(false)}>
      <div className={styles.tabMenuSection}>
        <button type="button" role="menuitem" onClick={() => { setOpen(false); onOpenTrash(); }}><Icon name="trash" size={14} /><span>휴지통</span></button>
      </div>
      <div className={styles.tabMenuSection}>
        <button type="button" role="menuitem" disabled={busy} onClick={() => void toggleArchive()}><Icon name={archived ? "box-arrow-up" : "archive"} size={14} /><span>{archived ? "보관 해제" : "보관"}</span></button>
        {category.builtIn ? null : <button type="button" role="menuitem" data-danger="true" disabled={busy} onClick={() => { setOpen(false); setDeleting(true); }}><Icon name="trash-simple" size={14} /><span>카테고리 삭제</span></button>}
      </div>
      {issue ? <p className={styles.tabMenuIssue} role="alert">{issue}</p> : null}
    </AnchoredMenu> : null}
    {category.builtIn ? null : <CategoryDeleteDialog open={deleting} category={category} onClose={() => setDeleting(false)} />}
  </>;
}
