import type { CSSProperties, ReactNode } from "react";

import styles from "./Skeleton.module.css";

/**
 * 글 한 줄이 앉을 자리.
 *
 * 폭과 높이는 부르는 쪽이 준다 — 실제로 그 자리에 오는 글의 크기를 알고 있는
 * 것은 화면이지 이 부품이 아니다.
 *
 * 폭을 주지 않으면 칸을 채운다. 다만 가로로 늘어선 자리에서는 폭 100%가 옆
 * 것을 칸 밖으로 밀어내므로, 그런 자리에서는 `grow`로 "남은 만큼"이라고
 * 적어 준다 — 세로로 쌓인 자리에서 같은 규칙을 쓰면 막대가 위아래로 늘어난다.
 */
export function Skel({
  w,
  h = 13,
  radius = 5,
  circle = false,
  grow = false,
  className,
  style,
}: {
  w?: number | string | undefined;
  h?: number | string | undefined;
  radius?: number | string | undefined;
  /** 아바타·아이콘 자리. `w`만 주면 정원이 된다. */
  circle?: boolean | undefined;
  /** 가로로 늘어선 칸에서 남은 폭을 차지한다. */
  grow?: boolean | undefined;
  className?: string | undefined;
  style?: CSSProperties | undefined;
}) {
  const size = circle ? (w ?? h) : undefined;
  return (
    <span
      aria-hidden="true"
      className={`${styles.bar} ex-anim-shimmer${className ? ` ${className}` : ""}`}
      style={{
        display: "block",
        width: circle ? size : (w ?? "100%"),
        height: circle ? size : h,
        borderRadius: circle ? "50%" : radius,
        ...(grow ? { flex: "1 1 0%", width: "auto", minWidth: 0 } : {}),
        ...style,
      }}
    />
  );
}

/** 테두리는 진짜로 그리고 속만 비운 카드 — 목록 한 줄처럼 윤곽이 뚜렷한 자리. */
export function SkelCard({
  h,
  radius = 10,
  className,
  children,
  style,
}: {
  h?: number | string | undefined;
  radius?: number | string | undefined;
  className?: string | undefined;
  children?: ReactNode;
  style?: CSSProperties | undefined;
}) {
  return (
    <div
      aria-hidden="true"
      className={`${styles.frame}${className ? ` ${className}` : ""}`}
      style={{ height: h, borderRadius: radius, ...style }}
    >
      {children}
    </div>
  );
}

/**
 * 기다리는 구간 하나를 감싼다.
 *
 * 막대는 전부 `aria-hidden`이라 읽는 기계에는 아무것도 남지 않는다. 사라진
 * 만큼을 여기서 한 번 말한다 — 구간마다 스무 번 말하지 않는다.
 */
export function SkelRegion({
  label = "불러오는 중",
  className,
  children,
}: {
  label?: string | undefined;
  className?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="ex-sr-only">{label}</span>
      {children}
    </div>
  );
}

/** 몇 개를 놓을지만 정해 주면 되는 자리 — `key`를 매번 적지 않기 위해. */
export function skelKeys(count: number): readonly number[] {
  return Array.from({ length: count }, (_, index) => index);
}
