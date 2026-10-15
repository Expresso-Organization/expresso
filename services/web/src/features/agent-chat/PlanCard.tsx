"use client";
import { useCallback, useEffect, useState } from "react";
import { PreparationPlanResponseSchema, type PreparationPlan, type PreparationTask } from "@expresso/contracts";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { byWeek, settingsLine, TASK_KIND } from "./PlanDraftCard";
import chat from "./AgentChat.module.css";
import styles from "./PlanCards.module.css";

const STATUS = { not_started: "시작 전", in_progress: "진행 중", completed: "완료", blocked: "막힘" } as const;
const STATUS_ICON = { not_started: "circle", in_progress: "circle-half", completed: "check-circle", blocked: "prohibit" } as const;

/** 오늘이 든 주. 시작 전이거나 끝난 뒤면 끝나지 않은 작업이 있는 첫 주. */
function currentWeek(tasks: readonly PreparationTask[]) {
  const today = new Date().toLocaleDateString("sv-SE");
  const week = tasks.find(task => {
    const end = new Date(`${task.date}T00:00:00Z`); end.setUTCDate(end.getUTCDate() + 7);
    return task.date <= today && today < end.toISOString().slice(0, 10);
  })?.week;
  return week ?? tasks.find(task => task.status !== "completed")?.week ?? 1;
}

/**
 * 승인한 준비 계획. 진행은 대화가 아니라 계획에 쌓이므로 카드가 열릴 때(그리고 대화가 바뀔 때)
 * 계획을 불러온다. 작업을 누르면 대화상자에서 상태 · 결과 · 메모 · 사용 시간을 남긴다.
 */
export function PlanCard({ planId, refreshKey }: { planId: string; refreshKey: number | undefined }) {
  const [plan, setPlan] = useState<PreparationPlan | null>(null);
  const [failed, setFailed] = useState(false);
  const [openWeek, setOpenWeek] = useState<number | null>(null);
  const [editing, setEditing] = useState<PreparationTask | null>(null);
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(`/api/agent/plans/${planId}`, { cache: "no-store", ...(signal ? { signal } : {}) });
      if (!response.ok) throw new Error("plan");
      const next = PreparationPlanResponseSchema.parse(await response.json()).data;
      setPlan(next); setFailed(false);
      setOpenWeek(current => current ?? currentWeek(next.tasks));
    } catch { if (!signal?.aborted) setFailed(true); }
  }, [planId]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load, refreshKey]);
  if (!plan) return <section className={styles.card} aria-label="준비 계획">
    <header className={styles.head}><Icon name="calendar-check" size={15} /><span>준비 계획</span></header>
    {failed ? <p role="alert" className={styles.error}>계획을 불러오지 못했습니다. <Button variant="link" onClick={() => void load()}>다시 시도</Button></p> : <p role="status" className={styles.muted}>계획을 불러오는 중…</p>}
  </section>;
  const done = plan.tasks.filter(task => task.status === "completed").length;
  return <section className={styles.card} aria-label="준비 계획">
    <header className={styles.head}><Icon name="calendar-check" size={15} /><span>준비 계획</span><span className={styles.progress}>{done}/{plan.tasks.length} 완료</span></header>
    <strong className={styles.planTitle}>{plan.title}</strong>
    <div className={styles.bar} aria-hidden="true"><span style={{ width: `${Math.round((done / plan.tasks.length) * 100)}%` }} /></div>
    <p className={styles.muted}>{settingsLine(plan.settings)}</p>
    <ol className={styles.weeks}>{byWeek(plan.tasks).map(([week, group]) => {
      const left = group.tasks.filter(task => task.status !== "completed").length;
      return <li key={week}>
        <button type="button" className={`${styles.weekToggle} ${styles.weekLabel}`} aria-expanded={openWeek === week} onClick={() => setOpenWeek(openWeek === week ? null : week)}>
          <span>{week}주 · {group.date}</span><span>{left ? `남은 작업 ${left}` : "모두 완료"} <Icon name={openWeek === week ? "caret-up" : "caret-down"} size={11} /></span>
        </button>
        {openWeek === week ? <ul>{group.tasks.map(task => <li key={task.id}>
          <button type="button" className={styles.taskButton} data-status={task.status} onClick={() => setEditing(task)} aria-label={`${task.title} · ${STATUS[task.status]}`}>
            <Icon name={STATUS_ICON[task.status]} weight={task.status === "completed" ? "fill" : "regular"} size={14} className={styles[`status-${task.status}`]} />
            <span className={styles.taskTitle}>{task.title}</span>
            <span className={styles.minutes}>{task.minutes}분</span>
          </button>
        </li>)}</ul> : null}
      </li>;
    })}</ol>
    {editing ? <TaskProgressDialog plan={plan} task={editing} onClose={() => setEditing(null)} onSaved={next => { setPlan(next); setEditing(null); }} onConflict={() => void load()} /> : null}
  </section>;
}

