"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * 잡이 도는 동안 화면을 다시 읽는다. 질문 · 구성 잡은 끝났다는 신호를 화면에 보내지 않으므로, 서버가 그린
 * `brew.latestJob`을 1.5초마다 다시 받아 끝난 것을 안다. `router.refresh()`는 클라이언트 상태(고른 디자인 등)를
 * 그대로 둔다.
 */
export function useRefreshWhile(running: boolean): void {
  const router = useRouter();
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => router.refresh(), 1_500);
    return () => window.clearInterval(timer);
  }, [router, running]);
}
