"use client";

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * 사이드바를 접었는가.
 *
 * 사이드바 자체는 서버 부품이라(세션·포트폴리오·공고를 읽는다) 상태를 가질 수
 * 없습니다. 그래서 접힘은 셸이 들고 있고, 사이드바의 껍데기(`SidebarFrame`)만
 * 클라이언트로 내려와 그 값을 읽습니다.
 *
 * 세 가지를 지킵니다.
 *
 * - **기억한다.** 접어 둔 사람에게 새로고침마다 다시 접으라고 하지 않는다.
 * - **첫 페인트에는 움직이지 않는다.** 저장값을 적용하는 순간 250→56px 전환이
 *   보이면 화면이 로드될 때마다 사이드바가 접히는 장면을 보게 된다.
 * - **좁은 화면에서는 접지 않는다.** `<1024`에서 사이드바는 서랍이다. 서랍은
 *   덮개를 걷고 들어가는 자리라 아이콘만 남길 이유가 없다.
 */

/*
 * 저장값은 **첫 페인트 전에** 적용해야 한다. `useEffect`는 페인트 뒤에 도는
 * 자리라, 접어 둔 사람은 화면을 열 때마다 펼쳐진 사이드바를 한 프레임 보게
 * 된다. 서버에는 레이아웃 효과가 없으므로 그쪽에서는 `useEffect`로 접는다 —
 * 서버 렌더는 언제나 펼친 상태이고, 그 값을 쓰는 코드도 없다.
 */
const useBeforePaint =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

const STORAGE_KEY = "ex.sidebar.collapsed";

/** `tokens.css`의 `--ex-bp-lg`. 사이드바가 제자리에 서기 시작하는 폭. */
const DOCKED = "(min-width: 1024px)";

interface SidebarCollapseValue {
  collapsed: boolean;
  /** 전환을 켜도 되는가 — 첫 페인트 뒤부터 참. */
  animated: boolean;
  toggle: () => void;
  setCollapsed: (next: boolean) => void;
}

const SidebarCollapseContext = createContext<SidebarCollapseValue | null>(null);

export function useSidebarCollapse(): SidebarCollapseValue {
  const value = useContext(SidebarCollapseContext);
  if (!value) {
    throw new Error(
      "사이드바 접힘은 SidebarCollapseProvider 안에서만 읽을 수 있습니다.",
    );
  }
  return value;
}

export function SidebarCollapseProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [animated, setAnimated] = useState(false);

  useBeforePaint(() => {
    const docked = window.matchMedia(DOCKED);

    const apply = () => {
      if (!docked.matches) {
        setCollapsed(false);
        return;
      }
      let stored: string | null = null;
      try {
        stored = window.localStorage.getItem(STORAGE_KEY);
      } catch {
        // 저장소를 막아 둔 브라우저. 기억하지 못할 뿐 접기는 된다.
      }
      setCollapsed(stored === "true");
    };

    apply();
    docked.addEventListener("change", apply);
    return () => docked.removeEventListener("change", apply);
  }, []);

  // 저장값이 그려진 다음 프레임부터 전환을 켠다.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setAnimated(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const value = useMemo<SidebarCollapseValue>(() => {
    const remember = (next: boolean) => {
      setCollapsed(next);
      try {
        window.localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // 위와 같다.
      }
    };
    return {
      collapsed,
      animated,
      toggle: () => remember(!collapsed),
      setCollapsed: remember,
    };
  }, [collapsed, animated]);

  return (
    <SidebarCollapseContext.Provider value={value}>
      {children}
    </SidebarCollapseContext.Provider>
  );
}