function TaskProgressDialog({ plan, task, onClose, onSaved, onConflict }: { plan: PreparationPlan; task: PreparationTask; onClose(): void; onSaved(plan: PreparationPlan): void; onConflict(): void }) {
  const [status, setStatus] = useState(task.status);
  const [outcome, setOutcome] = useState(task.outcome);
  const [outcomeUrl, setOutcomeUrl] = useState(task.outcomeUrl);
  const [note, setNote] = useState(task.note);
  const [spentMinutes, setSpentMinutes] = useState(String(task.spentMinutes));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/agent/plans/${plan.id}/tasks/${task.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, cache: "no-store", body: JSON.stringify({ expectedVersion: plan.version, status, outcome, outcomeUrl: outcomeUrl.trim(), note, spentMinutes: Number(spentMinutes) || 0 }) });
      const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
      if (response.status === 409) { onConflict(); throw new Error(payload?.error?.message ?? "다른 화면에서 먼저 고쳤습니다."); }
      if (!response.ok) throw new Error(payload?.error?.message ?? "저장하지 못했습니다.");
      onSaved(PreparationPlanResponseSchema.parse(payload).data);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "저장하지 못했습니다."); } finally { setBusy(false); }
  };
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className={`acf-scope ${chat.resourceDialog}`} showCloseButton={false}>
    <DialogHeader className={chat.previewHeader}><div><DialogDescription>{task.week}주 · {task.date} · {TASK_KIND[task.kind]} · {task.minutes}분</DialogDescription><DialogTitle>{task.title}</DialogTitle></div><Button variant="ghost" size="icon" aria-label="닫기" onClick={onClose}><Icon name="x" size={18} /></Button></DialogHeader>
    <div className={chat.previewBody}><div className={styles.editList}>
      <p className={styles.muted}>{task.action}</p>
      <p className={styles.muted}>결과물: {task.deliverable}</p>
      <label className={styles.field}><span>상태</span><select value={status} onChange={event => setStatus(event.target.value as PreparationTask["status"])}>{Object.entries(STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className={styles.field}><span>결과 {status === "completed" ? "(완료하려면 결과나 링크가 필요합니다)" : ""}</span><Textarea className={styles.text} value={outcome} maxLength={2_000} rows={3} onChange={event => setOutcome(event.target.value)} /></label>
      <label className={styles.field}><span>결과 링크</span><input value={outcomeUrl} maxLength={2_048} placeholder="https://" onChange={event => setOutcomeUrl(event.target.value)} /></label>
      <label className={styles.field}><span>메모</span><Textarea className={styles.text} value={note} maxLength={2_000} rows={2} onChange={event => setNote(event.target.value)} /></label>
      <label className={styles.field}><span>사용한 시간(분)</span><input type="number" min={0} max={100_000} value={spentMinutes} onChange={event => setSpentMinutes(event.target.value)} /></label>
      {error ? <p role="alert" className={styles.error}>{error}</p> : null}
    </div></div>
    <DialogFooter className={chat.previewFooter}><span>진행 기록은 AI 없이 저장됩니다.</span><Button className={styles.dialogSave} disabled={busy} onClick={() => void save()}>저장</Button></DialogFooter>
  </DialogContent></Dialog>;
}
