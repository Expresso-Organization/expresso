"use client";
import { useCallback, useEffect, useState } from "react";
import { ConsultantCommitmentResponseSchema, type ConsultantCommitment } from "@expresso/contracts";
import { Icon } from "@/components/ui/Icon";
import styles from "./CommitmentCard.module.css";

/** `YYYY-MM-DD`를 「11월 27일」로. 날짜는 서버가 서울 날짜로 정한 것이라 브라우저의 시간대로 다시 계산하지 않는다. */
export const dayLabel = (day: string) => `${Number(day.slice(5, 7))}월 ${Number(day.slice(8, 10))}일`;
/** 오늘(서울 날짜). 날짜 칸이 지난 날을 고르지 못하게 막는 데 쓴다. */
export const seoulToday = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

const HEAD = {
  open: { icon: "calendar-check", text: "하기로 한 일로 남겼습니다" },
  done: { icon: "check-circle", text: "하기로 한 일을 마쳤습니다" },
  dropped: { icon: "minus-circle", text: "하지 않기로 했습니다" },
} as const;

/**
 * 대화에서 잡은 약속.
 *
 * 약속은 이미 저장됐다 — 카드는 무엇을 언제까지 하기로 했는지 보여 주고, 날짜를 바꾸거나 약속을 거두게 한다.
 * 약속의 상태는 대화가 아니라 약속에 쌓이므로(홈의 확인 카드, 에이전트의 갱신) 카드가 열릴 때와 대화가 바뀔 때 지금 상태를 읽는다.
 * 읽지 못하면 대화에 남은 그때의 약속을 그대로 보인다. 날짜를 바꾸고 거두는 일은 AI를 부르지 않는다.
 */
export function CommitmentCard({ commitment: snapshot, refreshKey }: { commitment: ConsultantCommitment; refreshKey: number | undefined }) {
  const [commitment, setCommitment] = useState(snapshot);
  const [editing, setEditing] = useState(false);
  const [day, setDay] = useState(snapshot.dueOn);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const url = `/api/consultant/commitments/${snapshot.id}`;
  const load = useCallback(async (signal: AbortSignal) => {
    try {
      const response = await fetch(url, { cache: "no-store", signal });
      if (!response.ok) return;
      setCommitment(ConsultantCommitmentResponseSchema.parse(await response.json()).data);
    } catch { /* 그때의 약속을 그대로 둔다. */ }
  }, [url]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load, refreshKey]);
  const change = async (body: { dueOn: string } | { status: "dropped" }) => {
    setBusy(true); setError(null);
    try {
      const response = await fetch(url, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error((payload as { error?: { message?: string } } | null)?.error?.message ?? "저장하지 못했습니다.");
      setCommitment(ConsultantCommitmentResponseSchema.parse(payload).data); setEditing(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "저장하지 못했습니다."); }
    finally { setBusy(false); }
  };
  const head = HEAD[commitment.status];
  return <section className={styles.card} data-state={commitment.status} aria-label="하기로 한 일">
    <header className={styles.head}><Icon name={head.icon} weight={commitment.status === "done" ? "fill" : "regular"} size={15} /><span>{head.text}</span></header>
    <div className={styles.title}><strong>{commitment.title}</strong>{commitment.status === "open" ? <span className={styles.due}>{dayLabel(commitment.dueOn)}까지</span> : null}</div>
    {commitment.detail ? <p className={styles.detail}>{commitment.detail}</p> : null}
    {commitment.status !== "open" ? null : editing
      ? <form className={styles.actions} onSubmit={event => { event.preventDefault(); if (day) void change({ dueOn: day }); }}>
        <input type="date" className={styles.date} aria-label="새 날짜" value={day} min={seoulToday()} disabled={busy} onChange={event => setDay(event.target.value)} />
        <button type="submit" className={styles.primary} disabled={busy || !day || day === commitment.dueOn}>{busy ? "저장 중…" : "이 날짜로"}</button>
        <button type="button" className={styles.secondary} disabled={busy} onClick={() => { setEditing(false); setError(null); }}>취소</button>
      </form>
      : <div className={styles.actions}>
        <button type="button" className={styles.secondary} disabled={busy} onClick={() => { setDay(commitment.dueOn); setEditing(true); }}>날짜 바꾸기</button>
        <button type="button" className={styles.secondary} disabled={busy} onClick={() => void change({ status: "dropped" })}>{busy ? "거두는 중…" : "하지 않기로"}</button>
      </div>}
    {commitment.status === "open" ? <p className={styles.note}>그날 홈에서 어떻게 됐는지 여쭙니다.</p> : null}
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
  </section>;
}

/** 약속을 저장하는 동안의 자리. 저장하지 못했을 때는 아무것도 그리지 않는다(에이전트가 고쳐 다시 저장한다). */
export function CommitmentPending({ failed }: { failed: boolean }) {
  if (failed) return null;
  return <p className={`${styles.pending} ex-anim-shimmer`} role="status">하기로 한 일을 남기고 있습니다.</p>;
}
