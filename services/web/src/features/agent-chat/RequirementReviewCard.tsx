"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { AgentReviewFreshnessResponseSchema, type RequirementReview } from "@expresso/contracts";
import { Icon } from "@/components/ui/Icon";
import styles from "./RequirementReviewCard.module.css";

/** 공고 상세의 자격 요건 표시와 같은 아이콘 매핑을 쓴다 — 같은 판정이 두 화면에서 같은 모양이다. */
const ASSESSMENT = {
  strong: { icon: "check-circle", weight: "fill" as const, label: "강함", tone: styles.strong },
  partial: { icon: "warning-circle", weight: "fill" as const, label: "일부", tone: styles.partial },
  unconfirmed: { icon: "circle-dashed", weight: "regular" as const, label: "미확인", tone: styles.unconfirmed },
} as const;
const KIND = { must: "자격", nice: "우대", responsibility: "업무" } as const;

/**
 * 요건 대조 카드.
 *
 * 316px 레일에 들어가므로 요건은 한 줄씩 접어 두고, 누르면 인용 · 설명 · 근거 · 보완 제안을
 * 편다. 대조 뒤에 공고나 근거 기록이 바뀌었는지는 카드가 열릴 때 한 번 묻는다.
 */
export function RequirementReviewCard({ conversationId, toolId, review }: { conversationId: string | null; toolId: string; review: RequirementReview }) {
  const [open, setOpen] = useState<number | null>(null);
  const [stale, setStale] = useState(false);
  useEffect(() => {
    if (!conversationId) return;
    const controller = new AbortController();
    void fetch(`/api/agent/conversations/${conversationId}/reviews/${toolId}`, { signal: controller.signal, cache: "no-store" })
      .then(async response => { if (response.ok) setStale(AgentReviewFreshnessResponseSchema.parse(await response.json()).data.stale); })
      .catch(() => undefined);
    return () => controller.abort();
  }, [conversationId, toolId]);
  const counts = (["strong", "partial", "unconfirmed"] as const).map(key => [key, review.items.filter(item => item.assessment === key).length] as const);
  return <section className={styles.card} aria-label="요건 대조">
    <header className={styles.head}>
      <span className={styles.title}><Icon name="list-checks" size={15} />요건 대조</span>
      {stale ? <span className={styles.stale} role="status"><Icon name="arrows-clockwise" size={12} />다시 대조 필요</span> : null}
    </header>
    <p className={styles.summary}>{review.summary}</p>
    <div className={styles.counts}>{counts.map(([key, count]) => <span key={key} className={`${styles.count} ${ASSESSMENT[key].tone}`}><Icon name={ASSESSMENT[key].icon} weight={ASSESSMENT[key].weight} size={12} />{ASSESSMENT[key].label} {count}</span>)}</div>
    <ul className={styles.items}>{review.items.map((item, index) => {
      const state = ASSESSMENT[item.assessment];
      const expanded = open === index;
      return <li key={item.requirement} className={styles.item}>
        <button type="button" className={styles.itemHead} aria-expanded={expanded} onClick={() => setOpen(expanded ? null : index)}>
          <Icon name={state.icon} weight={state.weight} size={15} className={state.tone} />
          <span className={styles.requirement}>{item.requirement}</span>
          <span className={styles.kind}>{KIND[item.kind]}</span>
          <Icon name={expanded ? "caret-up" : "caret-down"} size={12} className={styles.caret} />
        </button>
        {expanded ? <div className={styles.detail}>
          <blockquote className={styles.jobQuote}>{item.jobQuote}</blockquote>
          <p>{item.explanation}</p>
          {item.evidence.map(evidence => <div key={`${evidence.recordId}:${evidence.quote}`} className={styles.evidence}>
            <Link href={`/career/records/${evidence.recordId}` as Route}><Icon name="notebook" size={12} />{evidence.recordTitle}</Link>
            <q>{evidence.quote}</q>
          </div>)}
          {item.recommendation ? <p className={styles.recommendation}><Icon name="arrow-bend-down-right" size={12} />{item.recommendation}</p> : null}
        </div> : null}
      </li>;
    })}</ul>
  </section>;
}
