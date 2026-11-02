"use client";

import { useState, type CSSProperties } from "react";

import styles from "./landing.module.css";

/** 예시 인물 윤하린의 기록(체험 DB 복사본의 더미 데이터와 같은 제목). */
const RECORDS = [
  { id: "app-router", title: "상품 상세 App Router 전환과 성능 개선", category: "프로젝트", result: "LCP 3.8초 → 1.9초" },
  { id: "design-system", title: "사내 디자인 시스템 '모아 UI' 구축", category: "프로젝트", result: "공통 컴포넌트 사용 30% → 80%" },
  { id: "a11y", title: "쇼핑 화면 웹 접근성 개선", category: "프로젝트", result: "자동 검사 위반 212건 → 9건" },
  { id: "dashboard", title: "실시간 주문 현황 대시보드", category: "프로젝트", result: "이상 감지 평균 20분 단축" },
  { id: "pwa", title: "개인 가계부 PWA", category: "프로젝트", result: "오프라인 기록 · 재연결 동기화" },
  { id: "study", title: "사내 프론트엔드 스터디 운영", category: "활동 · 리더십", result: "격주 세션 1년 운영" },
] as const;

type RecordId = (typeof RECORDS)[number]["id"];

interface Posting {
  label: string;
  company: string;
  asks: string[];
  order: RecordId[];
  headline: string;
  accent: string;
}

/** 가상의 공고 셋. 요건에 맞춰 같은 기록 여섯 개의 순서가 바뀌고, 위 셋이 포트폴리오에 담긴다. */
const POSTINGS: Posting[] = [
  {
    label: "커머스 웹 프론트엔드",
    company: "라온커머스(가상)",
    asks: ["Core Web Vitals 개선", "웹 접근성", "디자인 시스템 운영"],
    order: ["app-router", "a11y", "design-system", "dashboard", "pwa", "study"],
    headline: "상품 상세를 1.9초에 띄우는 프론트엔드 개발자",
    accent: "var(--ex-accent)",
  },
  {
    label: "디자인 시스템 엔지니어",
    company: "모먼트랩(가상)",
    asks: ["컴포넌트 API 설계", "접근성 기본값", "팀 간 문서화"],
    order: ["design-system", "a11y", "study", "app-router", "pwa", "dashboard"],
    headline: "같은 수정을 세 번 하지 않게 만드는 개발자",
    accent: "var(--ex-chart-1)",
  },
  {
    label: "데이터 시각화 프론트엔드",
    company: "그래프하우스(가상)",
    asks: ["실시간 데이터 화면", "차트 성능", "오프라인 동기화"],
    order: ["dashboard", "pwa", "app-router", "design-system", "study", "a11y"],
    headline: "주문 이상을 20분 먼저 보여 주는 개발자",
    accent: "var(--ex-chart-3)",
  },
];

const PICKED = 3;
const byId = new Map(RECORDS.map((record) => [record.id, record]));

/**
 * 공고를 고르면 세 가지가 함께 움직인다 — 기록 순위가 다시 서고, 미리보기의 한 줄
 * 소개와 앞에 둘 사례가 바뀌고, 강조색이 바뀐다. 셋은 같은 클릭에서 시작하고
 * 도착만 조금씩 엇갈린다(motion-design: shared motion event).
 */
export function BrewDemo() {
  const [index, setIndex] = useState(0);
  const posting = POSTINGS[index] ?? POSTINGS[0]!;
  const picks = posting.order.slice(0, PICKED).map((id) => byId.get(id)!);

  return (
    <div className={styles.brew} style={{ "--brew-accent": posting.accent } as CSSProperties}>
      <div className={styles.brewOrders} role="tablist" aria-label="지원하는 공고">
        {POSTINGS.map((item, itemIndex) => (
          <button
            key={item.label}
            type="button"
            role="tab"
            aria-selected={itemIndex === index}
            aria-controls="brew-result"
            className={styles.brewOrder}
            data-active={itemIndex === index}
            onClick={() => setIndex(itemIndex)}
          >
            <span className={styles.brewOrderCompany}>{item.company}</span>
            <span className={styles.brewOrderTitle}>{item.label}</span>
            <span className={styles.brewOrderAsks}>
              {item.asks.map((ask) => (
                <span key={ask}>{ask}</span>
              ))}
            </span>
          </button>
        ))}
      </div>

      <div id="brew-result" className={styles.brewResult} role="tabpanel">
        <ol className={styles.brewRank} aria-label="공고에 맞춘 기록 순서" aria-live="polite">
          {RECORDS.map((record) => {
            const rank = posting.order.indexOf(record.id);
            return (
              <li
                key={record.id}
                className={styles.brewRankRow}
                data-picked={rank < PICKED}
                style={{ transform: `translateY(calc(${rank} * var(--row)))` }}
                aria-posinset={rank + 1}
              >
                <span className={styles.brewRankNumber}>{rank + 1}</span>
                <span className={styles.brewRankTitle}>{record.title}</span>
                <span className={styles.brewRankCategory}>{record.category}</span>
              </li>
            );
          })}
        </ol>

        <div className={styles.brewPreview} aria-label={`${posting.company} 지원용 포트폴리오 미리보기`}>
          <div className={styles.brewPreviewBar} aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div className={styles.brewPreviewBody}>
            <span className={styles.brewPreviewName}>윤하린</span>
            <p key={`headline-${index}`} className={styles.brewPreviewHeadline}>
              {posting.headline}
            </p>
            <ul className={styles.brewPreviewCases}>
              {picks.map((record, pickIndex) => (
                <li
                  key={`${index}-${record.id}`}
                  className={styles.brewPreviewCase}
                  style={{ "--i": pickIndex } as CSSProperties}
                >
                  <span className={styles.brewPreviewCaseTitle}>{record.title}</span>
                  <span className={styles.brewPreviewCaseResult}>{record.result}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
