"use client";
import { useSyncExternalStore } from "react";

const subscribe = () => () => undefined;

/**
 * 이 앱의 출처(`https://expresso.ai.kr`). 그림 스크립트를 돌리는 지면 문서의 정책이 그림 출처로 쓴다 — 익명 출처의 문서에서는
 * `'self'`가 우리 그림을 가리키지 못한다. 서버 렌더에서는 비어 있다.
 */
export function useAppOrigin(): string {
  return useSyncExternalStore(subscribe, () => window.location.origin, () => "");
}
