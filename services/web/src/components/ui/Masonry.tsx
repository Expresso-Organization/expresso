"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * 높이가 저마다 다른 카드를 빈틈없이 쌓는 워터폴 그리드.
 *
 * 다음 카드를 **가장 짧은 열**에 놓는다. CSS 다단(`columns`)처럼 한 열을 위에서 아래로 다 채우지 않아,
 * 들어온 순서(예: 마감 순)가 왼쪽에서 오른쪽으로 읽힌다. 열 높이는 실제로 그려 보기 전에 `estimate`로 센다 —
 * 그림이 늦게 와도 카드 자리가 미리 정해져 쌓인 모양이 흔들리지 않는다(그림에는 가로세로를 주어 높이를 잡는다).
 *
 * 열 수는 폭에서 정한다(`minColumn` 이상인 열이 몇 개 들어가는가). `minColumn`으로 두 열이 들어가지 않는 폭이면
 * `minColumnNarrow`를 써서 휴대폰에서도 두 열이 서게 한다. 폭을 재기 전(서버 렌더 · 첫 프레임)에는 보이지 않는다.
 * 무엇을 그리는지는 모른다 — 카드는 부르는 쪽이 `render`로 준다.
 */
export function Masonry<T>({ items, keyOf, estimate, render, minColumn, minColumnNarrow = minColumn, gap, className }: {
  items: readonly T[];
  keyOf: (item: T) => string;
  /** 열 폭이 주어졌을 때 카드 높이(px)의 추정. 배치에만 쓴다. */
  estimate: (item: T, columnWidth: number) => number;
  render: (item: T) => ReactNode;
  minColumn: number;
  minColumnNarrow?: number;
  gap: number;
  className?: string | undefined;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const min = width < minColumn * 2 + gap ? minColumnNarrow : minColumn;
  const count = Math.max(1, Math.floor((width + gap) / (min + gap)));
  const columnWidth = (width - gap * (count - 1)) / count;
  const columns: T[][] = Array.from({ length: count }, () => []);
  const heights = new Array<number>(count).fill(0);
  for (const item of items) {
    const shortest = heights.indexOf(Math.min(...heights));
    columns[shortest]!.push(item);
    heights[shortest]! += estimate(item, columnWidth) + gap;
  }
  return (
    <div ref={ref} className={className} style={{ display: "flex", alignItems: "flex-start", gap, visibility: width ? "visible" : "hidden" }}>
      {columns.map((column, index) => (
        <div key={index} style={{ flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column", gap }}>
          {column.map((item) => <div key={keyOf(item)}>{render(item)}</div>)}
        </div>
      ))}
    </div>
  );
}
