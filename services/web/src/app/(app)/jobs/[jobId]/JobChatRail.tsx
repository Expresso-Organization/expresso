"use client";

import type { CSSProperties, KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { Icon } from "@/components/ui/Icon";
import { AgentChat, type AgentChatJob } from "@/features/agent-chat/AgentChat";

import styles from "./page.module.css";

/** 지금의 레일 폭. 대화 안 카드들이 이 폭에 맞춰 그려져 있어 그보다 좁히지 않는다. */
export const MIN_WIDTH = 316;
/** 왼쪽 본문이 레일 옆에 서려면 필요한 폭(`page.module.css`의 1023px 규칙 주석). */
export const LEFT_MIN_WIDTH = 700;
const STEP = 24;
const COLLAPSED_KEY = "ex.jobChat.collapsed";
const WIDTH_KEY = "ex.jobChat.width";
/** `tokens.css`의 `--ex-bp-lg`. 이보다 좁으면 레일이 본문 아래로 내려간다. */
const DOCKED = "(min-width: 1024px)";

/* 저장값은 첫 페인트 전에 적용한다 — 왼쪽 사이드바(`SidebarCollapse`)와 같은 이유다. */
const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect;

const read = (key: string) => { try { return window.localStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string) => { try { window.localStorage.setItem(key, value); } catch { /* 기억하지 못할 뿐 동작은 한다. */ } };

/**
 * 공고 채팅 레일의 접힘과 너비.
 *
 * 레일이 본문 옆에 설 때(≥1024px)만 접고 늘린다. 너비는 316px부터 본문 폭에서 왼쪽 열 700px을 뺀
 * 값까지이고, 왼쪽 앱 사이드바를 접고 펴서 본문 폭이 바뀌어도 그 범위로 다시 맞춘다.
 */
export function useJobChatRail(container: () => HTMLElement | null) {
  const [docked, setDocked] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [width, setWidth] = useState(MIN_WIDTH);
  const [max, setMax] = useState(MIN_WIDTH);
  const [animated, setAnimated] = useState(false);

  const clamp = useCallback((next: number, limit = max) => Math.round(Math.min(Math.max(next, MIN_WIDTH), Math.max(MIN_WIDTH, limit))), [max]);

  useBeforePaint(() => {
    const media = window.matchMedia(DOCKED);
    const measure = () => Math.max(MIN_WIDTH, (container()?.clientWidth ?? 0) - LEFT_MIN_WIDTH);
    const apply = () => {
      setDocked(media.matches);
      if (!media.matches) return;
      const limit = measure();
      setMax(limit);
      setCollapsed(read(COLLAPSED_KEY) === "true");
      const stored = Number(read(WIDTH_KEY));
      setWidth(current => Math.round(Math.min(Math.max(Number.isFinite(stored) && stored > 0 ? stored : current, MIN_WIDTH), limit)));
    };
    apply();
    media.addEventListener("change", apply);
    const element = container();
    const observer = typeof ResizeObserver === "undefined" || !element ? null : new ResizeObserver(() => {
      const limit = measure();
      setMax(limit);
      setWidth(current => Math.min(current, limit));
    });
    if (element) observer?.observe(element);
    return () => { media.removeEventListener("change", apply); observer?.disconnect(); };
  }, [container]);

  useEffect(() => { const frame = requestAnimationFrame(() => setAnimated(true)); return () => cancelAnimationFrame(frame); }, []);

  return {
    docked, collapsed, width, max, animated,
    setCollapsed: (next: boolean) => { setCollapsed(next); write(COLLAPSED_KEY, String(next)); },
    /** 끄는 중에는 저장하지 않고, 손을 뗄 때 `commit`으로 한 번 저장한다. */
    resize: (next: number) => setWidth(clamp(next)),
    commit: (next: number) => { const value = clamp(next); setWidth(value); write(WIDTH_KEY, String(value)); },
  };
}

/** 공고 상세 우측 레일. 채팅을 감싸고, 왼쪽 경계 핸들과 접힌 띠를 그린다. */
export function JobChatRail({ job }: { job: AgentChatJob }) {
  const aside = useRef<HTMLElement>(null);
  const container = useCallback(() => aside.current?.parentElement ?? null, []);
  const rail = useJobChatRail(container);
  const [running, setRunning] = useState(false);
  const [resizing, setResizing] = useState(false);
  const drag = useRef<{ startX: number; startWidth: number; width: number } | null>(null);
  const { resize, commit } = rail;

  useEffect(() => {
    if (!resizing) return;
    const previousCursor = document.body.style.cursor;
    const previousSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const move = (event: PointerEvent) => {
      if (!drag.current) return;
      // 레일은 오른쪽에 붙어 있어, 경계를 왼쪽으로 끌수록 넓어진다.
      drag.current.width = drag.current.startWidth + drag.current.startX - event.clientX;
      resize(drag.current.width);
    };
    const finish = () => { if (drag.current) commit(drag.current.width); drag.current = null; setResizing(false); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", finish, { once: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousSelect;
    };
  }, [resizing, resize, commit]);

  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    drag.current = { startX: event.clientX, startWidth: rail.width, width: rail.width };
    setResizing(true);
  };
  const resizeFromKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") commit(rail.width + STEP);
    else if (event.key === "ArrowRight") commit(rail.width - STEP);
    else if (event.key === "Home") commit(MIN_WIDTH);
    else if (event.key === "End") commit(rail.max);
    else return;
    event.preventDefault();
  };

  const collapsed = rail.docked && rail.collapsed;
  return (
    <aside
      ref={aside}
      className={styles.rail}
      data-collapsed={collapsed ? "true" : "false"}
      data-resizing={resizing ? "true" : "false"}
      data-animated={rail.animated ? "true" : "false"}
      style={rail.docked ? ({ "--job-chat-width": `${rail.width}px` } as CSSProperties) : undefined}
    >
      {rail.docked && !collapsed ? (
        <div
          className={styles.railHandle}
          role="separator"
          aria-label="채팅 너비 조절"
          aria-orientation="vertical"
          aria-valuemin={MIN_WIDTH}
          aria-valuemax={rail.max}
          aria-valuenow={rail.width}
          tabIndex={0}
          onKeyDown={resizeFromKeyboard}
          onPointerDown={startResize}
        />
      ) : null}
      {collapsed ? (
        <div className={styles.railStrip}>
          <button type="button" className={styles.railExpand} aria-label="채팅 펼치기" title="채팅 펼치기" onClick={() => rail.setCollapsed(false)}>
            <Icon name="chat-circle-dots" size={18} />
          </button>
          {running ? <span className={`${styles.railRunning} ex-anim-pulse`} role="status" aria-label="응답을 준비하고 있어요" /> : null}
        </div>
      ) : null}
      {/* 접혀도 채팅은 마운트된 채로 둔다 — 입력 중인 글과 진행 중인 응답이 끊기지 않게. */}
      <div className={styles.railChat} hidden={collapsed}>
        <AgentChat job={job} onCollapse={rail.docked ? () => rail.setCollapsed(true) : undefined} onRunningChange={setRunning} />
      </div>
    </aside>
  );
}
