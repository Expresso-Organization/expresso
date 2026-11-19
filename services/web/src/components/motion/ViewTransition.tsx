/// <reference types="react/canary" />
import * as React from "react";
import type { ReactNode, ViewTransitionProps } from "react";

/**
 * React의 `<ViewTransition>`.
 *
 * App Router는 `ViewTransition`이 들어 있는 React canary를 함께 싣는다
 * (`next/dist/docs/01-app/02-guides/view-transitions.md`). 저장소가 설치한 `react`는 안정판이라
 * 이 컴포넌트가 없다 — vitest처럼 그 판으로 그리는 곳에서는 감싸지 않고 자식만 그린다.
 */
const Native = (React as { ViewTransition?: React.ComponentType<ViewTransitionProps & { children?: ReactNode }> }).ViewTransition;

export function ViewTransition(props: ViewTransitionProps & { children?: ReactNode }) {
  return Native ? <Native {...props} /> : <>{props.children}</>;
}
