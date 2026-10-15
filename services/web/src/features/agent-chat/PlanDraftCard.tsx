"use client";
import { useState } from "react";
import type { AgentPlanDecision, AgentPlanDraft, PreparationTaskDraft } from "@expresso/contracts";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import chat from "./AgentChat.module.css";
import styles from "./PlanCards.module.css";

export const TASK_KIND = { confirm: "확인", learn: "학습", project: "실습", check: "점검", portfolio: "포트폴리오" } as const;
export const settingsLine = (settings: AgentPlanDraft["settings"]) => `주 ${settings.weeklyHours}시간 · ${settings.weeks}주 · ${settings.startDate}부터`;
/**
 * 작업을 그 주의 시작일로 묶는다. 같은 주 안의 순서는 배치 순서 그대로다.
 *
 * 주 번호로 묶지 않는다 — 재배치하면 남은 작업의 주 번호가 새 시작일부터 다시 1이 되어, 이미
 * 끝낸 작업의 1주와 겹친다. 날짜는 겹치지 않는다.
 */
export function byWeek<T extends { date: string }>(tasks: readonly T[]) {
  const weeks = new Map<string, T[]>();
  for (const task of tasks) weeks.set(task.date, [...(weeks.get(task.date) ?? []), task]);
  return [...weeks].sort(([a], [b]) => a.localeCompare(b));
}

/**
 * 준비 계획 초안. 승인 전에는 계획 제목 · 요약과 작업 문구를 고칠 수 있다 — 작업이 많아 카드에는
 * 주차별 제목만 두고, 문구 편집은 대화상자에서 한다. 일정과 시간은 서버의 규칙이 정한다.
 */
export function PlanDraftCard({ draft, disabled, onDecide }: { draft: AgentPlanDraft; disabled: boolean; onDecide(decision: AgentPlanDecision): Promise<void> }) {
  const [title, setTitle] = useState(draft.title);
  const [summary, setSummary] = useState(draft.summary);
  const [tasks, setTasks] = useState<PreparationTaskDraft[]>(draft.tasks);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const decide = async (decision: AgentPlanDecision) => {
    setBusy(true); setError(null);
    try { await onDecide(decision); } catch (cause) { setError(cause instanceof Error ? cause.message : "처리하지 못했습니다."); } finally { setBusy(false); }
  };
  const patch = (id: string, field: "title" | "action" | "deliverable", value: string) => setTasks(current => current.map(task => task.id === id ? { ...task, [field]: value } : task));
  if (draft.status === "rejected") return <section className={styles.card} aria-label="준비 계획 초안">
    <header className={styles.head}><Icon name="calendar-check" size={15} /><span>준비 계획 초안</span></header>
    <strong className={styles.planTitle}>{draft.title}</strong>
    <p className={styles.muted}><Icon name="x-circle" size={13} />계획 초안을 거절했습니다.</p>
  </section>;
  const ready = !!title.trim() && !!summary.trim() && tasks.every(task => task.title.trim() && task.action.trim() && task.deliverable.trim());
  return <section className={styles.card} aria-label="준비 계획 초안">
    <header className={styles.head}><Icon name="calendar-check" size={15} /><span>준비 계획 초안</span></header>
    <p className={styles.muted}>{settingsLine(draft.settings)} · 작업 {draft.tasks.length}개</p>
    <label className={styles.field}><span>계획 이름</span><input value={title} maxLength={300} onChange={event => setTitle(event.target.value)} disabled={busy || disabled} /></label>
    <label className={styles.field}><span>요약</span><Textarea className={styles.text} value={summary} maxLength={2_000} rows={3} onChange={event => setSummary(event.target.value)} disabled={busy || disabled} /></label>
    <ol className={styles.weeks}>{byWeek(tasks).map(([date, group]) => <li key={date}>
      <span className={styles.weekLabel}>{date} 주</span>
      <ul>{group.map(task => <li key={task.id} className={styles.taskRow}><span className={styles.kind}>{TASK_KIND[task.kind]}</span><span className={styles.taskTitle}>{task.title}</span><span className={styles.minutes}>{task.minutes}분</span></li>)}</ul>
    </li>)}</ol>
    <Button variant="ghost" className={styles.editTasks} disabled={busy || disabled} onClick={() => setEditing(true)}><Icon name="pencil-simple" size={13} />작업 문구 고치기</Button>
    {error ? <p role="alert" className={styles.error}>{error}</p> : null}
    <div className={styles.actions}>
      <Button variant="outline" disabled={busy || disabled} onClick={() => void decide({ action: "reject" })}>거절</Button>
      <Button className={styles.approve} disabled={busy || disabled || !ready} onClick={() => void decide({ action: "approve", title: title.trim(), summary: summary.trim(), taskEdits: tasks.map(task => ({ id: task.id, title: task.title.trim(), action: task.action.trim(), deliverable: task.deliverable.trim() })) })}>승인하고 저장</Button>
    </div>
    {editing ? <Dialog open onOpenChange={open => { if (!open) setEditing(false); }}><DialogContent className={`acf-scope ${chat.resourceDialog}`} showCloseButton={false}>
      <DialogHeader className={chat.previewHeader}><div><DialogDescription>{settingsLine(draft.settings)}</DialogDescription><DialogTitle>작업 문구 고치기</DialogTitle></div><Button variant="ghost" size="icon" aria-label="닫기" onClick={() => setEditing(false)}><Icon name="x" size={18} /></Button></DialogHeader>
      <div className={chat.previewBody}><ol className={styles.editList}>{tasks.map(task => <li key={task.id}>
        <span className={styles.weekLabel}>{task.date} 주 · {TASK_KIND[task.kind]} · {task.minutes}분</span>
        <label className={styles.field}><span>작업</span><input value={task.title} maxLength={300} onChange={event => patch(task.id, "title", event.target.value)} /></label>
        <label className={styles.field}><span>할 일</span><Textarea className={styles.text} value={task.action} maxLength={2_000} rows={3} onChange={event => patch(task.id, "action", event.target.value)} /></label>
        <label className={styles.field}><span>결과물</span><Textarea className={styles.text} value={task.deliverable} maxLength={2_000} rows={2} onChange={event => patch(task.id, "deliverable", event.target.value)} /></label>
      </li>)}</ol></div>
      <DialogFooter className={chat.previewFooter}><span>일정과 시간은 바꿀 수 없습니다. 다시 배치하려면 대화에서 요청하세요.</span><Button onClick={() => setEditing(false)}>닫기</Button></DialogFooter>
    </DialogContent></Dialog> : null}
  </section>;
}
