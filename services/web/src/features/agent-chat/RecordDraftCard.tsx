"use client";
import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import type { AgentRecordDraft, AgentRecordDraftDecision } from "@expresso/contracts";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import styles from "./RecordDraftCard.module.css";

/**
 * 대화로 만든 새 기록 초안.
 *
 * 승인 전에는 제목 · 카테고리 · 본문을 고칠 수 있고, 근거가 된 내 발언을 함께 보인다. 승인 ·
 * 거절은 AI를 부르지 않으므로 채팅을 쓸 수 없는 상태에서도 된다.
 */
export function RecordDraftCard({ draft, disabled, onDecide }: { draft: AgentRecordDraft; disabled: boolean; onDecide(decision: AgentRecordDraftDecision): Promise<void> }) {
  const [title, setTitle] = useState(draft.title);
  const [bodyMd, setBodyMd] = useState(draft.bodyMd);
  const [categoryId, setCategoryId] = useState(draft.categoryId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const decide = async (decision: AgentRecordDraftDecision) => {
    setBusy(true); setError(null);
    try { await onDecide(decision); } catch (cause) { setError(cause instanceof Error ? cause.message : "처리하지 못했습니다."); } finally { setBusy(false); }
  };
  const sources = <ul className={styles.sources} aria-label="근거가 된 내 발언">{draft.sources.map(source => <li key={`${source.messageId}:${source.quote}`}><q>{source.quote}</q></li>)}</ul>;
  if (draft.status !== "ready") return <section className={styles.card} aria-label="새 기록 초안">
    <header className={styles.head}><Icon name="note-pencil" size={15} /><span>새 기록 초안</span></header>
    <strong className={styles.doneTitle}>{draft.title}</strong>
    {draft.status === "approved" && draft.recordId
      ? <p className={styles.done} data-state="approved"><Icon name="check-circle" weight="fill" size={13} />기록에 저장했습니다. <Link href={`/career/records/${draft.recordId}` as Route}>기록 열기</Link></p>
      : <p className={styles.done}><Icon name="x-circle" size={13} />초안을 거절했습니다.</p>}
  </section>;
  const ready = !!title.trim() && !!bodyMd.trim() && !!categoryId;
  return <section className={styles.card} aria-label="새 기록 초안">
    <header className={styles.head}><Icon name="note-pencil" size={15} /><span>새 기록 초안</span></header>
    <label className={styles.field}><span>제목</span><input value={title} maxLength={300} onChange={event => setTitle(event.target.value)} disabled={busy || disabled} /></label>
    <label className={styles.field}><span>카테고리</span>
      <select value={categoryId} onChange={event => setCategoryId(event.target.value)} disabled={busy || disabled}>
        <option value="" disabled>카테고리를 고르세요</option>
        {draft.categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
      </select>
    </label>
    <label className={styles.field}><span>본문</span><Textarea className={styles.body} value={bodyMd} maxLength={20_000} rows={8} onChange={event => setBodyMd(event.target.value)} disabled={busy || disabled} /></label>
    <div className={styles.sourceLabel}>근거가 된 내 발언</div>
    {sources}
    {error ? <p role="alert" className={styles.error}>{error}</p> : null}
    <div className={styles.actions}>
      <Button variant="outline" disabled={busy || disabled} onClick={() => void decide({ action: "reject" })}>거절</Button>
      <Button className={styles.approve} disabled={busy || disabled || !ready} onClick={() => void decide({ action: "approve", title: title.trim(), bodyMd: bodyMd.trim(), categoryId })}>승인하고 저장</Button>
    </div>
  </section>;
}
