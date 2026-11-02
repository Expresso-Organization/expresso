"use client";

import { useState } from "react";

import styles from "./landing.module.css";

/** 예시 인물 윤하린의 기록(복사본 DB 더미 데이터와 같은 제목). */
const RECORDS = [
  { id: "app-router", title: "상품 상세 App Router 전환과 성능 개선", category: "프로젝트" },
  { id: "design-system", title: "사내 디자인 시스템 '모아 UI' 구축", category: "프로젝트" },
  { id: "a11y", title: "쇼핑 화면 웹 접근성 개선", category: "프로젝트" },
  { id: "dashboard", title: "실시간 주문 현황 대시보드", category: "프로젝트" },
  { id: "pwa", title: "개인 가계부 PWA", category: "프로젝트" },
  { id: "study", title: "사내 프론트엔드 스터디 운영", category: "활동 · 리더십" },
] as const;

type RecordId = (typeof RECORDS)[number]["id"];

/** 공고마다 요건에 맞춰 매긴 순서. 위 셋이 포트폴리오에 담긴다. */
const POSTINGS: { label: string; order: RecordId[] }[] = [
  { label: "커머스 웹 프론트엔드", order: ["app-router", "a11y", "design-system", "dashboard", "pwa", "study"] },
  { label: "디자인 시스템 엔지니어", order: ["design-system", "a11y", "study", "app-router", "pwa", "dashboard"] },
  { label: "데이터 시각화 프론트엔드", order: ["dashboard", "pwa", "app-router", "design-system", "study", "a11y"] },
];

const PICKED = 3;

/** 공고를 바꾸면 같은 기록 묶음이 다시 줄 선다. 순서가 바뀌는 움직임이 곧 설명이다. */
export function TailorDemo() {
  const [posting, setPosting] = useState(0);
  const order = POSTINGS[posting]?.order ?? [];

  return (
    <div className={styles.tailorDemo}>
      <div className={styles.tailorTabs} role="tablist" aria-label="지원하는 공고">
        {POSTINGS.map((item, index) => (
          <button
            key={item.label}
            type="button"
            role="tab"
            aria-selected={index === posting}
            className={styles.tailorTab}
            data-active={index === posting}
            onClick={() => setPosting(index)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <ol className={styles.tailorList} aria-label="공고에 맞춘 기록 순서" aria-live="polite">
        {RECORDS.map((record) => {
          const rank = order.indexOf(record.id);
          const picked = rank < PICKED;
          return (
            <li
              key={record.id}
              className={styles.tailorRow}
              data-picked={picked}
              style={{ transform: `translateY(calc(${rank} * var(--row)))` }}
              aria-posinset={rank + 1}
            >
              <span className={styles.tailorRank}>{rank + 1}</span>
              <span className={styles.tailorTitle}>{record.title}</span>
              <span className={styles.tailorCategory}>{record.category}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
