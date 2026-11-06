"use client";

import type { CareerCategory, CareerRecord, CareerRecordListItem } from "@expresso/contracts";
import type { CSSProperties, KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Icon } from "@/components/ui/Icon";
import { CareerDocumentEditor } from "@/features/career-editor/editor/CareerDocumentEditor";
import { SaveState } from "@/features/career-editor/editor/SaveState";
import { AiProposalPanel, type AiPromptRequest } from "@/features/career-editor/ai/AiProposalPanel";
import { CareerRecordSyncProvider } from "@/features/career-editor/properties/record-sync";
import { useCareerEditorSession } from "@/features/career-editor/session/useCareerEditorSession";

import styles from "./DocumentPanel.module.css";

const DEFAULT_PANEL_WIDTH = 680;
const MAX_PANEL_WIDTH = 900;

export function DocumentPanel({
  record,
  category,
  onClose,
  onExpand,
  aiRequest,
  onAiRequestHandled,
  onRecordChange,
  onCategoryChange,
}: {
  record: CareerRecordListItem | null;
  category: CareerCategory;
  onClose: () => void;
  onExpand?: () => void;
  aiRequest?: AiPromptRequest | null | undefined;
  onAiRequestHandled?: (() => void) | undefined;
  /** 패널에서 저장한 기록 · 카테고리를 뷰에 반영한다. */
  onRecordChange?: ((record: CareerRecord) => void) | undefined;
  onCategoryChange?: ((category: CareerCategory) => void) | undefined;
}) {
  const [width, setWidth] = useState(DEFAULT_PANEL_WIDTH);
  const [visibleRecord, setVisibleRecord] = useState(record);
  const [resizing, setResizing] = useState(false);
  const [editorAiRequest, setEditorAiRequest] = useState<AiPromptRequest | null>(null);
  const drag = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const openRecordId = record?.id ?? null;
  // 열 때 포커스를 패널로 옮기고, 닫을 때 패널을 연 자리(표의 행)로 돌려줍니다.
  useEffect(() => {
    if (!openRecordId) return;
    if (!panelRef.current?.contains(document.activeElement)) returnFocus.current = document.activeElement as HTMLElement | null;
    // 표도 같은 순간 활성 셀로 포커스를 옮기므로, 그 뒤 차례에 패널로 옮깁니다.
    const timer = setTimeout(() => panelRef.current?.focus({ preventScroll: true }), 0);
    return () => clearTimeout(timer);
  }, [openRecordId]);
  const close = useCallback(() => {
    onClose();
    const target = returnFocus.current;
    returnFocus.current = null;
    if (target?.isConnected) queueMicrotask(() => target.focus());
  }, [onClose]);
  const panelRecord = record ?? visibleRecord;
  const sync = useMemo(() => ({ onRecordChange: (next: CareerRecord) => onRecordChange?.(next), onCategoryChange: (next: CareerCategory) => onCategoryChange?.(next) }), [onCategoryChange, onRecordChange]);

  useEffect(() => {
    if (record) setVisibleRecord(record);
    setEditorAiRequest(null);
  }, [record]);

  const requestedPrompt = editorAiRequest ?? aiRequest;
  const handleAiRequest = () => {
    if (requestedPrompt?.id === aiRequest?.id) onAiRequestHandled?.();
    setEditorAiRequest(null);
  };

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
      ref={panelRef}
      tabIndex={-1}
      onKeyDown={(event) => {
        // 본문 · 입력 칸 안의 Escape는 그 칸의 메뉴와 선택을 닫는 데 씁니다. 패널은 칸 밖에서 누를 때만 닫습니다.
        const target = event.target as HTMLElement;
        if (event.key !== "Escape" || event.defaultPrevented || !record || target.isContentEditable || target.closest("input, textarea, select")) return;
        event.preventDefault();
        close();
      }}
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
          {panelRecord ? <SaveState key={panelRecord.id} recordId={panelRecord.id} className={styles.headLabel} /> : null}
          <button type="button" className={styles.headAction} aria-label="닫기" onClick={close}>
            <Icon name="x" size={15} />
          </button>
        </div>
      </div>

      {panelRecord ? (
        <>
          <div className={styles.body}>
            <div className={styles.blocks}>
              <CareerRecordSyncProvider value={sync}>
                <CareerDocumentEditor key={panelRecord.id} recordId={panelRecord.id} mode="peek" record={panelRecord} category={category} showAiProposal={false} onAiRequest={setEditorAiRequest} />
              </CareerRecordSyncProvider>
            </div>
          </div>

          <div className={styles.foot}>
            <DocumentPanelAiDock key={panelRecord.id} recordId={panelRecord.id} category={category} aiRequest={requestedPrompt} onAiRequestHandled={handleAiRequest} />
          </div>
        </>
      ) : null}
    </aside>
  );
}

function DocumentPanelAiDock({ recordId, category, aiRequest, onAiRequestHandled }: { recordId: string; category: CareerCategory; aiRequest?: AiPromptRequest | null | undefined; onAiRequestHandled?: (() => void) | undefined }) {
  const { snapshot, document } = useCareerEditorSession(recordId);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return <AiProposalPanel recordId={recordId} documentVersion={snapshot.documentVersion} selectedBlockIds={mounted && document?.content[0]?.id ? [document.content[0].id] : []} announcedProposal={mounted ? snapshot.proposal : null} requestedPrompt={mounted ? aiRequest : null} onRequestHandled={onAiRequestHandled} document={mounted ? document : null} definitions={category.propertySchemaV2 ?? []} />;
}
