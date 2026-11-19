"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { AgentBrewOpenResponseSchema, AgentBrewStartStateResponseSchema, type AgentBrewStart, type AgentBrewStartState } from "@expresso/contracts";
import { REFRESH_MS } from "@/app/(app)/brew/[brewId]/use-refresh-while";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/button";
import { ANALYSIS_PROGRESS, ANALYSIS_STAGE } from "@/lib/analysis-stage";
import card from "./RecordDraftCard.module.css";
import styles from "./BrewStartCard.module.css";

/** 요건의 대조 결과. 이름과 순서는 공고 분석 화면의 요건 대조와 같다. */
const COVERAGE = [["covered", "기록 있음"], ["partial", "기록 일부"], ["missing", "기록 없음"]] as const;

async function request(path: string, post = false): Promise<unknown> {
  const response = await fetch(`/api/agent/conversations/${path}`, { ...(post ? { method: "POST" } : {}), cache: "no-store" });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error((payload as { error?: { message?: string } } | null)?.error?.message ?? "요청을 처리하지 못했습니다.");
  return payload;
}

/**
 * 대화에서 시작한 포트폴리오 제작의 카드.
 *
 * 대화에는 ID만 있다. 분석의 진행과 결과는 이 카드가 서버에서 읽는다 — 끝나지 않은 동안 제작 흐름의 다른 화면과
 * 같은 주기로 다시 읽고, 대화를 닫았다 다시 열어도 그때의 상태가 보인다. 읽기 · 제작 열기 · 다시 분석은 AI를 부르지 않는다.
 * 분석이 끝나면 「담을 기록 고르기」가 제작을 한 번만 만들고 재료 고르기 화면을 연다.
 *
 * 분석은 워커에서 끝나고 대화는 그것을 모른다. 이 카드가 끝난 것을 처음 보면 `onAnnounce`로 알리고, 서버가 에이전트의
 * 답을 하나 시작해 결과를 말한다. 탭이 닫혀 있던 동안 끝난 분석은 대화를 다시 열 때 알린다. 분석 하나에 알림은 한 번이고
 * 그 판정은 서버가 한다 — 여기서는 답이 도는 동안을 피해 한 번 청할 뿐이다.
 */
export function BrewStartCard({ conversationId, start, disabled, onAnnounce }: { conversationId: string | null; start: AgentBrewStart; disabled: boolean; onAnnounce?(): Promise<void> }) {
  const router = useRouter();
  const [state, setState] = useState<AgentBrewStartState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const path = conversationId ? `${conversationId}/brew-starts/${start.startId}` : null;
  const waiting = !state || state.status === "queued" || state.status === "running";

  useEffect(() => {
    if (!path || !waiting) return;
    let alive = true;
    const read = () => request(path)
      .then(payload => { if (alive) { setState(AgentBrewStartStateResponseSchema.parse(payload).data); setError(null); } })
      // 다시 읽지 못하면 그 사실을 알리고 계속 다시 읽는다. 분석은 서버에서 계속 돈다.
      .catch(() => { if (alive) setError("상태를 다시 읽지 못했습니다. 잠시 뒤 다시 읽습니다."); });
    void read();
    const timer = window.setInterval(() => void read(), REFRESH_MS);
    return () => { alive = false; window.clearInterval(timer); };
  }, [path, waiting]);

  const asked = useRef(false);
  const unannounced = state?.status === "done" && !state.announced;
  useEffect(() => {
    // 답이 도는 동안에는 서버가 받지 않는다. 끝난 뒤에 청한다.
    if (!onAnnounce || !unannounced || disabled || asked.current) return;
    asked.current = true;
    // 알리지 못해도(이번 달 크레딧을 다 썼을 때 등) 카드는 결과를 그대로 보인다.
    void onAnnounce().catch(() => undefined);
  }, [onAnnounce, unannounced, disabled]);

  const act = async (work: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await work(); } catch (cause) { setError(cause instanceof Error ? cause.message : "처리하지 못했습니다."); } finally { setBusy(false); }
  };
  const open = () => act(async () => {
    const { path: next } = AgentBrewOpenResponseSchema.parse(await request(`${path}/open`, true)).data;
    router.push(next as Route);
  });
  const retry = () => act(async () => { setState(AgentBrewStartStateResponseSchema.parse(await request(`${path}/retry`, true)).data); });

  const brewId = state?.brewId ?? start.brewId;
  const counts = state?.requirements;
  return <section className={card.card} aria-label="포트폴리오 제작">
    <header className={card.head}><Icon name="coffee" size={15} /><span>포트폴리오 제작</span></header>
    <Link className={styles.target} href={`/jobs/${start.jobPostingId}` as Route}>
      {start.companyName ? <span>{start.companyName}</span> : null}
      <strong>{start.title}</strong>
    </Link>
    {state && waiting ? <div className={styles.progress} aria-live="polite">
      <div className={styles.track} role="progressbar" aria-label="공고 분석 진행률" aria-valuemin={0} aria-valuemax={100} aria-valuenow={ANALYSIS_PROGRESS[state.stage]}>
        <span className={styles.fill} style={{ width: `${ANALYSIS_PROGRESS[state.stage]}%` }} />
      </div>
      <p className={styles.stage}><span className={styles.spinner} aria-hidden="true" />{ANALYSIS_STAGE[state.stage]}</p>
    </div> : null}
    {counts ? <div className={styles.coverage}>
      {counts.total > 0 ? <div className={styles.bar} role="img" aria-label={`요건 ${counts.total}개 가운데 ${COVERAGE.map(([key, name]) => `${name} ${counts[key]}`).join(", ")}`}>
        {COVERAGE.map(([key]) => (counts[key] > 0 ? <span key={key} data-coverage={key} style={{ flexGrow: counts[key] }} /> : null))}
      </div> : null}
      <dl className={styles.counts}>
        {COVERAGE.map(([key, name]) => <div key={key} data-coverage={key}><dt><i aria-hidden="true" />{name}</dt><dd>{counts[key]}</dd></div>)}
      </dl>
    </div> : null}
    {state?.status === "failed" ? <p className={card.done}><Icon name="warning-circle" size={13} />{state.failure?.retryable ? "공고를 분석하지 못했습니다." : "이 공고는 분석하지 못했습니다."}</p> : null}
    {error ? <p role="alert" className={card.error}>{error}</p> : null}
    {state?.status === "done" ? <div className={card.actions}>
      <Button className={card.approve} disabled={busy || disabled} onClick={() => void open()}>{brewId ? "이어서 만들기" : "담을 기록 고르기"}</Button>
    </div> : null}
    {state?.status === "failed" && state.failure?.retryable ? <div className={card.actions}>
      <Button variant="outline" disabled={busy || disabled} onClick={() => void retry()}>다시 분석</Button>
    </div> : null}
  </section>;
}
