"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import styles from "./GlideMenu.module.css";

/**
 * 줄이 늘어선 묶음 하나에 호버 하이라이트 하나.
 *
 * 이 부품은 도메인을 모른다 — `rowSelector`에 걸리는 자식이 무엇이든 그 줄의
 * 위치와 높이만 읽는다. 하이라이트는 줄 **뒤**(`z-index: 0`)에 서므로, 줄은
 * 자기 내용을 `z-index: 1` 이상에 올려 두어야 한다.
 *
 * 마우스뿐 아니라 포커스도 따라간다. 키보드로 옮겨 다닐 때 하이라이트가
 * 멈춰 있으면 그것대로 "지금 어디"가 두 곳이 된다.
 */
export function GlideMenu({
  children,
  className,
  rowSelector = "[data-row]",
}: {
  children: ReactNode;
  className?: string | undefined;
  rowSelector?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const [spot, setSpot] = useState({
    top: 0,
    height: 0,
    shown: false,
    /** 이번 이동을 미끄러뜨릴지 — 처음 나타나는 자리는 그냥 거기에 선다. */
    gliding: false,
  });

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  const moveTo = useCallback(
    (target: EventTarget | null) => {
      const container = containerRef.current;
      if (!container || !(target instanceof Element)) return;
      const row = target.closest(rowSelector);
      if (!(row instanceof HTMLElement) || !container.contains(row)) return;

      const bounds = container.getBoundingClientRect();
      const rowBounds = row.getBoundingClientRect();
      const top = rowBounds.top - bounds.top;
      const height = rowBounds.height;

      setSpot((previous) => {
        if (previous.shown) return { top, height, shown: true, gliding: true };

        // 안 보이던 하이라이트는 제자리에 나타난 다음 프레임부터 미끄러진다.
        if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
        frameRef.current = requestAnimationFrame(() => {
          frameRef.current = null;
          setSpot((current) => ({ ...current, gliding: true }));
        });
        return { top, height, shown: true, gliding: false };
      });
    },
    [rowSelector],
  );

  const hide = useCallback(() => {
    setSpot((previous) => ({ ...previous, shown: false }));
  }, []);

  return (
    <div
      ref={containerRef}
      className={`${styles.group} ${className ?? ""}`}
      onMouseOver={(event) => moveTo(event.target)}
      onMouseLeave={hide}
      onFocusCapture={(event) => moveTo(event.target)}
      onBlurCapture={(event) => {
        if (!containerRef.current?.contains(event.relatedTarget)) hide();
      }}
    >
      <span
        aria-hidden="true"
        className={`${styles.highlight} ${spot.gliding ? "" : styles.highlightIdle}`}
        style={{
          top: spot.top,
          height: spot.height,
          opacity: spot.shown ? 1 : 0,
        }}
      />
      {children}
    </div>
  );
}
