"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

import styles from "./views.module.css";

/** 단추 아래에 붙어 뜨는 메뉴. 바깥을 누르거나 Escape를 누르면 닫히고 단추로 초점이 돌아간다. */
export function AnchoredMenu({ anchorRef, label, onClose, children }: { anchorRef: RefObject<HTMLElement | null>; label: string; onClose(): void; children: ReactNode }) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const anchor = anchorRef.current?.getBoundingClientRect();
    if (!anchor) return;
    const width = 240;
    setPosition({ top: Math.round(anchor.bottom + 6), left: Math.round(Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8))) });
  }, [anchorRef]);

  useEffect(() => {
    const anchor = anchorRef.current;
    const closeOutside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || menuRef.current?.contains(target) || anchor?.contains(target)) return;
      if (target instanceof Element && target.closest("[data-property-floating-layer]")) return;
      onClose();
    };
    const closeWithEscape = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") { onClose(); anchor?.focus(); } };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeWithEscape);
    return () => { document.removeEventListener("pointerdown", closeOutside); document.removeEventListener("keydown", closeWithEscape); };
  }, [anchorRef, onClose]);

  if (!position) return null;
  return createPortal(<div ref={menuRef} className={styles.tabMenu} role="menu" aria-label={label} data-property-floating-layer style={{ top: position.top, left: position.left }}>{children}</div>, document.body);
}
