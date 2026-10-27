"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 이 화면의 팝오버(필터 · 해석 칩 · 조건 추가 · 정렬)가 함께 쓰는 여닫이.
 *
 * 바깥을 누르거나 Esc를 치면 닫는다. 열어 둔 채로 다른 곳을 눌렀을 때 그대로
 * 떠 있으면, 닫으려고 한 번 더 눌러야 한다. `box`는 버튼과 팝오버를 함께
 * 감싸는 요소에 단다.
 */
export function usePopover() {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return { open, setOpen, box };
}
