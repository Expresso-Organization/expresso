"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Icon } from "@/components/ui/Icon";
import { AnchoredMenu } from "@/features/career-editor/views/AnchoredMenu";
import { RecordTrashConfirm, loadDeleteImpacts, type RecordTrashImpact } from "@/features/career-editor/views/record-trash";
import viewStyles from "@/features/career-editor/views/views.module.css";

/**
 * 기록 전체 페이지 머리말의 「…」. 옮긴 뒤에는 카테고리 화면으로 가므로 「되돌리기」를 띄울 자리가 없다.
 * 그래서 쓰는 포트폴리오가 없어도 확인을 받는다.
 */
export function RecordPageMenu({ recordId, recordTitle, categoryKey }: { recordId: string; recordTitle: string; categoryKey: string }) {
  const router = useRouter();
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [impact, setImpact] = useState<RecordTrashImpact | null>(null);
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState("");

  async function prepare() {
    setOpen(false);
    setIssue("");
    const loaded = await loadDeleteImpacts([recordId]);
    if (!loaded) { setIssue("삭제 영향을 확인하지 못했습니다."); return; }
    setImpact(loaded);
  }

  async function trash() {
    setBusy(true);
    const response = await fetch(`/api/career/records/${recordId}`, { method: "DELETE" }).catch(() => null);
    if (!response?.ok) { setBusy(false); setImpact(null); setIssue("기록을 삭제하지 못했습니다."); return; }
    router.push(`/career/${categoryKey}` as Route);
    router.refresh();
  }

  return <>
    {issue ? <span role="alert" className={viewStyles.headerIssue}>{issue}</span> : null}
    <button ref={anchorRef} type="button" className={viewStyles.headerMenuButton} aria-label="기록 메뉴" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((current) => !current)}><Icon name="dots-three" size={16} /></button>
    {open ? <AnchoredMenu anchorRef={anchorRef} label="기록 메뉴" onClose={() => setOpen(false)}>
      <div className={viewStyles.tabMenuSection}>
        <button type="button" role="menuitem" data-danger="true" onClick={() => void prepare()}><Icon name="trash" size={14} /><span>휴지통으로 옮기기</span></button>
      </div>
    </AnchoredMenu> : null}
    {impact ? <RecordTrashConfirm open count={1} title={recordTitle} impact={impact} busy={busy} onCancel={() => setImpact(null)} onConfirm={() => void trash()} /> : null}
  </>;
}
