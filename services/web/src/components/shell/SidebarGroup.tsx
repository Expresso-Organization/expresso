"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { Icon } from "@/components/ui/Icon";

import styles from "./Sidebar.module.css";

/**
 * 사이드바의 접히는 묶음 — 「최근 대화」 · 「포트폴리오」 · 「커리어 기록」이 같이 쓴다.
 *
 * 머리말을 누르면 묶음의 줄이 높이째 접힌다. 접어 둔 묶음은 이 브라우저가 기억한다.
 * 사이드바 전체 접기(`SidebarCollapse`)와는 별개다 — 그쪽은 폭을, 이쪽은 묶음 하나의
 * 높이를 줄인다. 서랍(<1024)에서도 묶음 접힘은 그대로 둔다. 서랍도 세로로 길어지는
 * 것은 같기 때문이다.
 */

/* 저장값은 첫 페인트 전에 적용한다 — 이유는 `SidebarCollapse`와 같다. */
const useBeforePaint =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

const storageKey = (id: string) => `ex.sidebar.group.${id}`;

export interface SidebarGroupState {
  open: boolean;
  /** 전환을 켜도 되는가 — 저장값이 그려진 다음 프레임부터 참. */
  animated: boolean;
  setOpen: (next: boolean) => void;
}

/** 묶음 하나의 접힘. 처음 방문하면 펼쳐져 있다. */
export function useSidebarGroupOpen(id: string): SidebarGroupState {
  const [open, setOpenState] = useState(true);
  const [animated, setAnimated] = useState(false);

  useBeforePaint(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(storageKey(id));
    } catch {
      // 저장소를 막아 둔 브라우저. 기억하지 못할 뿐 접기는 된다.
    }
    setOpenState(stored !== "closed");
  }, [id]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setAnimated(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return useMemo(
    () => ({
      open,
      animated,
      setOpen: (next: boolean) => {
        setOpenState(next);
        try {
          window.localStorage.setItem(storageKey(id), next ? "open" : "closed");
        } catch {
          // 위와 같다.
        }
      },
    }),
    [open, animated, id],
  );
}

/**
 * 묶음의 모습. 열림 상태는 부르는 쪽이 준다 — 머리말 옆 동작(카테고리 추가 등)이
 * 묶음을 펼쳐야 할 때 같은 상태를 쥐고 있어야 하기 때문이다.
 */
export function SidebarGroupView({
  label,
  state,
  actions,
  className = "",
  children,
}: {
  label: string;
  state: SidebarGroupState;
  /** 머리말 오른쪽에 서는 건수 · 추가 단추. 토글 단추 바깥에 둔다. */
  actions?: ReactNode;
  /** 본문(줄 목록)에 붙일 클래스. 레일에서 묶음째 물러날 때 쓴다. */
  className?: string;
  children: ReactNode;
}) {
  const bodyId = useId();
  const { open, animated, setOpen } = state;

  return (
    <section
      className={`${styles.group} ${className}`}
      data-open={open}
      data-animated={animated}
      aria-label={label}
    >
      <div className={styles.groupHead}>
        <div className={`${styles.copy} ${styles.groupHeadRow}`}>
          <button
            type="button"
            className={styles.groupToggle}
            aria-expanded={open}
            aria-controls={bodyId}
            title={open ? `${label} 접기` : `${label} 펼치기`}
            onClick={() => setOpen(!open)}
          >
            <span className={styles.groupLabel}>{label}</span>
            <span className={styles.groupCaret} aria-hidden="true">
              <Icon name="caret-down" size={10} />
            </span>
          </button>
          {actions ? <div className={styles.groupActions}>{actions}</div> : null}
        </div>
      </div>
      {/* 접힌 줄은 높이만 0이 아니라 포커스와 클릭에서도 빠진다 */}
      <div id={bodyId} className={styles.groupBody} inert={!open}>
        <div className={styles.groupBodyInner}>{children}</div>
      </div>
    </section>
  );
}

/** 상태를 스스로 쥐는 묶음. 머리말 동작이 묶음을 펼칠 일이 없으면 이것을 쓴다. */
export function SidebarGroup({
  id,
  ...props
}: { id: string } & Omit<Parameters<typeof SidebarGroupView>[0], "state">) {
  const state = useSidebarGroupOpen(id);
  return <SidebarGroupView {...props} state={state} />;
}
