"use client";
import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import type { GapReview } from "@expresso/contracts";
import { Icon } from "@/components/ui/Icon";
import styles from "./ToolCard.module.css";
import { useToolFreshness } from "./useToolFreshness";

const STATUS = { needs_confirmation: "확인 필요", needs_improvement: "보완 필요" } as const;
const TYPE = { evidence: "근거", experience: "경험", skill: "기술", qualification: "자격", portfolio: "포트폴리오" } as const;
const PRIORITY = { high: 0, medium: 1, low: 2 } as const;
const PRIORITY_LABEL = { high: "먼저", medium: "다음", low: "나중" } as const;

/**
 * 보완점 정리 카드. 준비할 순서(우선순위)대로 한 줄씩 접어 두고, 누르면 설명 · 근거 · 다음
 * 행동을 편다. 정리 뒤에 공고나 근거 기록이 바뀌었으면 요건 대조 카드와 같은 표시를 단다.
 */
export function GapReviewCard({ conversationId, toolId, gapReview }: { conversationId: string | null; toolId: string; gapReview: GapReview }) {
  const [open, setOpen] = useState<string | null>(null);
  const stale = useToolFreshness(conversationId, toolId);
  const items = gapReview.items.map((item, index) => ({ item, index })).sort((a, b) => PRIORITY[a.item.priority] - PRIORITY[b.item.priority] || a.index - b.index);
  const confirm = gapReview.items.filter(item => item.status === "needs_confirmation").length;
  return <section className={styles.card} aria-label="보완점 정리">
    <header className={styles.head}>
      <span className={styles.title}><Icon name="list-magnifying-glass" size={15} />보완점 정리</span>
      {stale ? <span className={styles.stale} role="status"><Icon name="arrows-clockwise" size={12} />다시 대조 필요</span> : null}
    </header>
    <p className={styles.summary}>{gapReview.summary}</p>
    <div className={styles.counts}>
      <span className={`${styles.count} ${styles.partial}`}>확인 필요 {confirm}</span>
      <span className={`${styles.count} ${styles.unconfirmed}`}>보완 필요 {gapReview.items.length - confirm}</span>
    </div>
    <ul className={styles.items}>{items.map(({ item }) => {
      const expanded = open === item.id;
      return <li key={item.id} className={styles.item}>
        <button type="button" className={styles.itemHead} aria-expanded={expanded} onClick={() => setOpen(expanded ? null : item.id)}>
          <span className={styles.priority} data-priority={item.priority} title={PRIORITY_LABEL[item.priority]} />
          <span className={styles.requirement}>{item.requirement}</span>
          <span className={styles.kind}>{TYPE[item.type]}</span>
          <span className={styles.status} data-status={item.status}>{STATUS[item.status]}</span>
        </button>
        {expanded ? <div className={styles.detail}>
          <p>{item.explanation}</p>
          {item.evidence.map(evidence => <div key={`${evidence.sourceId}:${evidence.quote}`} className={styles.evidence}>
            {evidence.sourceType === "record" ? <Link href={`/career/records/${evidence.sourceId}` as Route}><Icon name="notebook" size={12} />{evidence.label}</Link> : <span className={styles.kind}>{evidence.label}</span>}
            <q>{evidence.quote}</q>
          </div>)}
          <p className={styles.recommendation}><Icon name="arrow-bend-down-right" size={12} />{item.suggestedAction}</p>
        </div> : null}
      </li>;
    })}</ul>
  </section>;
}
