"use client";
import { useEffect, useRef, useState } from "react";
import type { PreparationProgress as Progress, PreparationReplan, ProgressTask, UpdateTaskProgress } from "@expresso/contracts";
import { Button } from "@/components/ui/button";
import { createPreparationReplan, decidePreparationReplan, loadPreparationProgress, startPreparationProgress, updatePreparationTask } from "./progress-actions";
import styles from "./PreparationProgress.module.css";
const STATES = { not_started: "시작 전", in_progress: "진행 중", completed: "완료", blocked: "진행 어려움" };
function TaskCard({ task, version, disabled, onSave }: { task: ProgressTask; version: number; disabled: boolean; onSave: (input: UpdateTaskProgress) => Promise<void> }) {
  const [status, setStatus] = useState(task.status), [note, setNote] = useState(task.note), [outcome, setOutcome] = useState(task.outcome), [url, setUrl] = useState(task.outcomeUrl), [spent, setSpent] = useState(task.spentMinutes);
  const retry = useRef<UpdateTaskProgress | null>(null);
  useEffect(() => { retry.current = null; }, [version]);
  function changed() { retry.current = null; }
  return <article className={styles.task}>
    <h4>{task.title}</h4><p>{task.week}주차 · 주 시작일 {task.date} · 예상 배정 {task.minutes}분</p><p>{task.action}</p><p>계획 산출물: {task.deliverable}</p>
    <label>진행 상태<select value={status} disabled={disabled} onChange={(event) => { setStatus(event.target.value as ProgressTask["status"]); changed(); }}>{Object.entries(STATES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    <label>진행 메모<textarea value={note} maxLength={2000} disabled={disabled} onChange={(event) => { setNote(event.target.value); changed(); }} /></label>
    <label>실제 결과·산출물 설명<textarea value={outcome} maxLength={2000} disabled={disabled} onChange={(event) => { setOutcome(event.target.value); changed(); }} /></label>
    <label>산출물 링크(선택)<input type="url" value={url} maxLength={2048} disabled={disabled} onChange={(event) => { setUrl(event.target.value); changed(); }} /></label>
    <label>실제 사용 시간(분)<input type="number" min={0} max={100000} step={1} value={spent} disabled={disabled} onChange={(event) => { setSpent(Number(event.target.value)); changed(); }} /></label>
    <Button disabled={disabled} onClick={() => { const input = retry.current ?? { requestId: crypto.randomUUID(), expectedVersion: version, status, note, outcome, outcomeUrl: url, spentMinutes: spent }; retry.current = input; void onSave(input); }}>진행 기록 저장</Button>
  </article>;
}
export default function PreparationProgress({ conversationId, planId, disabled = false }: { conversationId: string; planId: string; disabled?: boolean }) {
  const [progress, setProgress] = useState<Progress | null>(null); const [replans, setReplans] = useState<PreparationReplan[]>([]);
  const [hours, setHours] = useState(3), [weeks, setWeeks] = useState(4), [date, setDate] = useState(() => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date()));
  const [busy, setBusy] = useState(true), [error, setError] = useState(""); const busyRef = useRef(false);
  const draftRequest = useRef<Parameters<typeof createPreparationReplan>[2] | null>(null);
  useEffect(() => { let cancelled = false; void loadPreparationProgress(conversationId, planId).then((response) => { if (cancelled) return; if (response.ok) { setProgress(response.progress); setReplans(response.replans); } else setError(response.error); }).catch(() => { if (!cancelled) setError("진행 상태를 불러오지 못했습니다."); }).finally(() => { if (!cancelled) setBusy(false); }); return () => { cancelled = true; }; }, [conversationId, planId]);
  async function reload() { const response = await loadPreparationProgress(conversationId, planId); if (response.ok) { setProgress(response.progress); setReplans(response.replans); draftRequest.current = null; } else setError(response.error); }
  async function action(run: () => Promise<void>) { if (busy || disabled || busyRef.current) return; busyRef.current = true; setBusy(true); setError(""); try { await run(); } catch { setError("요청에 실패했습니다. 저장 결과를 불러오세요."); } finally { busyRef.current = false; setBusy(false); } }
  const blocked = busy || disabled; const completed = progress?.tasks.filter((task) => task.status === "completed").length ?? 0; const total = progress?.tasks.length ?? 0;
  return <section className={styles.root} aria-label="준비 계획 진행 추적">
    <h3>진행 기록·재계획</h3><p>작업 완료는 사용자 기록이며 실제 역량 검증이나 경력 승인과 다릅니다. 결과를 Career Record에 자동 저장하지 않습니다.</p>
    <Button variant="outline" disabled={blocked} onClick={() => void action(reload)}>진행·재계획 다시 불러오기</Button>
    {busy ? <p role="status">저장 상태 확인 중…</p> : null}{error ? <p role="alert">{error}</p> : null}
    {!busy && !progress ? <Button disabled={blocked} onClick={() => void action(async () => { const response = await startPreparationProgress(conversationId, planId); if (response.ok) setProgress(response.data); else setError(response.error); })}>이 승인 계획의 진행 관리 시작</Button> : null}
    {progress ? <>
      <p>완료 {completed}/{total} · 작업 개수 기준 진행률 {Math.round(completed / total * 100)}% · 일정 버전 {progress.scheduleVersion}</p>
      {progress.tasks.map((task) => <TaskCard key={`${task.id}:${task.updatedAt}`} task={task} version={progress.version} disabled={blocked} onSave={(input) => action(async () => { const response = await updatePreparationTask(conversationId, planId, task.id, input); if (response.ok) { setProgress(response.data); draftRequest.current = null; } else setError(response.error); })} />)}
      <h4>미완료 작업 재계획</h4><p>완료 작업과 결과는 보존합니다. 새 시간·기간으로 미완료 작업의 일정만 바꾸며, 승인 전에는 현재 일정이 유지됩니다.</p>
      <div className={styles.settings}>
        <label>새 주당 가용 시간<input type="number" min={1} max={40} step={1} value={hours} disabled={blocked} onChange={(event) => { setHours(Number(event.target.value)); draftRequest.current = null; }} /></label>
        <label>새 기간(주)<input type="number" min={1} max={12} step={1} value={weeks} disabled={blocked} onChange={(event) => { setWeeks(Number(event.target.value)); draftRequest.current = null; }} /></label>
        <label>새 시작일<input type="date" value={date} disabled={blocked} onChange={(event) => { setDate(event.target.value); draftRequest.current = null; }} /></label>
      </div>
      <Button disabled={blocked || completed === total} onClick={() => void action(async () => { const input = draftRequest.current ?? { requestId: crypto.randomUUID(), expectedVersion: progress.version, settings: { weeklyHours: hours, weeks, startDate: date } }; draftRequest.current = input; const response = await createPreparationReplan(conversationId, planId, input); if (response.ok) { setReplans((items) => [response.data, ...items.filter((item) => item.id !== response.data.id)].slice(0, 50)); draftRequest.current = null; } else setError(response.error); })}>재계획 초안 만들기</Button>
      {replans.map((draft) => <article className={styles.task} key={draft.id}>
        <h4>재계획 후보 · {draft.status === "draft" ? "승인 대기" : draft.status === "approved" ? "승인 완료" : "거절"}</h4>
        <p>주당 {draft.settings.weeklyHours}시간 · {draft.settings.weeks}주 · 시작일 {draft.settings.startDate}</p>
        {draft.slots.map((slot) => <p key={slot.taskId}>{progress.tasks.find((task) => task.id === slot.taskId)?.title ?? "작업"} — {slot.week}주차 · 주 시작일 {slot.date} · {slot.minutes}분</p>)}
        {draft.status === "draft" ? <div className={styles.actions}>
          <Button disabled={blocked || draft.baseProgressVersion !== progress.version} onClick={() => void action(async () => { const response = await decidePreparationReplan(conversationId, planId, draft.id, draft.version, "approve"); if (response.ok) await reload(); else setError(response.error); })}>재계획 승인·적용</Button>
          <Button variant="outline" disabled={blocked} onClick={() => void action(async () => { const response = await decidePreparationReplan(conversationId, planId, draft.id, draft.version, "reject"); if (response.ok) await reload(); else setError(response.error); })}>거절</Button>
        </div> : null}
        {draft.status === "draft" && draft.baseProgressVersion !== progress.version ? <p>초안 생성 후 진행이 바뀌었습니다. 새 재계획 후보를 만드세요.</p> : null}
      </article>)}
      <details><summary>이전 일정 이력 ({progress.history.length})</summary>{progress.history.map((revision) => <div key={revision.scheduleVersion}><h4>일정 버전 {revision.scheduleVersion}</h4><p>{revision.settings.startDate}부터 {revision.settings.weeks}주 · 주당 {revision.settings.weeklyHours}시간</p>{revision.slots.map((slot) => <p key={slot.taskId}>{progress.tasks.find((task) => task.id === slot.taskId)?.title ?? "작업"} — {slot.week}주차 · {slot.date}</p>)}</div>)}</details>
    </> : null}
  </section>;
}
