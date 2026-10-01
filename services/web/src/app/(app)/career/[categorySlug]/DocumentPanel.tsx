"use client";

import type { CareerCategory, CareerPropertyDefinitionV2, CareerRecordListItem } from "@expresso/contracts";
import type { CSSProperties, KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Icon } from "@/components/ui/Icon";
import { CareerDocumentEditor } from "@/features/career-editor/editor/CareerDocumentEditor";
import type { CareerPropertyEditorValue } from "@/features/career-editor/properties/canonical-property-values";

import styles from "./DocumentPanel.module.css";

const DEFAULT_PANEL_WIDTH = 680;
const MAX_PANEL_WIDTH = 900;

export function DocumentPanel({
  record,
  category,
  onClose,
  onExpand,
  onRecordCommit,
  onRecordAccepted,
}: {
  record: CareerRecordListItem | null;
  category: CareerCategory;
  onClose: () => void;
  onExpand?: () => void;
  onRecordCommit?: ((recordId: string, definition: CareerPropertyDefinitionV2, value: CareerPropertyEditorValue | null) => Promise<void>) | undefined;
  onRecordAccepted?: ((record: CareerRecordListItem) => void) | undefined;
}) {
  const [width, setWidth] = useState(DEFAULT_PANEL_WIDTH);
  const [visibleRecord, setVisibleRecord] = useState(record);
  const [resizing, setResizing] = useState(false);
  const drag = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);
  const panelRecord = record ?? visibleRecord;

  useEffect(() => {
    if (record) setVisibleRecord(record);
  }, [record]);

  const clampWidth = useCallback((next: number) => {
    const viewportLimit = typeof window === "undefined" ? MAX_PANEL_WIDTH : window.innerWidth - 64;
    return Math.round(Math.min(Math.max(next, 360), Math.max(360, Math.min(MAX_PANEL_WIDTH, viewportLimit))));
  }, []);

  useEffect(() => {
    if (!resizing) return;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const move = (event: PointerEvent) => {
      if (!drag.current) return;
      setWidth(clampWidth(drag.current.startWidth + drag.current.startX - event.clientX));
    };
    const finish = () => {
      drag.current = null;
      setResizing(false);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", finish, { once: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };
  }, [clampWidth, resizing]);

  const resizeFromKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") setWidth((current) => clampWidth(current + 24));
    else if (event.key === "ArrowRight") setWidth((current) => clampWidth(current - 24));
    else if (event.key === "Home") setWidth(360);
    else if (event.key === "End") setWidth(clampWidth(MAX_PANEL_WIDTH));
    else return;
    event.preventDefault();
  };

  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: width };
    setResizing(true);
  };

  return (
    <aside
      className={styles.panel}
      aria-label="문서 패널"
      aria-hidden={record ? undefined : true}
      data-open={record ? "true" : "false"}
      data-resizing={resizing ? "true" : "false"}
      style={{ "--career-drawer-width": `${width}px` } as CSSProperties}
    >
      <div
        className={styles.resizeHandle}
        role="separator"
        aria-label="문서 패널 너비 조절"
        aria-orientation="vertical"
        aria-valuemin={360}
        aria-valuemax={MAX_PANEL_WIDTH}
        aria-valuenow={width}
        tabIndex={record ? 0 : -1}
        onKeyDown={resizeFromKeyboard}
        onPointerDown={startResize}
      />
      <div className={styles.head}>
        <button type="button" className={styles.headAction} aria-label="넓게 보기" disabled={!panelRecord || !onExpand} onClick={onExpand}>
          <Icon name="arrows-out-simple" size={15} />
        </button>
        <span className={styles.headLabel}>{category.name} · 문서</span>
        <div className={styles.headRight}>
          <span className={styles.headLabel}>{panelRecord ? "저장됨" : ""}</span>
          <button type="button" className={styles.headAction} aria-label="닫기" onClick={onClose}>
            <Icon name="x" size={15} />
          </button>
        </div>
      </div>

      {panelRecord ? (
        <>
          <div className={styles.body}>
            <div className={styles.blocks}>
              <CareerDocumentEditor key={panelRecord.id} recordId={panelRecord.id} mode="peek" record={panelRecord} category={category} onRecordCommit={onRecordCommit} onRecordAccepted={onRecordAccepted} />
            </div>
          </div>
        </>
      ) : null}
    </aside>
  );
}
