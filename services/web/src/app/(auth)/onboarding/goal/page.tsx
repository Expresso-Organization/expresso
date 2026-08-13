"use client";

import type { Route } from "next";
import Link from "next/link";
import { useCallback, useRef, useState } from "react";

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

function clampYears(value: number): number {
  return Math.min(MAX_YEARS, Math.max(0, value));
}

export default function OnboardingGoalPage() {
  const [role, setRole] = useState<string>("백엔드");
  const [years, setYears] = useState(5);
  const [goal, setGoal] = useState<string>("build");
  const trackRef = useRef<HTMLSpanElement>(null);

  const ratio = (years / MAX_YEARS) * 100;

  /**
   * 트랙 위의 가로 위치를 연차로 읽는다. 폭은 매번 잰다 — 창이 바뀌어도 맞아야 한다.
   * 잴 수 없으면 null이다. 못 잰 것을 현재 값으로 덮어 조용히 넘기지 않는다.
   */
  const yearsAt = useCallback((clientX: number): number | null => {
    const track = trackRef.current;
    if (!track) return null;
    const rect = track.getBoundingClientRect();
    if (rect.width === 0) return null;
    return clampYears(Math.round(((clientX - rect.left) / rect.width) * MAX_YEARS));
  }, []);

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
            ref={trackRef}
            className={styles.slider}
            role="slider"
            aria-valuenow={years}
            aria-valuemin={0}
            aria-valuemax={MAX_YEARS}
            /* 읽는 기계에는 "0"이 아니라 "신입"으로 들려야 한다. */
            aria-valuetext={years === 0 ? "신입" : `${years}년`}
            aria-label="경력 연차"
            tabIndex={0}
            /*
             * 누르는 순간 포인터를 붙잡는다. 그래야 트랙 밖으로 끌고 나가도
             * 계속 따라온다 — 4px짜리 막대 위에서만 끌 수 있으면 못 쓴다.
             */
            onPointerDown={(event) => {
              const next = yearsAt(event.clientX);
              if (next !== null) setYears(next);
              // 붙잡기가 실패해도 방금 누른 값은 이미 섰다.
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
              const next = yearsAt(event.clientX);
              if (next !== null) setYears(next);
            }}
            onPointerUp={(event) => {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onKeyDown={(event) => {
              const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 3, PageDown: -3 }[
                event.key
              ];
              const jump = { Home: 0, End: MAX_YEARS }[event.key];
              if (step === undefined && jump === undefined) return;
              // 화살표로 지면이 같이 스크롤되면 값을 맞출 수 없다.
              event.preventDefault();
              /*
               * 직전 값에서 센다. 키를 누르고 있으면 다시 그리기 전에 여러 번
               * 들어오는데, 렌더 시점의 값을 쓰면 그 걸음들이 서로를 덮어쓴다.
               */
              setYears((previous) => clampYears(jump ?? previous + (step ?? 0)));
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
