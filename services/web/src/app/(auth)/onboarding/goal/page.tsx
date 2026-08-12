"use client";

import type { Route } from "next";
import Link from "next/link";
import { useState } from "react";

import { OnboardingShell, onboardingStyles as styles } from "../OnboardingShell";

const ROLES = [
  "백엔드",
  "프론트엔드",
  "데이터",
  "ML · AI",
  "모바일",
  "DevOps",
  "기획 · PM",
  "디자인",
] as const;

/** 추천과 질문의 기준이 되는 최소 정보만 묻는다. */
const GOALS = [
  {
    id: "explore",
    title: "지원할 곳을 정하고 싶습니다",
    note: "공고를 모아 내 기록과의 일치도부터 보여드립니다",
  },
  {
    id: "build",
    title: "지원할 포트폴리오가 필요합니다",
    note: "공고 하나를 골라 바로 제작 흐름으로 들어갑니다",
  },
  {
    id: "organize",
    title: "흩어진 경험부터 정리하고 싶습니다",
    note: "카테고리에 기록을 쌓는 것부터 시작합니다",
  },
] as const;

const MAX_YEARS = 12;

export default function OnboardingGoalPage() {
  const [role, setRole] = useState<string>("백엔드");
  const [years, setYears] = useState(5);
  const [goal, setGoal] = useState<string>("build");

  const ratio = (years / MAX_YEARS) * 100;

  return (
    <OnboardingShell
      step={1}
      footRight={
        <Link href={"/onboarding/consent" as Route} className={styles.primary}>
          다음
        </Link>
      }
    >
      <div className={styles.stepLabelMono}>STEP 1 / 4</div>
      <h1 className={styles.title}>어떤 자리를 노리고 계신가요?</h1>
      <p className={styles.lede}>
        공고를 추천하고 질문을 만들 때 씁니다. 나중에 언제든 바꿀 수 있습니다.
      </p>

      <div className={styles.field}>
        <div className={styles.fieldLabel}>직무</div>
        <div className={styles.chips} role="radiogroup" aria-label="직무">
          {ROLES.map((item) => (
            <button
              key={item}
              type="button"
              role="radio"
              aria-checked={item === role}
              onClick={() => setRole(item)}
              className={`${styles.chip} ${item === role ? styles.chipOn : ""}`}
            >
              {item}
            </button>
          ))}
          <button type="button" className={`${styles.chip} ${styles.chipDashed}`}>
            ＋ 직접 입력
          </button>
        </div>
      </div>

      <div className={styles.field}>
        <div className={styles.fieldLabel}>경력</div>
        <div className={styles.sliderRow}>
          <span className={styles.sliderEdge}>신입</span>
          <span
            className={styles.slider}
            role="slider"
            aria-valuenow={years}
            aria-valuemin={0}
            aria-valuemax={MAX_YEARS}
            aria-label="경력 연차"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") setYears(Math.min(MAX_YEARS, years + 1));
              if (event.key === "ArrowLeft") setYears(Math.max(0, years - 1));
            }}
          >
            <span className={styles.sliderFill} style={{ width: `${ratio}%` }} />
            <span className={styles.sliderKnob} style={{ left: `${ratio}%` }} />
          </span>
          <span className={styles.sliderEdge}>12년+</span>
          <span className={styles.sliderValue}>
            {years === 0 ? "신입" : `${years}년`}
          </span>
        </div>
      </div>

      <div className={styles.field}>
        <div className={styles.fieldLabel}>지금 가장 급한 것</div>
        <div className={styles.goals} role="radiogroup" aria-label="지금 가장 급한 것">
          {GOALS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={item.id === goal}
              onClick={() => setGoal(item.id)}
              className={`${styles.goal} ${item.id === goal ? styles.goalOn : ""}`}
            >
              <span className={styles.goalMark} />
              <span style={{ minWidth: 0 }}>
                <span className={styles.goalTitle} style={{ display: "block" }}>
                  {item.title}
                </span>
                <span className={styles.goalNote} style={{ display: "block" }}>
                  {item.note}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </OnboardingShell>
  );
}
