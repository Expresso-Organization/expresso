"use client";
import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import type { AgentSavedRecord } from "@expresso/contracts";
import { Icon } from "@/components/ui/Icon";
import styles from "./SavedRecordCard.module.css";

/**
 * 대화에서 정리해 저장한 커리어 기록.
 *
 * 저장은 이미 끝났다 — 카드는 무엇이 저장됐는지 보여 주고, 기록을 열거나 저장을 되돌리게 한다.
 * 되돌리면 기록은 휴지통으로 간다. 되돌리기는 AI를 부르지 않으므로 채팅을 쓸 수 없는 상태에서도 된다.
 */
export function SavedRecordCard({ saved, disabled, onUndo }: { saved: AgentSavedRecord; disabled: boolean; onUndo(): Promise<unknown> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const undo = async () => {
    setBusy(true); setError(null);
    try { await onUndo(); } catch (cause) { setError(cause instanceof Error ? cause.message : "되돌리지 못했습니다."); } finally { setBusy(false); }
  };
  // 본문은 앞부분만 보인다. 소제목 기호(#)는 떼고 줄마다 보인다.
  const lines = saved.bodyMd.split("\n").map(line => line.replace(/^#+\s*/, "").trim()).filter(Boolean);
  return <section className={styles.card} data-state={saved.undone ? "undone" : "saved"} aria-label="저장한 커리어 기록">
    <header className={styles.head}>
      <Icon name={saved.undone ? "arrow-counter-clockwise" : "check-circle"} weight={saved.undone ? "regular" : "fill"} size={15} />
      <span>{saved.undone ? "저장을 되돌렸습니다" : "커리어 기록으로 저장했습니다"}</span>
    </header>
    <div className={styles.title}><strong>{saved.title}</strong><span className={styles.category}>{saved.categoryName}</span></div>
    {saved.undone
      ? <p className={styles.note}>기록은 휴지통에 있습니다. 카테고리 화면의 「…」 메뉴에 있는 휴지통에서 되살릴 수 있습니다.</p>
      : <>
        <div className={styles.body}>{lines.slice(0, 6).map((line, index) => <p key={index}>{line}</p>)}</div>
        <div className={styles.actions}>
          <Link className={styles.open} href={`/career/records/${saved.recordId}` as Route}>기록 열기</Link>
          <button type="button" className={styles.undo} disabled={busy || disabled} onClick={() => void undo()}>{busy ? "되돌리는 중…" : "되돌리기"}</button>
        </div>
      </>}
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
  </section>;
}

/** 기록을 정리하는 동안의 자리. 저장하지 못했을 때는 아무것도 그리지 않는다(에이전트가 고쳐 다시 저장한다). */
export function SavedRecordPending({ failed }: { failed: boolean }) {
  if (failed) return null;
  return <p className={`${styles.pending} ex-anim-shimmer`} role="status">기록으로 정리하고 있습니다.</p>;
}
