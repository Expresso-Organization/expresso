"use client";

import { useSyncExternalStore } from "react";

import { isApplePlatform, shortcutLabel } from "@/lib/shortcut";

// 플랫폼은 세션 중에 바뀌지 않으므로 구독할 것이 없다.
const subscribe = () => () => {};

function readApple(): boolean {
  // `userAgentData`는 Chromium 계열에만 있고 `navigator.platform`은 deprecated다.
  // 있는 쪽을 먼저 쓰고, 없으면 뒤쪽으로 내려간다.
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  return isApplePlatform(nav.userAgentData?.platform || nav.platform || "");
}

/**
 * 수정 키가 붙는 단축키의 표시 글자. 맥은 `⌘K`, 그 밖은 `Ctrl+K`.
 * 서버 렌더와 하이드레이션 첫 렌더는 `⌘`로 그리므로(서버는 플랫폼을 모른다)
 * 맥에서는 바뀌지 않고, 비맥에서만 하이드레이션 직후 `Ctrl+`로 바뀐다.
 */
export function useShortcutLabel(key: string): string {
  const apple = useSyncExternalStore(subscribe, readApple, () => true);
  return shortcutLabel(key, apple);
}
