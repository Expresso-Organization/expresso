"use client";

import { useState } from "react";

/**
 * 값이 처음 그려질 때와 달라졌는지. 사용자가 누른 결과로 바뀐 문구만 떠오르게 할 때 쓴다 —
 * 대화를 다시 열어 이미 끝난 상태로 그려지는 카드는 움직이지 않는다.
 *
 * 문구 자리에 `key={value}`를 함께 주면 값이 다시 바뀔 때마다 새로 그려져 애니메이션이 다시 돈다.
 */
export function useChangedSinceMount(value: string): boolean {
  const [initial] = useState(value);
  return value !== initial;
}
