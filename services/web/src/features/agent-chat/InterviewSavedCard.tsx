"use client";
import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import type { AgentInterviewSaved } from "@expresso/contracts";
import { Icon } from "@/components/ui/Icon";
import styles from "./SavedRecordCard.module.css";

export function InterviewSavedCard({ saved, disabled, onUndo }: { saved: AgentInterviewSaved; disabled: boolean; onUndo(): Promise<void> }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const undo = async () => { setBusy(true); setError(null); try { await onUndo(); } catch (cause) { setError(cause instanceof Error ? cause.message : "되돌리지 못했습니다."); } finally { setBusy(false); } };
  return <section className={styles.card} data-state={saved.state === "undone" ? "undone" : "saved"} aria-label="인터뷰 답변 저장 결과">
    <header className={styles.head}><Icon name="check-circle" size={15} /><span>{saved.state === "undone" ? "기록 반영을 되돌렸습니다" : saved.state === "applied" ? "프로젝트 기록에 반영했습니다" : "인터뷰 답변을 기록으로 저장했습니다"}</span></header>
    <strong className={styles.title}>{saved.targetTitle ?? saved.title}</strong>
    <div className={styles.body}><p>{saved.transcript}</p></div>
    <div className={styles.actions}><Link className={styles.open} href={`/career/records/${saved.recordId}` as Route}>기록 열기</Link>{saved.restoreRevisionId && saved.state !== "undone" ? <button type="button" className={styles.undo} disabled={disabled || busy} onClick={() => void undo()}>{busy ? "되돌리는 중…" : "반영 되돌리기"}</button> : null}</div>
    {error ? <p role="alert" className={styles.error}>{error}</p> : null}
  </section>;
}
