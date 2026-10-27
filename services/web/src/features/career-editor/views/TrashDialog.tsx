"use client";

import type { CareerRecord, CareerTrashedRecord } from "@expresso/contracts";
import { useEffect, useState } from "react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/Icon";

import styles from "./views.module.css";

const DAY_MS = 86_400_000;

/** 영구 삭제까지 남은 날. 지운 직후는 보관 기간 30일이 그대로 보이도록 올림한다. */
function daysLeft(purgeAfter: string, now: number): number {
  return Math.max(1, Math.ceil((new Date(purgeAfter).getTime() - now) / DAY_MS));
}

/** 지운 날짜는 사용자 시간대의 날짜로 보인다. */
function localDate(timestamp: string): string {
  const date = new Date(timestamp);
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()].map((part) => String(part).padStart(2, "0")).join(".");
}

/** 이 카테고리에서 지운 기록. 복원하면 목록에서 빠지고 뷰에 다시 나온다. */
export function TrashDialog({ open, categoryId, categoryName, onClose, onRestored }: { open: boolean; categoryId: string; categoryName: string; onClose(): void; onRestored(record: CareerRecord): void }) {
  const [items, setItems] = useState<CareerTrashedRecord[] | null>(null);
  const [loadedAt, setLoadedAt] = useState(0);
  const [issue, setIssue] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setItems(null);
    setIssue("");
    void fetch(`/api/career/categories/${categoryId}/trash`).then(async (response) => {
      if (cancelled) return;
      if (!response.ok) { setIssue("휴지통을 불러오지 못했습니다."); setItems([]); return; }
      const payload = await response.json() as { data: CareerTrashedRecord[] };
      if (cancelled) return;
      setItems(payload.data);
      setLoadedAt(Date.now());
    });
    return () => { cancelled = true; };
  }, [categoryId, open]);

  async function restore(item: CareerTrashedRecord) {
    setBusy(item.id);
    const response = await fetch(`/api/career/records/${item.id}/restore`, { method: "POST" });
    setBusy(null);
    if (!response.ok) { setIssue(response.status === 404 ? "보관 기간이 지나 복원할 수 없습니다." : "기록을 복원하지 못했습니다."); return; }
    const payload = await response.json() as { data: CareerRecord };
    setItems((current) => current?.filter((entry) => entry.id !== item.id) ?? null);
    onRestored(payload.data);
  }

  return <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
    <DialogContent className={styles.trashDialog}>
      <DialogTitle className={styles.trashTitle}><Icon name="trash" size={16} />{categoryName} 휴지통</DialogTitle>
      {issue ? <p role="alert" className={styles.trashIssue}>{issue}</p> : null}
      {items === null ? <p className={styles.trashEmpty} aria-busy="true">불러오는 중</p>
        : items.length === 0 ? <p className={styles.trashEmpty}>비어 있습니다.</p>
          : <ul className={styles.trashList} aria-label="지운 기록">
            {items.map((item) => <li key={item.id}>
              <span className={styles.trashRecord}><strong>{item.title || "제목 없음"}</strong><small>{localDate(item.deletedAt)} 삭제 · {daysLeft(item.purgeAfter, loadedAt)}일 뒤 영구 삭제</small></span>
              <button type="button" disabled={busy === item.id} onClick={() => void restore(item)}><Icon name="arrow-counter-clockwise" size={13} />복원</button>
            </li>)}
          </ul>}
    </DialogContent>
  </Dialog>;
}
