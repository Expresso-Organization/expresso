"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import styles from "./landing.module.css";

/**
 * 스크롤해서 화면에 들어올 때 아래에서 떠오르게 한다.
 *
 * 서버가 그린 첫 화면은 그대로 보인다. 처음부터 화면 안에 있는 구획은 건드리지 않고,
 * 아래에 있는 구획만 숨겼다가 들어올 때 보여 준다. 동작 줄이기 설정이면 아무것도 하지 않는다.
 */
export function Reveal({ children, className }: { children: ReactNode; className?: string | undefined }) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"shown" | "waiting">("shown");

  useEffect(() => {
    const element = ref.current;
    if (!element || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (element.getBoundingClientRect().top < window.innerHeight) return;
    setState("waiting");
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setState("shown");
        observer.disconnect();
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={`${styles.reveal} ${className ?? ""}`} data-state={state}>
      {children}
    </div>
  );
}
