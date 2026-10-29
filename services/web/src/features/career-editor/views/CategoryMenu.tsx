"use client";

import { useRef, useState } from "react";

import { Icon } from "@/components/ui/Icon";

import { AnchoredMenu } from "./AnchoredMenu";
import styles from "./views.module.css";

/** 카테고리 머리말의 「…」. */
export function CategoryMenu({ categoryName, onOpenTrash }: { categoryName: string; onOpenTrash(): void }) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  return <>
    <button ref={anchorRef} type="button" className={styles.headerMenuButton} aria-label={`${categoryName} 메뉴`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((current) => !current)}><Icon name="dots-three" size={16} /></button>
    {open ? <AnchoredMenu anchorRef={anchorRef} label={`${categoryName} 메뉴`} onClose={() => setOpen(false)}>
      <div className={styles.tabMenuSection}>
        <button type="button" role="menuitem" onClick={() => { setOpen(false); onOpenTrash(); }}><Icon name="trash" size={14} /><span>휴지통</span></button>
      </div>
    </AnchoredMenu> : null}
  </>;
}
