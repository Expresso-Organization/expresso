/** 지면에 구역이 하나씩 올라오는 주기. 사용자가 정한 값이다(2026-10-27 "1.5초 주기로 한번씩 다음 섹션으로"). */
export const FEED_STEP_MS = 1_500;

/**
 * 지면 안을 한 번 올리는 데 쓰는 시간. 1.5초 주기에서 머무는 시간(0.9초)이 움직이는 시간보다 길어야 카드가 멈춘
 * 것으로 읽히고, 그 사이에 새 구역의 제목을 읽을 수 있다.
 */
export const FEED_MOVE_MS = 600;

export interface FeedGroup {
  /** 구역의 위쪽 끝. 칸 안 스크롤 좌표다. */
  top: number;
  /** 구역 안 카드 줄의 위 · 아래 끝. */
  rows: { top: number; bottom: number }[];
}

/**
 * 멈출 자리. 구역마다 한 번 멈추되, 한 구역이 칸보다 길면 그 안에서도 멈춘다 — 앞서 멈춘 자리에서 끝까지
 * 보이지 않는 카드 줄이 있으면 그 줄의 위에서 한 번 더 선다. 그래서 한 바퀴 동안 모든 카드가 한 번은 다
 * 보인다.
 *
 * 자리는 오름차순이고 중복이 없다. 구역 사이가 칸보다 좁아 같은 자리가 나오면 하나만 남는다.
 */
export function feedSnaps(groups: readonly FeedGroup[], visible: number): number[] {
  const snaps: number[] = [];
  const push = (value: number) => {
    const at = Math.max(0, Math.round(value));
    if (snaps.length === 0 || at > snaps[snaps.length - 1]!) snaps.push(at);
  };
  for (const group of groups) {
    push(group.top);
    for (const row of group.rows) {
      const shown = snaps[snaps.length - 1] ?? 0;
      if (row.bottom > shown + visible) push(row.top);
    }
  }
  return snaps;
}

/** 지금 자리 다음에 멈출 곳. 마지막 자리를 지났으면 `fallback`이다. */
export function nextSnap(snaps: readonly number[], position: number, fallback: number): number {
  return snaps.find((snap) => snap > position + 1) ?? fallback;
}

/**
 * CSS `cubic-bezier()`와 같은 곡선. 시간 비율 t(0~1)를 넣으면 진행 비율을 준다. y가 1을 넘는 곡선이면 목표를
 * 조금 지나쳤다가 돌아와 앉는다.
 *
 * x(s) = t를 뉴턴법으로 풀고, 기울기가 너무 작으면 이분법으로 넘어간다(브라우저 구현과 같은 방식).
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const ax = 1 + 3 * x1 - 3 * x2;
  const bx = 3 * x2 - 6 * x1;
  const cx = 3 * x1;
  const ay = 1 + 3 * y1 - 3 * y2;
  const by = 3 * y2 - 6 * y1;
  const cy = 3 * y1;
  const x = (s: number) => ((ax * s + bx) * s + cx) * s;
  const y = (s: number) => ((ay * s + by) * s + cy) * s;
  const dx = (s: number) => (3 * ax * s + 2 * bx) * s + cx;
  return (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let s = t;
    for (let i = 0; i < 8; i += 1) {
      const error = x(s) - t;
      if (Math.abs(error) < 1e-6) return y(s);
      const slope = dx(s);
      if (Math.abs(slope) < 1e-6) break;
      s -= error / slope;
    }
    let low = 0;
    let high = 1;
    s = t;
    while (high - low > 1e-6) {
      if (x(s) < t) low = s;
      else high = s;
      s = (low + high) / 2;
    }
    return y(s);
  };
}

/** `200ms cubic-bezier(0.34, 1.4, 0.64, 1)` 같은 토큰 값에서 곡선만 꺼낸다. 못 읽으면 null. */
export function parseCubicBezier(value: string): [number, number, number, number] | null {
  const match = /cubic-bezier\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/.exec(value);
  if (!match) return null;
  const numbers = match.slice(1).map(Number) as [number, number, number, number];
  return numbers.every(Number.isFinite) ? numbers : null;
}

/**
 * `700ms cubic-bezier(…)` 같은 움직임 값을 Web Animations API가 받는 꼴로. 시간을 못 읽으면 0이고, 그러면 옮기지
 * 않고 바로 선다.
 */
export function parseMotion(value: string): { duration: number; easing: string } {
  const text = value.trim();
  const time = /^(-?[\d.]+)(ms|s)\b/.exec(text);
  const duration = time ? Number(time[1]) * (time[2] === "s" ? 1000 : 1) : 0;
  const curve = /cubic-bezier\([^)]*\)|ease(?:-in-out|-in|-out)?|linear/.exec(text);
  return { duration: Number.isFinite(duration) ? duration : 0, easing: curve?.[0] ?? "ease" };
}
