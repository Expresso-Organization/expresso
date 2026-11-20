"use client";
import { useState } from "react";
import type { AgentFormPart } from "@expresso/contracts";
import styles from "./FormPart.module.css";

/**
 * 입력 칸 묶음 부품. 에이전트가 짧게 적을 값(기간 · 인원 · 수치)을 한 번에 묻는다.
 *
 * 필수 칸을 채워야 보낼 수 있다. 답한 부품과 지나간 부품(`interactive`가 거짓)은 고칠 수 없다 — 답한 부품은 적은 값을 보인다.
 */
export function FormPart({ part, interactive, onAnswer }: {
  part: AgentFormPart;
  /** 지금 답을 받을 수 있는가. 마지막 답변의 답 없는 부품이고, 실행 중이 아니며, 보낼 수 있는 상태일 때만 참이다. */
  interactive: boolean;
  onAnswer(values: { id: string; text: string }[]): Promise<unknown>;
}) {
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const answered = part.answer ? Object.fromEntries(part.answer.values.map(value => [value.id, value.text])) : null;
  const open = interactive && !answered && !sending;
  const ready = part.fields.every(field => field.optional || !!texts[field.id]?.trim());
  const state = answered ? "answered" : interactive ? "open" : "closed";
  const submit = async () => {
    if (!open || !ready) return;
    setSending(true); setError(null);
    try { await onAnswer(part.fields.map(field => ({ id: field.id, text: texts[field.id]?.trim() ?? "" })).filter(value => value.text)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "답을 보내지 못했습니다."); }
    finally { setSending(false); }
  };
  return <form className={styles.part} data-state={state} aria-label="입력 칸 질문" onSubmit={event => { event.preventDefault(); void submit(); }}>
    <p className={styles.prompt}>{part.prompt}</p>
    <div className={styles.fields}>
      {part.fields.map(field => <label key={field.id} className={styles.field}>
        <span className={styles.label}>{field.label}{field.optional ? <span className={styles.optional}>선택</span> : null}</span>
        <input className={styles.input} value={answered ? answered[field.id] ?? "" : texts[field.id] ?? ""} maxLength={300} placeholder={answered ? "" : field.placeholder ?? ""} disabled={!open} onChange={event => setTexts(current => ({ ...current, [field.id]: event.target.value }))} />
      </label>)}
    </div>
    {answered ? null : <div className={styles.actions}><button type="submit" className={styles.send} disabled={!open || !ready}>{sending ? "보내는 중…" : "보내기"}</button></div>}
    {state === "closed" && !sending ? <p className={styles.note}>지나간 질문입니다.</p> : null}
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
  </form>;
}

/** 입력 칸을 준비하는 동안의 자리. 내지 못했을 때는 아무것도 그리지 않는다. */
export function FormPartPending({ failed }: { failed: boolean }) {
  if (failed) return null;
  return <p className={`${styles.pending} ex-anim-shimmer`} role="status">입력 칸을 준비하고 있습니다.</p>;
}
