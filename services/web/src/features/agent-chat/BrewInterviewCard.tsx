"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import type { AgentBrewInterview } from "@expresso/contracts";
import { continueToDesignAction } from "@/app/(app)/brew/[brewId]/brew-actions";
import { BeginInterviewButton } from "@/app/(app)/brew/[brewId]/materials/BeginInterviewButton";
import { Skel } from "@/components/shell/Skeleton";
import { Icon } from "@/components/ui/Icon";
import { BrewInterviewCardResponseSchema, type BrewInterviewCardData } from "@/lib/brew-interview-card";
import card from "./RecordDraftCard.module.css";
import rows from "./BrewMaterialsCard.module.css";
import styles from "./BrewInterviewCard.module.css";

async function request(brewId: string): Promise<BrewInterviewCardData> {
  const response = await fetch(`/api/brews/${brewId}/interview`, { cache: "no-store" });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error((payload as { error?: { message?: string } } | null)?.error?.message ?? "AI 대화를 불러오지 못했습니다.");
  return BrewInterviewCardResponseSchema.parse(payload).data;
}

/**
 * 대화의 「AI 대화」 카드.
 *
 * 에이전트가 물을 수 있는 근거(공고 요건 가운데 기록으로 확인되지 않은 것, 수치가 빠진 고른 기록)를 줄 세우고, 답을 저장한 근거에
 * 표시를 붙인다. 질문과 답은 대화가 맡는다 — 이 카드는 어디까지 답했는지와 다음 단계로 가는 길만 둔다. 대화의 판이 바뀔 때마다
 * (`refreshKey`) 다시 읽는다. AI를 부르지 않는다.
 * 「디자인 고르기」는 지금의 AI 대화 화면과 같은 서버 액션이다 — 구성을 맡기고 디자인 화면으로 간다. 답을 하나도 안 해도 누를 수 있다.
 * 제작이 디자인 단계로 넘어가면 답한 근거만 보이고 그 화면으로 가는 링크만 둔다.
 */
export function BrewInterviewCard({ interview: { brewId }, refreshKey }: { interview: AgentBrewInterview; refreshKey?: number | undefined }) {
  const [data, setData] = useState<BrewInterviewCardData | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    request(brewId)
      .then(next => { if (alive) { setData(next); setNotice(null); } })
      .catch(error => { if (alive) setNotice(error instanceof Error ? error.message : "AI 대화를 불러오지 못했습니다."); });
    return () => { alive = false; };
  }, [brewId, refreshKey]);

  return <section className={card.card} aria-label="AI 대화">
    <header className={`${card.head} ${rows.head}`}>
      <Icon name="chat-circle-dots" size={15} /><span>AI 대화</span>
      {data ? <span className={rows.count} aria-live="polite">답한 질문 <strong>{data.answered}</strong> / {data.limit}</span> : null}
    </header>
    {!data && !notice ? <div className={styles.loading} role="status" aria-label="근거를 불러오는 중">{[68, 52, 60].map(width => <Skel key={width} w={`${width}%`} h={14} />)}</div> : null}
    {data && data.bases.length > 0 ? <ul className={rows.rows}>
      {data.bases.map((base, index) => <li key={index}>
        <div className={rows.row} data-selected={base.answered} data-locked="true">
          <Icon name={base.kind === "requirement" ? "target" : "file-text"} size={14} className={styles.kind} />
          <span className={rows.text}><span className={rows.title}>{base.label}</span></span>
          {base.answered ? <Icon name="check-circle" weight="fill" size={15} className={styles.answered} /> : <span />}
        </div>
      </li>)}
    </ul> : null}
    {notice ? <p role="alert" className={card.error}>{notice}</p> : null}
    {data ? <div className={card.actions}>
      {data.resumePath ? <Link className={rows.next} href={data.resumePath as Route}>이어서 만들기</Link> : <form action={continueToDesignAction}>
        <input type="hidden" name="brewId" value={brewId} />
        <BeginInterviewButton className={rows.next} saving={false}>디자인 고르기</BeginInterviewButton>
      </form>}
    </div> : null}
  </section>;
}
