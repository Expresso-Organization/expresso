"use client";
import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { GENERATION_CANCELLED, type AgentBrewGeneration } from "@expresso/contracts";
import { GenerationWait } from "@/app/(app)/brew/[brewId]/design/GenerationWait";
import { brewingLeftMs, waitedMs } from "@/app/(app)/brew/[brewId]/design/wait-timing";
import { Icon } from "@/components/ui/Icon";
import { showToast } from "@/components/ui/toast";
import chatStyles from "./AgentChat.module.css";
import styles from "./BrewGenerationCard.module.css";
import { useDesignBrew } from "./design-brews";

/**
 * 대화의 「생성」 카드.
 *
 * 고른 첫 화면으로 맡긴 생성 하나의 진행을 보인다. 지면이 서기 전에는 지금의 생성 화면과 같은 기다림 그림(`GenerationWait` — 고른 기록이
 * 잔으로 내려가는 브루잉, 오래 걸리면 입력 묶음)을 그대로 쓴다. 지면이 서면 지면은 가운데 무대로 가고 카드에는 한 줄과 할 수 있는 일만 남는다.
 * 끝나면 「다듬기에서 열기」, 멈췄거나 실패하면 사유와 「다시 만들기」다.
 *
 * 테두리 상자를 두지 않는다 — 기다림 그림이 제 지면과 카드를 가진다(카드 안에 카드를 두지 않는다). 제목은 작업 흔적 줄(「생성」)이 맡는다.
 */
export function BrewGenerationCard({ generation: { brewId, generationId } }: { generation: AgentBrewGeneration }) {
  const brew = useDesignBrew(brewId);
  const [remaking, setRemaking] = useState(false);
  const data = brew?.generation;
  const job = data?.generation;
  if (!brew || !data || !job) return <section className={styles.card} aria-label="생성" />;
  // 이 카드의 생성이 지난 것이면(다시 만들었다) 결과만 짧게 둔다.
  if (job.id !== generationId) return <section className={styles.card} aria-label="생성"><p className={styles.line}>이전에 맡긴 생성입니다.</p></section>;
  const running = job.status === "queued" || job.status === "running";
  const remake = async () => { setRemaking(true); const failed = await brew.remake(); setRemaking(false); if (failed) showToast(failed, "danger"); };
  const stop = <button type="button" className={styles.ghost} onClick={brew.cancel}>생성 멈추기</button>;

  return <section className={styles.card} aria-label="생성">
    {running && !brew.live ? (brew.reading ? <div className={styles.wait}>
      <GenerationWait reading={brew.reading} brewingLeftMs={brewingLeftMs(job.createdAt, brew.loadedAt)} waitedMs={waitedMs(job.createdAt, brew.loadedAt)} recipePending={data.recipePending} actions={stop} />
    </div> : <p className={styles.line}><span className={chatStyles.working}>만들기를 맡기는 중</span></p>) : null}
    {running && brew.live ? <>
      <p className={styles.line}><span className={chatStyles.working}>{brew.stageable && brew.staged ? "가운데에 지면을 쓰는 중" : "지면을 쓰는 중"}</span></p>
      <div className={styles.actions}>
        {brew.stageable ? <button type="button" className={styles.ghost} onClick={brew.toggleStage}><Icon name={brew.staged ? "arrows-in-simple" : "arrows-out-simple"} size={13} />{brew.staged ? "지면 닫기" : "지면 보기"}</button> : null}
        {stop}
      </div>
    </> : null}
    {job.status === "done" ? <div className={styles.actions}>
      {brew.stageable && brew.live ? <button type="button" className={styles.ghost} onClick={brew.toggleStage}><Icon name={brew.staged ? "arrows-in-simple" : "arrows-out-simple"} size={13} />{brew.staged ? "지면 닫기" : "지면 보기"}</button> : null}
      {job.portfolioId ? <Link className={styles.primary} href={`/edit/${job.portfolioId}` as Route}>다듬기에서 열기</Link> : <span className={chatStyles.working}>마무리하는 중</span>}
    </div> : null}
    {job.status === "failed" ? <>
      <p className={styles.line} role={job.failureCode === GENERATION_CANCELLED ? "status" : "alert"}>{job.failureCode === GENERATION_CANCELLED ? "생성을 멈췄습니다. 크레딧은 차감하지 않았습니다." : `만들지 못했습니다${job.failureCode ? `(${job.failureCode})` : ""}. 다시 만들 수 있습니다.`}</p>
      <div className={styles.actions}><button type="button" className={styles.primary} disabled={remaking} onClick={() => void remake()}>다시 만들기</button></div>
    </> : null}
  </section>;
}
