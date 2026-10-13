"use client";
import { useEffect, useRef, useState } from "react";
import type { CareerGapResult, CreatePreparation, PreparationPlan as Plan } from "@expresso/contracts";
import { Button } from "@/components/ui/button";
import { loadCareerGap } from "./gap-actions";
import { approvePreparationPlan, createPreparationPlan, loadPreparationPlans, rejectPreparationPlan } from "./preparation-actions";
import styles from "./PreparationPlan.module.css";
import PreparationProgress from "./PreparationProgress";

const KINDS = { confirm: "경험·조건 확인", learn: "학습 착수", project: "작은 실습", check: "검증·정리", portfolio: "포트폴리오 초안" };
function PlanCard({ plan, disabled, outdated, onApprove, onReject }: { plan: Plan; disabled: boolean; outdated: boolean; onApprove: (input: Parameters<typeof approvePreparationPlan>[2]) => Promise<void>; onReject: () => Promise<void> }) {
  const [title, setTitle] = useState(plan.title); const [summary, setSummary] = useState(plan.summary); const [tasks, setTasks] = useState(plan.tasks);
  const draft = plan.status === "draft";
  return <article className={styles.card}>
    <h3>{plan.title}</h3><p>상태: {draft ? "승인 대기" : plan.status === "approved" ? "승인 완료" : "거절"}</p>
    <p>{plan.settings.weeks}주 · 주당 {plan.settings.weeklyHours}시간 · 배정 {plan.totalMinutes}분</p>
    {outdated ? <p>이 후보의 근거가 최신 P6와 다릅니다. 새 계획을 만드세요.</p> : null}
    {draft ? <><label>제목<input value={title} disabled={disabled} maxLength={300} onChange={(event) => setTitle(event.target.value)} /></label><label>계획 설명<textarea value={summary} disabled={disabled} maxLength={2000} onChange={(event) => setSummary(event.target.value)} /></label></> : <p>{plan.summary}</p>}
    {tasks.map((task, index) => <div className={styles.task} key={task.id}>
      <h4>{task.week}주차 · 주 시작일 {task.date} · {task.minutes}분 · {KINDS[task.kind]}</h4>
      <p>연결 요건: {task.requirement}</p>
      {draft ? <>
        <label>작업 제목<input value={task.title} disabled={disabled} maxLength={300} onChange={(event) => setTasks((items) => items.map((item, at) => at === index ? { ...item, title: event.target.value } : item))} /></label>
        <label>할 일<textarea value={task.action} disabled={disabled} maxLength={2000} onChange={(event) => setTasks((items) => items.map((item, at) => at === index ? { ...item, action: event.target.value } : item))} /></label>
        <label>확인할 산출물<textarea value={task.deliverable} disabled={disabled} maxLength={2000} onChange={(event) => setTasks((items) => items.map((item, at) => at === index ? { ...item, deliverable: event.target.value } : item))} /></label>
      </> : <><p>{task.title}</p><p>{task.action}</p><p>산출물: {task.deliverable}</p></>}
    </div>)}
    {draft ? <div className={styles.actions}>
      <Button disabled={disabled || outdated} onClick={() => void onApprove({ expectedVersion: plan.version, title, summary, taskEdits: tasks.map(({ id, title, action, deliverable }) => ({ id, title, action, deliverable })) })}>수정한 계획 승인·저장</Button>
      <Button variant="outline" disabled={disabled} onClick={() => void onReject()}>거절</Button>
    </div> : null}
    {plan.status === "approved" ? (
      <>
        <p>
          위 P7 작업 목록은 승인 당시 계획입니다.
          현재 일정과 진행 상태는 아래 진행 기록에서 확인하세요.
        </p>
        <PreparationProgress
          key={`progress:${plan.id}`}
          conversationId={plan.conversationId}
          planId={plan.id}
          disabled={disabled}
        />
      </>
    ) : null}
  </article>;
}
export default function PreparationPlan({ conversationId, disabled = false }: { conversationId: string; disabled?: boolean }) {
  const [gap, setGap] = useState<CareerGapResult | null>(null); const [stale, setStale] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]); const [selected, setSelected] = useState<string[]>([]);
  const [hours, setHours] = useState(3); const [weeks, setWeeks] = useState(4);
  const [startDate, setStartDate] = useState(() => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date()));
  const [busy, setBusy] = useState(true); const [error, setError] = useState(""); const [retry, setRetry] = useState<CreatePreparation | null>(null); const busyRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    void Promise.all([loadCareerGap(conversationId), loadPreparationPlans(conversationId)]).then(([g, p]) => {
      if (cancelled) return;
      if (g.ok) { setGap(g.data); setStale(g.stale); } else setError(g.error);
      if (p.ok) setPlans(p.data); else setError(p.error);
    }).catch(() => { if (!cancelled) setError("계획 입력과 목록을 불러오지 못했습니다."); }).finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [conversationId]);
  async function action(run: () => Promise<void>) {
    if (busy || disabled || busyRef.current) return;
    busyRef.current = true; setBusy(true); setError("");
    try { await run(); } catch { setError("요청에 실패했습니다. 후보 목록을 확인하세요."); } finally { busyRef.current = false; setBusy(false); }
  }
  function replace(plan: Plan) { setPlans((items) => [plan, ...items.filter((item) => item.id !== plan.id)].slice(0, 50)); }
  async function create(input: CreatePreparation) { setRetry(input); const response = await createPreparationPlan(conversationId, input); if (response.ok) { replace(response.data); setRetry(null); } else setError(response.error); }
  const blocked = busy || disabled;
  return <section className={styles.root} aria-label="맞춤 취업 준비 계획">
    <h2>맞춤 취업 준비 계획</h2><p>P6 제안을 재사용해 가용 시간 안에 준비 착수 작업을 배정합니다. 미확인 경험은 확인부터 진행하며, 완료 여부·진행률 기록은 P8에서 연결합니다.</p>
    <Button variant="outline" disabled={blocked} onClick={() => void action(async () => {
      const [g, p] = await Promise.all([loadCareerGap(conversationId), loadPreparationPlans(conversationId)]);
      if (g.ok) { setGap(g.data); setStale(g.stale); setSelected([]); setRetry(null); } else setError(g.error);
      if (p.ok) setPlans(p.data); else setError(p.error);
    })}>최신 Gap·계획 목록 불러오기</Button>
    {busy ? <p role="status">확인 중…</p> : null}{error ? <p role="alert">{error}</p> : null}
    {!gap ? <p>P6 Gap 분석을 먼저 완료해 주세요.</p> : stale ? <p>분석 입력이 변경됐습니다. P3/P6를 갱신한 뒤 최신 Gap을 불러오세요.</p> : <>
      <p>준비할 항목 선택 ({selected.length}/10)</p>
      {gap.items.map((item) => <label className={styles.choice} key={item.id}><input type="checkbox" checked={selected.includes(item.id)} disabled={blocked || (!selected.includes(item.id) && selected.length >= 10)} onChange={() => { setSelected((ids) => ids.includes(item.id) ? ids.filter((id) => id !== item.id) : [...ids, item.id]); setRetry(null); }} /><span>{item.requirement} — {item.status === "needs_confirmation" ? "확인부터" : "보완 준비"}</span></label>)}
      {!gap.items.length ? <p>선택할 Gap이 없습니다. 계획을 억지로 만들지 않습니다.</p> : null}
      <div className={styles.settings}>
        <label>주당 가용 시간<input type="number" min={1} max={40} step={1} value={hours} disabled={blocked} onChange={(event) => { setHours(Number(event.target.value)); setRetry(null); }} /></label>
        <label>계획 기간(주)<input type="number" min={1} max={12} step={1} value={weeks} disabled={blocked} onChange={(event) => { setWeeks(Number(event.target.value)); setRetry(null); }} /></label>
        <label>시작일<input type="date" value={startDate} disabled={blocked} onChange={(event) => { setStartDate(event.target.value); setRetry(null); }} /></label>
      </div>
      <div className={styles.actions}><Button disabled={blocked || !selected.length} onClick={() => void action(() => create({ requestId: crypto.randomUUID(), gapResultId: gap.id, gapIds: selected, settings: { weeklyHours: hours, weeks, startDate } }))}>준비 계획 초안 만들기</Button>
      {retry ? <Button variant="outline" disabled={blocked} onClick={() => void action(() => create(retry))}>같은 요청 재시도</Button> : null}</div>
    </>}
    <p>초안은 후보로 저장됩니다. 승인해야 확정 계획이 됩니다. 외부 캘린더 등록이나 실제 경력 변경은 하지 않습니다.</p>
    {plans.map((plan) => <PlanCard key={`${plan.id}:${plan.version}`} plan={plan} disabled={blocked} outdated={stale || plan.gapResultId !== gap?.id} onApprove={(input) => action(async () => { const response = await approvePreparationPlan(conversationId, plan.id, input); if (response.ok) replace(response.data); else setError(response.error); })} onReject={() => action(async () => { const response = await rejectPreparationPlan(conversationId, plan.id, plan.version); if (response.ok) replace(response.data); else setError(response.error); })} />)}
  </section>;
}
