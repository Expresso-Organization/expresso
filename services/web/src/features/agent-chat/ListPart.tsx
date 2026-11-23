"use client";
import Link from "next/link";
import type { Route } from "next";
import type { AgentFindItem, AgentFindList } from "@expresso/contracts";
import { Icon } from "@/components/ui/Icon";
import styles from "./ListPart.module.css";

/** 마감 임박의 기준. 홈의 위젯 · 공고 목록과 같은 7일이다. */
const URGENT_DAYS = 7;

function Row({ item }: { item: AgentFindItem }) {
  const body = <>
    <span className={styles.icon} aria-hidden="true"><Icon name={item.kind === "job" ? "briefcase" : "trophy"} size={14} /></span>
    <span className={styles.text}>
      <span className={styles.title}>{item.title}</span>
      <span className={styles.sub}>{[item.sub, ...item.meta].filter(Boolean).join(" · ")}</span>
      {item.matchNote ? <span className={styles.note}>{item.matchNote}</span> : null}
    </span>
    {item.daysLeft !== null && item.daysLeft >= 0 ? <span className={styles.deadline} data-urgent={item.daysLeft <= URGENT_DAYS || undefined}>D-{item.daysLeft}</span> : null}
    <Icon name={item.external ? "arrow-square-out" : "caret-right"} size={12} className={styles.go} />
  </>;
  return item.external
    ? <a href={item.href} target="_blank" rel="noreferrer" className={styles.row}>{body}</a>
    : <Link href={item.href as Route} className={styles.row}>{body}</Link>;
}

/**
 * 대화에서 찾은 공고 · 활동의 목록. 답변 글 아래에 놓인다.
 *
 * 줄은 서버의 검색 결과를 그대로 그린다 — 제목 · 회사 · 마감을 컨설턴트가 옮겨 적지 않는다.
 * 공고는 앱의 공고 화면으로, 활동은 출처로(새 창) 간다. 보여 주기만 하므로 지난 답변의 목록도 그대로 눌린다.
 */
export function ListPart({ list }: { list: AgentFindList }) {
  return <section className={styles.part} aria-label={list.title}>
    <header className={styles.head}>
      <span className={styles.heading}>{list.title}</span>
      <span className={styles.count}>{list.total > list.items.length ? `${list.total}건 중 ${list.items.length}건` : `${list.items.length}건`}</span>
    </header>
    {list.conditions?.length ? <ul className={styles.conditions} aria-label="적용한 검색 조건">{list.conditions.map(condition => <li key={condition}>{condition}</li>)}</ul> : null}
    {list.items.length
      ? <ul className={styles.rows}>{[...list.items].sort((a, b) => Number(a.locationStatus === "unknown") - Number(b.locationStatus === "unknown")).map((item, index, items) => <li key={`${item.kind}:${item.id}`}>{item.locationStatus === "unknown" && (index === 0 || items[index - 1]?.locationStatus !== "unknown") ? <p className={styles.sectionLabel}>상세 근무지 확인이 필요한 후보</p> : null}<Row item={item} /></li>)}</ul>
      : <p className={styles.empty}>조건에 맞는 것을 찾지 못했습니다.</p>}
  </section>;
}

/** 찾는 동안의 자리. 찾지 못했을 때는 아무것도 그리지 않는다. */
export function ListPartPending({ failed, activity }: { failed: boolean; activity: boolean }) {
  if (failed) return <p role="alert" className={styles.empty}>검색을 실행하지 못했습니다. 기존 결과를 확인하거나 다시 요청해 주세요.</p>;
  return <p className={`${styles.pending} ex-anim-shimmer`} role="status">{activity ? "공모전과 해커톤을 찾고 있습니다." : "공고를 찾고 있습니다."}</p>;
}
