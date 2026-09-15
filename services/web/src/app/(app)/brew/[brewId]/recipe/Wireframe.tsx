import type { RecipeV2Presentation } from "@expresso/contracts";
import type { CSSProperties } from "react";

import styles from "./Wireframe.module.css";

/**
 * 보여주는 형식의 와이어프레임.
 *
 * 형식마다 그림 하나 — 파란 박스로 **어떤 UI 로 보일지**만 그린다. 실제 디자인의
 * 색 · 글꼴은 없다. 형식은 디자인과 무관하게 고르고, 그 형식을 디자인 안에서
 * 조판하는 일은 03 이다.
 *
 * 박스는 등장 순서(`--i`)를 갖는다. 카드가 서거나 손이 올라오면 그 순서로 다시
 * 들어온다(`Wireframe.module.css`). `prefers-reduced-motion` 이면 멈춘 그림이다.
 */

/** 박스의 종류. 채우는 색과 움직임이 다르다. */
type Kind = "solid" | "light" | "image" | "number" | "bar" | "dot" | "hole" | "chip" | "button";

type Block =
  | { k: Exclude<Kind, "dot" | "hole">; x: number; y: number; w: number; h: number }
  | { k: "dot" | "hole"; cx: number; cy: number; r: number };

const W = 120;
const H = 76;

function box(k: Exclude<Kind, "dot" | "hole">, x: number, y: number, w: number, h: number): Block {
  return { k, x, y, w, h };
}
function dot(cx: number, cy: number, r = 3): Block {
  return { k: "dot", cx, cy, r };
}
/** 바탕색 원 — 링(게이지)의 가운데를 판다. */
function hole(cx: number, cy: number, r: number): Block {
  return { k: "hole", cx, cy, r };
}
/** 글줄 몇 개. 마지막 줄은 짧다. */
function lines(x: number, y: number, w: number, n: number, gap = 6): Block[] {
  return Array.from({ length: n }, (_, i) => box("light", x, y + i * gap, i === n - 1 ? Math.round(w * 0.6) : w, 3));
}
function chips(x: number, y: number, widths: number[], gap = 4, h = 6): Block[] {
  let at = x;
  return widths.map((w) => { const c = box("chip", at, y, w, h); at += w + gap; return c; });
}

