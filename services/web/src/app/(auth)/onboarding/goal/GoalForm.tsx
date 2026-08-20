"use client";

import { MAX_EXPERIENCE_YEARS, type CareerProfile, type TargetRole } from "@expresso/contracts";
import { useActionState, useCallback, useRef, useState } from "react";

import { OnboardingShell, onboardingStyles as styles } from "../OnboardingShell";
import { saveCareerGoalAction, type GoalFormState } from "../onboarding-actions";

/**
 * 화면의 직무 칩. 계약의 `TargetRoleSchema`와 **같은 목록이어야 한다** —
 * 여기서만 늘리면 서버가 400으로 거절한다.
 */
const ROLES: readonly TargetRole[] = [
  "백엔드",
  "프론트엔드",
  "데이터",
  "ML · AI",
  "모바일",
  "DevOps",
  "기획 · PM",
  "디자인",
];

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

const FORM_ID = "onboarding-goal";
const INITIAL: GoalFormState = {};

function clampYears(value: number): number {
  return Math.min(MAX_EXPERIENCE_YEARS, Math.max(0, value));
}

export function GoalForm({ profile }: { profile: CareerProfile | null }) {
  const [state, action, pending] = useActionState(saveCareerGoalAction, INITIAL);

  /*
   * 이미 지난 사람은 자기가 적어 둔 것을 본다. 처음인 사람에게만 기본값을 준다 —
   * 저장된 빈 목록("아직 안 정했다")을 기본값으로 덮어쓰면 그 답을 지우는 것이다.
   */
  const [roles, setRoles] = useState<readonly TargetRole[]>(
    profile ? profile.targetRoles : ["백엔드"],
  );
  const [years, setYears] = useState(profile ? profile.experienceYears : 5);
  const [goal, setGoal] = useState<string>(profile ? profile.primaryGoal : "build");
  const trackRef = useRef<HTMLSpanElement>(null);

  const ratio = (years / MAX_EXPERIENCE_YEARS) * 100;

  /**
   * 트랙 위의 가로 위치를 연차로 읽는다. 폭은 매번 잰다 — 창이 바뀌어도 맞아야 한다.
   * 잴 수 없으면 null이다. 못 잰 것을 현재 값으로 덮어 조용히 넘기지 않는다.
   */
  const yearsAt = useCallback((clientX: number): number | null => {
    const track = trackRef.current;
    if (!track) return null;
    const rect = track.getBoundingClientRect();
    if (rect.width === 0) return null;
    return clampYears(Math.round(((clientX - rect.left) / rect.width) * MAX_EXPERIENCE_YEARS));
  }, []);

  const toggleRole = (role: TargetRole) => {
    setRoles((previous) =>
      previous.includes(role)
        ? previous.filter((item) => item !== role)
        : // 화면 순서를 유지한다 — 고른 차례대로 섞이면 다시 볼 때 딴 목록처럼 보인다.
          ROLES.filter((item) => item === role || previous.includes(item)),
    );
  };

  return (
    <OnboardingShell
      step={1}
      footRight={
        <button type="submit" form={FORM_ID} disabled={pending} className={styles.primary}>
          {pending ? "저장하는 중" : "다음"}
        </button>
      }
    >
      <div className={styles.stepLabelMono}>STEP 1 / 4</div>
      <h1 className={styles.title}>어떤 자리를 노리고 계신가요?</h1>
      <p className={styles.lede}>
        공고를 추천하고 질문을 만들 때 씁니다. 나중에 언제든 바꿀 수 있습니다.
      </p>

      {/*
        하단 액션 바는 이 폼 바깥에 그려진다(OnboardingShell). 그래서 버튼이
        `form` 속성으로 이 폼을 가리킨다 — 감싸는 대신 이름으로 잇는다.
      */}
      <form id={FORM_ID} action={action}>
        {state.error ? (
          <p className={styles.formError} role="alert">
            {state.error}
          </p>
        ) : null}

        {roles.map((role) => (
          <input key={role} type="hidden" name="targetRoles" value={role} />
        ))}
        <input type="hidden" name="experienceYears" value={years} />
        <input type="hidden" name="primaryGoal" value={goal} />

        <div className={styles.field}>
          <div className={styles.fieldLabel}>직무</div>
          <div className={styles.chips} role="group" aria-label="직무 (여러 개 고를 수 있습니다)">
            {ROLES.map((item) => (
              <button
                key={item}
                type="button"
                role="checkbox"
                aria-checked={roles.includes(item)}
                onClick={() => toggleRole(item)}
                className={`${styles.chip} ${roles.includes(item) ? styles.chipOn : ""}`}
              >
                {item}
              </button>
            ))}
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
              aria-valuemax={MAX_EXPERIENCE_YEARS}
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
                const step = {
                  ArrowRight: 1,
                  ArrowUp: 1,
                  ArrowLeft: -1,
                  ArrowDown: -1,
                  PageUp: 3,
                  PageDown: -3,
                }[event.key];
                const jump = { Home: 0, End: MAX_EXPERIENCE_YEARS }[event.key];
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
            <span className={styles.sliderValue}>{years === 0 ? "신입" : `${years}년`}</span>
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
      </form>
    </OnboardingShell>
  );
}
