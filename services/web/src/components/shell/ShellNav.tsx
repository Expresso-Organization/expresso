"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { Icon } from "@/components/ui/Icon";

import { sectionForPath, type SidebarSection } from "./SidebarNav";
import styles from "./ShellNav.module.css";

/**
 * 좁은 화면의 이동 장치.
 *
 * 셋이 한 벌입니다 — 여는 단추(헤더 왼쪽) · 서랍(사이드바를 담는 오버레이) ·
 * 하단 탭바. 폭에 따라 무엇이 나오는지는 CSS가 정하고, 여기서는 **열렸는가**
 * 하나만 다룹니다.
 *
 * - `≥1024` 사이드바가 제자리에 선다. 단추도 탭바도 없다.
 * - `768~1023` 사이드바가 서랍으로 물러나고 단추가 나온다.
 * - `<768` 서랍은 그대로, 아래에 탭바가 붙는다. 자주 가는 넷은 손가락이 닿는
 *   자리에 있어야 한다.
 */

const ShellNavContext = createContext<{
  open: boolean;
  setOpen: (next: boolean) => void;
} | null>(null);

function useShellNav() {
  const value = useContext(ShellNavContext);
  if (!value) {
    throw new Error("ShellNav 부품은 ShellNavProvider 안에서만 쓸 수 있습니다.");
  }
  return value;
}

export function ShellNavProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // 옮겨 갔으면 서랍은 할 일을 마쳤다. 열린 채로 두면 도착한 화면을 가린다.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // 열려 있는 동안 뒤가 스크롤되면 서랍만 제자리에 있고 지면이 흘러간다.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // 서랍은 덮개다. Esc로 닫히지 않는 덮개는 갇힌 느낌을 준다.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const value = useMemo(() => ({ open, setOpen }), [open]);
  return <ShellNavContext.Provider value={value}>{children}</ShellNavContext.Provider>;
}

/** 헤더 왼쪽의 여는 단추. `≥1024`에서는 CSS가 감춘다. */
export function ShellNavTrigger() {
  const { open, setOpen } = useShellNav();
  return (
    <button
      type="button"
      className={styles.trigger}
      aria-label="메뉴 열기"
      aria-expanded={open}
      onClick={() => setOpen(true)}
    >
      <Icon name="list" size={18} color="var(--ex-fg-body)" />
    </button>
  );
}

/**
 * 사이드바를 담는 자리.
 *
 * 넓은 화면에서는 이 요소가 그냥 사이드바 자리이고, 좁아지면 같은 요소가
 * 서랍이 됩니다 — 사이드바를 두 벌 그리지 않기 위해서입니다.
 */
export function ShellNavDrawer({ children }: { children: ReactNode }) {
  const { open, setOpen } = useShellNav();
  const close = useCallback(() => setOpen(false), [setOpen]);

  return (
    <>
      <div
        className={`${styles.scrim} ${open ? styles.scrimOn : ""}`}
        onClick={close}
        aria-hidden="true"
      />
      <div className={`${styles.drawer} ${open ? styles.drawerOn : ""}`}>
        <button
          type="button"
          className={styles.close}
          aria-label="메뉴 닫기"
          onClick={close}
        >
          <Icon name="x" size={16} color="var(--ex-fg-muted)" />
        </button>
        {children}
      </div>
    </>
  );
}

/**
 * 폰의 하단 탭바.
 *
 * 사이드바의 1차 메뉴 넷과 같은 곳으로 갑니다. 나머지(내 커리어 · 포트폴리오
 * 목록 · 계정)는 서랍에 있고, 마지막 칸이 그 서랍을 엽니다.
 */
const TABS: readonly {
  key: SidebarSection;
  label: string;
  href: Route;
  icon: string;
}[] = [
  { key: "home", label: "홈", href: "/home", icon: "house" },
  { key: "new-portfolio", label: "만들기", href: "/brew/new", icon: "coffee" },
  { key: "jobs", label: "공고", href: "/jobs", icon: "target" },
  { key: "analytics", label: "분석", href: "/analytics", icon: "chart-bar" },
];

export function ShellTabBar() {
  const { setOpen } = useShellNav();
  const active = sectionForPath(usePathname());

  return (
    <nav className={styles.tabbar} aria-label="주요 이동">
      {TABS.map((tab) => {
        const on = active === tab.key;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            className={`${styles.tab} ${on ? styles.tabOn : ""}`}
            aria-current={on ? "page" : undefined}
          >
            <Icon
              name={tab.icon}
              weight={on ? "fill" : "regular"}
              size={19}
              color={on ? "var(--ex-fg)" : "var(--ex-fg-muted)"}
            />
            {tab.label}
          </Link>
        );
      })}
      <button type="button" className={styles.tab} onClick={() => setOpen(true)}>
        <Icon name="dots-three" size={19} color="var(--ex-fg-muted)" />
        더 보기
      </button>
    </nav>
  );
}
