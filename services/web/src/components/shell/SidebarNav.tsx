"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { startTransition, type MouseEvent } from "react";

import { GlideMenu } from "@/components/ui/GlideMenu";
import { Icon } from "@/components/ui/Icon";
import { AGENT_CHAT_CLOSE, AGENT_COMPOSER_FOCUS } from "@/features/agent-chat/agent-handoff";

import styles from "./Sidebar.module.css";

export type SidebarSection = "home" | "library" | "explore" | "analytics";

const PRIMARY_ITEMS: readonly {
  key: SidebarSection;
  label: string;
  href: Route;
  icon: string;
}[] = [
  { key: "home", label: "홈", href: "/home", icon: "house" },
  { key: "library", label: "라이브러리", href: "/library" as Route, icon: "books" },
  { key: "explore", label: "탐색", href: "/jobs", icon: "compass" },
  { key: "analytics", label: "분석", href: "/analytics", icon: "chart-bar" },
];

/**
 * 주소로 활성 항목을 정한다.
 *
 * 예전에는 화면마다 `active="jobs"`를 손으로 넘겼다. 사이드바가 레이아웃으로
 * 올라가면서 그 자리가 없어졌고, 어차피 "지금 어느 메뉴냐"는 주소가 이미
 * 알고 있는 사실이다. 설정(`/account`)은 1차 메뉴가 아니므로 `null`이고, 그
 * 화면의 활성 표시는 사이드바 아래쪽 사용자 줄(`AccountLink`)이 받는다.
 */
export function sectionForPath(pathname: string): SidebarSection | null {
  // 에이전트 대화와 구직 목표는 홈이다. 기록과 포트폴리오는 어디서 열었든 라이브러리에 속한다.
  if (pathname === "/home" || pathname.startsWith("/agent") || pathname.startsWith("/goal")) return "home";
  if (pathname.startsWith("/library") || pathname.startsWith("/career") || pathname.startsWith("/edit")) return "library";
  if (pathname.startsWith("/jobs")) return "explore";
  if (pathname.startsWith("/analytics")) return "analytics";
  return null;
}

/** 홈이 대화 화면을 띄우는 주소 파라미터(`home/page.tsx`). 하나라도 있으면 홈은 대화 중이다. */
const CONVERSATION_PARAMS = ["chat", "compose", "new"] as const;

export function SidebarNav() {
  const pathname = usePathname();
  const router = useRouter();
  const active = sectionForPath(pathname);

  /**
   * 「새 대화」는 대화 전 홈으로 간다. 다른 화면에서는 링크 그대로 이동하고, 홈에서는 두 경우를 직접 처리한다.
   * 대화 중이면 대화 화면 머리글의 「새 대화」와 같은 전환(`AGENT_CHAT_CLOSE`)으로 돌아가고,
   * 이미 대화 전 홈이면 옮겨 갈 곳이 없으니 입력창에 초점을 준다.
   * 쿼리는 누를 때 읽는다 — 주소를 구독하면 쿼리가 바뀔 때마다 사이드바가 다시 그려진다.
   */
  const startConversation = (event: MouseEvent<HTMLAnchorElement>) => {
    // ⌘ · Ctrl · Shift 클릭과 가운데 클릭은 새 탭 · 새 창으로 여는 브라우저 동작에 맡긴다.
    if (pathname !== "/home" || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const params = new URLSearchParams(window.location.search);
    if (CONVERSATION_PARAMS.some((key) => params.has(key))) {
      startTransition(() => router.push("/home", { transitionTypes: [AGENT_CHAT_CLOSE] }));
    } else {
      window.dispatchEvent(new Event(AGENT_COMPOSER_FOCUS));
    }
  };

  return (
    <nav aria-label="주요 이동">
      {/* 서비스의 단 하나의 CTA인 「새 포트폴리오」 옆에 한 단계 낮춘 「새 대화」가 선다. */}
      <div className={styles.actions}>
        <Link href="/home?new=portfolio" className={styles.brew} title="새 포트폴리오">
          <span className={styles.brewLead}><Icon name="coffee" weight="fill" size={15} /></span>
          <span className={`${styles.copy} ${styles.brewLabel}`}>새 포트폴리오</span>
        </Link>
        <Link href="/home" className={styles.newChat} title="새 대화" aria-label="새 대화" onClick={startConversation}>
          <Icon name="chat-circle-dots" size={16} />
          <span className={styles.newChatLabel}><span><span>새 대화</span></span></span>
        </Link>
      </div>
      <GlideMenu className={`${styles.primary} ${styles.navGroup}`}>
        {PRIMARY_ITEMS.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            data-row
            title={item.label}
            className={`${styles.row} ${styles.primaryItem} ${
              active === item.key
                ? `${styles.rowActive} ${styles.primaryItemActive}`
                : ""
            }`}
            aria-current={active === item.key ? "page" : undefined}
          >
            <span className={styles.rowLead}>
              <Icon
                name={item.icon}
                weight={active === item.key ? "fill" : "regular"}
                size={14}
                color={active === item.key ? "var(--ex-fg)" : "var(--ex-fg-muted)"}
              />
            </span>
            <span className={`${styles.copy} ${styles.primaryLabel}`}>
              {item.label}
            </span>
          </Link>
        ))}
      </GlideMenu>
    </nav>
  );
}
