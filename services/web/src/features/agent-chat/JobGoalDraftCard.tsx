"use client";
import { useState } from "react";
import Link from "next/link";
import type { AgentGoalDraft, AgentGoalDraftDecision } from "@expresso/contracts";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/button";
import { JOB_GOAL_QUESTIONS } from "@/features/job-goal/JobGoalFields";
import styles from "./RecordDraftCard.module.css";

/**
 * 대화에서 바뀐 구직 목표의 변경 카드.
 *
 * 바뀌는 칸만 세우고, 저장 전에는 지금 적힌 글을 새 글 위에 함께 보인다. 저장은 이 카드에서만
 * 일어난다. 저장 · 그대로 두기는 AI를 부르지 않으므로 채팅을 쓸 수 없는 상태에서도 된다.
 */
export function JobGoalDraftCard({ draft, disabled, onDecide }: { draft: AgentGoalDraft; disabled: boolean; onDecide(decision: AgentGoalDraftDecision): Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const decide = async (decision: AgentGoalDraftDecision) => {
    setBusy(true); setError(null);
    try { await onDecide(decision); } catch (cause) { setError(cause instanceof Error ? cause.message : "처리하지 못했습니다."); } finally { setBusy(false); }
  };
  const ready = draft.status === "ready";
  return <section className={styles.card} aria-label="구직 목표 변경">
    <header className={styles.head}><Icon name="target" size={15} /><span>구직 목표 변경</span></header>
    <dl className={styles.changes}>
      {JOB_GOAL_QUESTIONS.map(({ name, label }) => {
        const next = draft[name];
        if (next === null) return null;
        const before = draft.previous?.[name];
        return <div key={name} className={styles.change}>
          <dt>{label}</dt>
          {ready && before ? <dd className={styles.before}><span className="ex-sr-only">지금: </span>{before}</dd> : null}
          <dd>{next}</dd>
        </div>;
      })}
    </dl>
    {draft.status === "approved" ? <p className={styles.done} data-state="approved"><Icon name="check-circle" weight="fill" size={13} />구직 목표에 저장했습니다. <Link href="/goal">목표 보기</Link></p> : null}
    {draft.status === "rejected" ? <p className={styles.done}><Icon name="x-circle" size={13} />목표를 그대로 두었습니다.</p> : null}
    {draft.status === "replaced" ? <p className={styles.done}><Icon name="arrows-clockwise" size={13} />새 제안으로 바뀌었습니다.</p> : null}
    {error ? <p role="alert" className={styles.error}>{error}</p> : null}
    {ready ? <div className={styles.actions}>
      <Button variant="outline" disabled={busy || disabled} onClick={() => void decide({ action: "reject" })}>그대로 두기</Button>
      <Button className={styles.approve} disabled={busy || disabled} onClick={() => void decide({ action: "approve" })}>저장</Button>
    </div> : null}
  </section>;
}
