"use client";
import { useState } from "react";
import type { AgentReplanDecision, AgentReplanDraft } from "@expresso/contracts";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/button";
import { byWeek, settingsLine } from "./PlanDraftCard";
import styles from "./PlanCards.module.css";

/** 남은 작업 재배치 초안. 완료한 작업은 그대로 두고 남은 작업의 주차 · 날짜만 바뀐다. */
export function ReplanDraftCard({ draft, disabled, onDecide }: { draft: AgentReplanDraft; disabled: boolean; onDecide(decision: AgentReplanDecision): Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const decide = async (decision: AgentReplanDecision) => {
    setBusy(true); setError(null);
    try { await onDecide(decision); } catch (cause) { setError(cause instanceof Error ? cause.message : "처리하지 못했습니다."); } finally { setBusy(false); }
  };
  return <section className={styles.card} aria-label="계획 재배치 초안">
    <header className={styles.head}><Icon name="arrows-clockwise" size={15} /><span>계획 재배치 초안</span></header>
    <p className={styles.muted}>{settingsLine(draft.settings)} · 남은 작업 {draft.slots.length}개</p>
    <ol className={styles.weeks}>{byWeek(draft.slots).map(([date, group]) => <li key={date}>
      <span className={styles.weekLabel}>{date} 주</span>
      <ul>{group.map(slot => <li key={slot.taskId} className={styles.taskRow}><span className={styles.taskTitle}>{slot.title}</span></li>)}</ul>
    </li>)}</ol>
    {draft.status === "ready" ? <>
      {error ? <p role="alert" className={styles.error}>{error}</p> : null}
      <div className={styles.actions}>
        <Button variant="outline" disabled={busy || disabled} onClick={() => void decide({ action: "reject" })}>거절</Button>
        <Button className={styles.approve} disabled={busy || disabled} onClick={() => void decide({ action: "approve" })}>이대로 다시 배치</Button>
      </div>
    </> : <p className={styles.muted}><Icon name={draft.status === "approved" ? "check-circle" : "x-circle"} size={13} />{draft.status === "approved" ? "계획을 다시 배치했습니다." : "재배치를 거절했습니다."}</p>}
  </section>;
}
