"use client";

import { CareerCategoryDeleteImpactResponseSchema, type CareerCategory, type CareerCategoryDeleteImpact } from "@expresso/contracts";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/Icon";

import { setCategoryArchived } from "./category-archive";
import styles from "./views.module.css";

/**
 * 카테고리 삭제 확인. 열 때 영향을 다시 받아 기록 수를 보이고, 기록이 있으면 함께 지울지 고르게 한다.
 * 포트폴리오가 인용 중이거나 다른 카테고리의 관계 속성이 가리키면 삭제 대신 보관만 남긴다.
 */
export function CategoryDeleteDialog({ open, category, onClose }: { open: boolean; category: CareerCategory; onClose(): void }) {
  const router = useRouter();
  const [impact, setImpact] = useState<CareerCategoryDeleteImpact | null>(null);
  const [issue, setIssue] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setImpact(null); setIssue("");
    void fetch(`/api/career/categories/${category.id}/delete-impact`).then(async (response) => {
      if (cancelled) return;
      if (!response.ok) { setIssue("삭제 영향을 확인하지 못했습니다."); return; }
      const payload = CareerCategoryDeleteImpactResponseSchema.parse(await response.json());
      if (!cancelled) setImpact(payload.data);
    }).catch(() => { if (!cancelled) setIssue("삭제 영향을 확인하지 못했습니다."); });
    return () => { cancelled = true; };
  }, [category.id, open]);

  const recordTotal = impact ? impact.recordCount + impact.trashedRecordCount : 0;
  const blocked = impact ? impact.quotedRecordCount > 0 || impact.blockingProperties.length > 0 : false;

  async function remove() {
    setBusy(true); setIssue("");
    const response = await fetch(`/api/career/categories/${category.id}?deleteRecords=${recordTotal > 0}`, { method: "DELETE" }).catch(() => null);
    setBusy(false);
    if (!response?.ok) { setIssue(response?.status === 409 ? "그사이 기록이나 인용이 바뀌었습니다. 창을 닫고 다시 시도해 주세요." : "카테고리를 삭제하지 못했습니다."); return; }
    onClose();
    // `/career`가 보관하지 않은 첫 카테고리로 보냅니다.
    router.push("/career" as Route);
    router.refresh();
  }

  async function archiveInstead() {
    setBusy(true); setIssue("");
    const ok = await setCategoryArchived(category.id, true);
    setBusy(false);
    if (!ok) { setIssue("보관하지 못했습니다."); return; }
    onClose();
    router.refresh();
  }

  const archiveButton = category.archivedAt === null
    ? <button type="button" disabled={busy} onClick={() => void archiveInstead()}><Icon name="archive" size={13} />대신 보관</button>
    : null;

  return <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
    <DialogContent className={styles.trashDialog}>
      <DialogTitle className={styles.trashTitle}><Icon name="trash-simple" size={16} />{blocked ? `「${category.name}」 카테고리를 삭제할 수 없습니다` : `「${category.name}」 카테고리를 삭제할까요?`}</DialogTitle>
      <DialogDescription className={styles.trashConfirmText} render={<div />}>
        {impact === null ? (issue ? null : <p aria-busy="true">영향을 확인하는 중</p>)
          : blocked ? <ul className={styles.categoryDeleteReasons} aria-label="삭제를 막는 이유">
            {impact.quotedRecordCount > 0 ? <li>포트폴리오가 이 카테고리의 기록 {impact.quotedRecordCount}개를 인용하고 있습니다.</li> : null}
            {impact.blockingProperties.map((property) => <li key={property.propertyId}>「{property.categoryName}」 카테고리의 「{property.propertyName}」 관계 속성이 이 카테고리를 가리킵니다.</li>)}
          </ul>
            : recordTotal > 0
              ? <p data-tone="warning">기록 <strong>{recordTotal}개</strong>{impact.trashedRecordCount > 0 ? `(휴지통 ${impact.trashedRecordCount}개 포함)` : ""}도 함께 영구 삭제됩니다. 되돌릴 수 없습니다.</p>
              : <p>비어 있는 카테고리입니다. 삭제하면 되돌릴 수 없습니다.</p>}
      </DialogDescription>
      {issue ? <p role="alert" className={styles.trashIssue}>{issue}</p> : null}
      <div className={styles.trashConfirmActions}>
        <button type="button" onClick={onClose}>취소</button>
        {impact && (blocked || recordTotal > 0) ? archiveButton : null}
        {impact && !blocked ? <button type="button" data-danger="true" disabled={busy} onClick={() => void remove()}>{recordTotal > 0 ? "기록까지 삭제" : "삭제"}</button> : null}
      </div>
    </DialogContent>
  </Dialog>;
}
