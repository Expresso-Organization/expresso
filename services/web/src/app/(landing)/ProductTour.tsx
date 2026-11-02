"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

import styles from "./landing.module.css";

export type TourStep = { title: string; body: string; media: ReactNode };

/** 한 단계를 보여 주는 시간. 설명 두 문장을 읽고 화면을 한 번 훑을 만큼이다. */
const STEP_MS = 6500;

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const query = matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** 동작 줄이기 설정. 서버에서는 줄인 쪽으로 본다 — 자동으로 넘기지 않은 채 그린다. */
function useReducedMotion() {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => matchMedia(REDUCED_MOTION).matches,
    () => true,
  );
}

/**
 * 제작 과정 둘러보기. 단계가 저절로 넘어가고, 단계를 누르면 그 화면에 머문다.
 *
 * 마우스를 올리거나 포커스가 들어오면 멈춘다. 한 번 직접 고른 뒤에는 다시 저절로 넘기지 않는다.
 */
export function ProductTour({ steps }: { steps: TourStep[] }) {
  const reducedMotion = useReducedMotion();
  const [active, setActive] = useState(0);
  const [hovering, setHovering] = useState(false);
  const [chosen, setChosen] = useState(false);
  const playing = !reducedMotion && !hovering && !chosen;
  const tabList = useRef<HTMLDivElement>(null);

  // 좁은 화면에서는 단계 목록이 가로로 밀린다. 고른 단계가 목록 밖에 있으면 목록만 가로로 옮긴다.
  // scrollIntoView는 페이지까지 세로로 움직이므로 쓰지 않는다.
  useEffect(() => {
    const list = tabList.current;
    const tab = list?.children[active] as HTMLElement | undefined;
    if (!list || !tab || list.scrollWidth <= list.clientWidth) return;
    const left = tab.offsetLeft - list.offsetLeft;
    if (left < list.scrollLeft || left + tab.offsetWidth > list.scrollLeft + list.clientWidth) {
      list.scrollTo({ left: left - 16, behavior: reducedMotion ? "auto" : "smooth" });
    }
  }, [active, reducedMotion]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => setActive((index) => (index + 1) % steps.length), STEP_MS);
    return () => window.clearTimeout(timer);
  }, [active, playing, steps.length]);

  return (
    <div
      className={styles.tour}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onFocus={() => setHovering(true)}
      onBlur={() => setHovering(false)}
    >
      <div ref={tabList} className={styles.tourTabs} role="tablist" aria-label="제작 과정">
        {steps.map((step, index) => {
          const selected = index === active;
          return (
            <button
              key={step.title}
              type="button"
              role="tab"
              id={`tour-tab-${index}`}
              aria-selected={selected}
              aria-controls={`tour-panel-${index}`}
              className={styles.tourTab}
              data-active={selected}
              onClick={() => {
                setActive(index);
                setChosen(true);
              }}
            >
              <span className={styles.tourNumber}>{String(index + 1).padStart(2, "0")}</span>
              <span className={styles.tourTitle}>{step.title}</span>
              <span className={styles.tourBody}>{step.body}</span>
              {selected ? (
                <span className={styles.tourProgress} aria-hidden="true">
                  {playing ? (
                    <span key={active} className={styles.tourProgressFill} style={{ animationDuration: `${STEP_MS}ms` }} />
                  ) : null}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <div className={styles.tourStage}>
        {steps.map((step, index) => (
          <div
            key={step.title}
            role="tabpanel"
            id={`tour-panel-${index}`}
            aria-labelledby={`tour-tab-${index}`}
            className={styles.tourPanel}
            data-active={index === active}
            inert={index !== active}
          >
            {step.media}
            <p className={styles.tourCaption}>{step.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
