"use client";

import { useEffect, useState } from "react";

import { Icon } from "@/components/ui/Icon";
import {
  THEME_CHOICES,
  THEME_COOKIE,
  parseThemeChoice,
  type ThemeChoice,
} from "@/lib/theme";

import styles from "./ThemePicker.module.css";

/**
 * 지면 밝기 고르기.
 *
 * 서버를 거치지 않습니다. 고른 값은 쿠키에 두고 `data-theme`을 바로 갈아
 * 끼웁니다 — 왕복을 기다리면 누른 뒤 한 박자 뒤에 화면이 바뀌고, 그 사이가
 * 고장으로 보입니다.
 *
 * 처음 그릴 때는 `system`으로 둡니다. 쿠키는 서버에 없는 값이라 서버가 그린
 * 것과 브라우저가 그린 것이 달라지면 React가 경고를 냅니다. 붙은 뒤에 실제
 * 값으로 맞춥니다.
 */
export function ThemePicker() {
  const [choice, setChoice] = useState<ThemeChoice>("system");

  useEffect(() => {
    const match = document.cookie.match(
      new RegExp(`(?:^|;\\s*)${THEME_COOKIE}=([^;]*)`),
    );
    setChoice(parseThemeChoice(match?.[1]));
  }, []);

  function pick(next: ThemeChoice) {
    setChoice(next);

    const root = document.documentElement;
    if (next === "system") {
      root.removeAttribute("data-theme");
      // 지난 값을 지우려면 지난 시각을 준다.
      document.cookie = `${THEME_COOKIE}=; path=/; max-age=0; samesite=lax`;
      return;
    }

    root.setAttribute("data-theme", next);
    // 한 해. 다시 물어보지 않아도 될 만큼 길고, 영원하지는 않다.
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    <div className={styles.group} role="radiogroup" aria-label="지면 밝기">
      {THEME_CHOICES.map((option) => {
        const active = option.value === choice;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            className={`${styles.option} ${active ? styles.optionOn : ""}`}
            onClick={() => pick(option.value)}
          >
            <Icon
              name={option.icon}
              size={14}
              color={active ? "var(--ex-fg)" : "var(--ex-fg-muted)"}
            />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
