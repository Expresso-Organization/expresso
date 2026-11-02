"use client";

import { useEffect, useState, type ReactNode } from "react";

import styles from "./landing.module.css";

/**
 * 머리 메뉴. 어두운 첫 화면 위에서는 바탕 없이 밝은 글자로, 첫 화면을 지나면
 * 지면 색 바탕으로 바뀐다. 기준은 첫 화면 구간(`#hero`)의 아래 끝이다.
 */
export function LandingHeader({ children }: { children: ReactNode }) {
  const [overHero, setOverHero] = useState(true);

  useEffect(() => {
    const hero = document.getElementById("hero");
    const update = () => {
      setOverHero(hero ? hero.getBoundingClientRect().bottom > 64 : false);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <header className={styles.header} data-over-hero={overHero} {...(overHero ? { "data-theme": "dark" } : {})}>
      {children}
    </header>
  );
}
