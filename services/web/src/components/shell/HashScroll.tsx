"use client";

import { useEffect } from "react";

const USER_SCROLL_EVENTS = ["wheel", "touchstart", "keydown", "pointerdown"] as const;

/**
 * 주소의 해시가 이 id면 그 구획을 보인다.
 *
 * `loading.tsx`가 있는 화면으로 이동하면 로딩 화면이 먼저 그려지고, Next는
 * 그때 해시 위치를 찾는다. 본문은 그 뒤에 스트리밍되어 들어오므로 찾을 자리가
 * 없어 맨 위에 머문다. 본문이 그려진 뒤 이 컴포넌트가 한 번 더 찾는다.
 *
 * 위쪽 구획이 늦게 채워지면(클라이언트에서 불러오는 설정처럼) 구획이 다시
 * 밀린다. 그래서 형제 구획의 크기가 바뀔 때마다 다시 맞추고, 사용자가 직접
 * 스크롤하거나 누르면 그때부터는 손대지 않는다.
 */
export function HashScroll({ id }: { id: string }) {
  useEffect(() => {
    if (window.location.hash !== `#${id}`) return;
    const target = document.getElementById(id);
    if (!target) return;

    const align = () => target.scrollIntoView({ block: "start" });
    align();
    const observer = new ResizeObserver(align);
    for (const sibling of target.parentElement?.children ?? []) observer.observe(sibling);
    const stop = () => {
      observer.disconnect();
      for (const type of USER_SCROLL_EVENTS) window.removeEventListener(type, stop);
    };
    for (const type of USER_SCROLL_EVENTS) window.addEventListener(type, stop, { passive: true });
    return stop;
  }, [id]);
  return null;
}