const FIGURE: Record<RecipeV2Presentation, Block[]> = {
  "hero-big-statement": [box("solid", 12, 20, 96, 11), box("solid", 12, 35, 68, 11), ...lines(12, 54, 50, 1)],
  "hero-split": [box("solid", 10, 18, 46, 9), box("solid", 10, 30, 36, 9), ...lines(10, 46, 42, 2), box("image", 66, 12, 44, 52)],
  "hero-metric": [
    box("solid", 10, 12, 62, 7),
    box("number", 10, 30, 26, 14), box("light", 10, 48, 20, 3),
    box("number", 46, 30, 26, 14), box("light", 46, 48, 20, 3),
    box("number", 82, 30, 26, 14), box("light", 82, 48, 20, 3),
  ],
  "hero-image": [box("image", 8, 8, 104, 60), box("solid", 16, 46, 56, 9), box("light", 16, 58, 36, 3)],
  "hero-profile-card": [dot(30, 38, 14), box("solid", 52, 24, 50, 8), ...lines(52, 38, 44, 2), ...chips(52, 54, [14, 18])],

  "project-par": [
    box("chip", 10, 14, 18, 5), ...lines(10, 24, 28, 3),
    box("chip", 46, 14, 18, 5), ...lines(46, 24, 28, 3),
    box("chip", 82, 14, 18, 5), ...lines(82, 24, 28, 3),
  ],
  "project-case-study": [box("solid", 10, 10, 60, 7), box("image", 10, 22, 100, 22), ...lines(10, 50, 100, 3)],
  "project-artifact": [box("image", 8, 8, 104, 46), box("solid", 8, 59, 40, 5), box("light", 8, 67, 60, 3)],
  "project-metric": [box("solid", 10, 12, 50, 7), box("number", 10, 26, 40, 18), ...lines(60, 28, 50, 3)],
  "project-process-timeline": [
    box("light", 10, 38, 100, 2),
    dot(20, 39), dot(50, 39), dot(80, 39), dot(106, 39),
    box("solid", 12, 24, 18, 4), box("solid", 42, 24, 18, 4), box("solid", 72, 24, 18, 4), box("solid", 98, 24, 14, 4),
    box("light", 12, 46, 14, 3), box("light", 42, 46, 14, 3), box("light", 72, 46, 14, 3), box("light", 98, 46, 12, 3),
  ],
  "project-comparison": [
    box("image", 10, 14, 28, 48), box("solid", 14, 18, 18, 5), ...lines(14, 28, 20, 2),
    box("image", 46, 14, 28, 48), box("solid", 50, 18, 18, 5), ...lines(50, 28, 20, 2),
    box("image", 82, 14, 28, 48), box("solid", 86, 18, 18, 5), ...lines(86, 28, 20, 2),
  ],

  "metric-single": [box("number", 22, 16, 76, 28), box("light", 40, 52, 40, 4)],
  "metric-before-after": [
    box("light", 14, 22, 36, 22), box("light", 20, 50, 24, 3),
    box("solid", 54, 31, 12, 4),
    box("number", 70, 22, 36, 22), box("light", 76, 50, 24, 3),
  ],
  "metric-group": [
    box("number", 14, 12, 40, 14), box("light", 14, 29, 24, 3),
    box("number", 66, 12, 40, 14), box("light", 66, 29, 24, 3),
    box("number", 14, 42, 40, 14), box("light", 14, 59, 24, 3),
    box("number", 66, 42, 40, 14), box("light", 66, 59, 24, 3),
  ],
  "metric-bars": [
    box("light", 10, 16, 14, 3), box("bar", 30, 14, 76, 7),
    box("light", 10, 30, 14, 3), box("bar", 30, 28, 52, 7),
    box("light", 10, 44, 14, 3), box("bar", 30, 42, 64, 7),
    box("light", 10, 58, 14, 3), box("bar", 30, 56, 36, 7),
  ],
  "metric-gauge": [dot(60, 42, 26), hole(60, 42, 19), box("number", 48, 36, 24, 10), box("light", 48, 50, 24, 3)],
  "metric-annotated": [box("number", 10, 14, 44, 20), box("chip", 10, 38, 20, 5), ...lines(62, 16, 48, 4)],

  "career-timeline": [
    box("light", 22, 10, 2, 56),
    dot(23, 16), box("solid", 32, 12, 50, 5), box("light", 32, 20, 40, 3),
    dot(23, 36), box("solid", 32, 32, 44, 5), box("light", 32, 40, 36, 3),
    dot(23, 56), box("solid", 32, 52, 54, 5), box("light", 32, 60, 30, 3),
  ],
  "career-by-org": [
    box("solid", 10, 12, 30, 6), ...lines(18, 22, 70, 2),
    box("solid", 10, 40, 36, 6), ...lines(18, 50, 70, 2),
  ],
  "career-role": [box("solid", 10, 12, 56, 8), ...chips(10, 24, [18, 22]), ...lines(10, 38, 100, 3)],
  "career-outcome": [
    box("number", 10, 12, 22, 10), box("light", 38, 13, 70, 3), box("light", 38, 19, 50, 3),
    box("number", 10, 34, 22, 10), box("light", 38, 35, 64, 3), box("light", 38, 41, 44, 3),
    box("number", 10, 56, 22, 10), box("light", 38, 57, 70, 3),
  ],
  "career-project-linked": [
    box("solid", 10, 14, 40, 5), box("light", 10, 22, 32, 3),
    box("solid", 10, 40, 36, 5), box("light", 10, 48, 32, 3),
    box("light", 52, 18, 14, 2), box("image", 70, 12, 40, 16),
    box("light", 52, 44, 14, 2), box("image", 70, 38, 40, 16),
  ],

  "skill-tags": [
    ...chips(10, 14, [22, 16, 26, 18]), ...chips(10, 28, [14, 24, 20, 22]),
    ...chips(10, 42, [26, 18, 16, 20]), ...chips(10, 56, [18, 22, 14]),
  ],
  "skill-categories": [
    box("solid", 10, 12, 24, 5), ...chips(10, 22, [22]), ...chips(10, 32, [16]), ...chips(10, 42, [20]),
    box("solid", 46, 12, 24, 5), ...chips(46, 22, [18]), ...chips(46, 32, [24]), ...chips(46, 42, [14]),
    box("solid", 82, 12, 24, 5), ...chips(82, 22, [20]), ...chips(82, 32, [16]), ...chips(82, 42, [22]),
  ],
  "skill-evidence": [
    box("chip", 10, 14, 22, 6), box("bar", 38, 15, 68, 4),
    box("chip", 10, 28, 18, 6), box("bar", 38, 29, 48, 4),
    box("chip", 10, 42, 26, 6), box("bar", 38, 43, 60, 4),
    box("chip", 10, 56, 20, 6), box("bar", 38, 57, 30, 4),
  ],
  "skill-project-linked": [
    box("chip", 10, 14, 26, 6), box("light", 40, 17, 16, 2), box("image", 60, 12, 50, 12),
    box("chip", 10, 32, 22, 6), box("light", 36, 35, 20, 2), box("image", 60, 30, 50, 12),
    box("chip", 10, 50, 28, 6), box("light", 42, 53, 14, 2), box("image", 60, 48, 50, 12),
  ],
  "skill-stack-table": [
    box("solid", 10, 12, 100, 6),
    box("light", 10, 24, 30, 4), box("light", 46, 24, 30, 4), box("light", 82, 24, 28, 4),
    box("light", 10, 34, 30, 4), box("light", 46, 34, 30, 4), box("light", 82, 34, 28, 4),
    box("light", 10, 44, 30, 4), box("light", 46, 44, 30, 4), box("light", 82, 44, 28, 4),
    box("light", 10, 54, 30, 4), box("light", 46, 54, 30, 4), box("light", 82, 54, 28, 4),
  ],

  "body": [box("solid", 10, 12, 50, 7), ...lines(10, 24, 100, 6)],
  "image-gallery": [
    box("image", 10, 12, 32, 24), box("image", 44, 12, 32, 24), box("image", 78, 12, 32, 24),
    box("image", 10, 40, 32, 24), box("image", 44, 40, 32, 24), box("image", 78, 40, 32, 24),
  ],
  "quote": [box("solid", 14, 14, 12, 12), box("light", 30, 20, 70, 5), box("light", 30, 30, 60, 5), box("solid", 60, 46, 40, 3)],
  "profile": [dot(28, 30, 14), box("solid", 50, 18, 40, 7), ...lines(50, 30, 50, 2), ...chips(10, 56, [20, 16, 24])],
  "contact-action": [box("solid", 24, 14, 72, 8), box("light", 36, 28, 48, 3), box("button", 38, 40, 44, 12), ...chips(42, 60, [10, 10, 10], 4, 3)],
  "footer": [box("light", 10, 20, 100, 1), box("light", 10, 30, 30, 3), ...chips(70, 30, [10, 10, 10], 4, 3), box("light", 10, 56, 40, 3)],
};

export function Wireframe({
  presentation,
  size = "card",
  animate = true,
  className,
}: {
  presentation: RecipeV2Presentation;
  /** `mini` 는 카드 머리에 서는 작은 것 — 움직이지 않는다. */
  size?: "card" | "mini";
  animate?: boolean;
  className?: string | undefined;
}) {
  const blocks = FIGURE[presentation];
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={[styles.frame, className].filter(Boolean).join(" ")}
      data-size={size}
      data-animate={animate && size === "card" ? "1" : undefined}
      aria-hidden="true"
      focusable="false"
    >
      {blocks.map((block, index) => {
        const style = { "--i": index } as CSSProperties;
        if ("cx" in block) {
          return <circle key={index} className={styles.b} data-k={block.k} cx={block.cx} cy={block.cy} r={block.r} style={style} />;
        }
        return (
          <rect
            key={index}
            className={styles.b}
            data-k={block.k}
            x={block.x}
            y={block.y}
            width={block.w}
            height={block.h}
            rx={block.k === "chip" || block.k === "button" ? block.h / 2 : 1.5}
            style={style}
          />
        );
      })}
    </svg>
  );
}
