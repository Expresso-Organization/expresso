import type { CSSProperties } from "react";
import type { StructuredSection } from "@expresso/contracts";

type Metric = NonNullable<StructuredSection["metrics"]>[number];

const LEADING_NUMBER = /^[+\-−~≈]?\s?(\d+(?:\.\d+)?)/;

/**
 * "3.8초" · "420KB" · "1,200만 건"처럼 숫자로 시작하는 값에서 그 숫자를 읽습니다. 숫자로 시작하지 않으면 null입니다.
 * 글 중간의 숫자는 읽지 않습니다. 청사진의 자리 표지(`⟦12⟧`)나 "약 3배" 같은 값에서 엉뚱한 비율이 나오지 않습니다.
 */
export function metricNumber(value: string): number | null {
  const match = value.replace(/,/g, "").match(LEADING_NUMBER);
  return match ? Number(match[1]) : null;
}

/** 값에서 앞자리 숫자를 뗀 나머지(단위)입니다. "1,200만 건" → "만 건", "80%" → "%". */
function metricUnit(value: string): string {
  return value.replace(/,/g, "").replace(LEADING_NUMBER, "").trim();
}

export interface BarScale {
  /** percent는 0–100% 눈금, relative는 가장 큰 값을 100%로 둔 비율입니다. */
  mode: "percent" | "relative";
  /** 수치마다 막대 너비(CSS 퍼센트)입니다. */
  widths: string[];
}

/**
 * 수치 목록을 막대로 비교할 수 있으면 막대 너비를 돌려줍니다. 수치가 두 개 이상이고, 모두 숫자로 시작하고, 단위가 같아야 합니다.
 * 단위가 다른 수치("1.9초"와 "180KB")는 길이를 비교할 수 없어 null입니다.
 */
export function barScale(metrics: readonly Metric[]): BarScale | null {
  if (metrics.length < 2) return null;
  const numbers = metrics.map((metric) => metricNumber(metric.value));
  const units = new Set(metrics.map((metric) => metricUnit(metric.value)));
  if (numbers.some((value) => value === null) || units.size !== 1) return null;
  const values = numbers as number[];
  if ([...units][0] === "%")
    return { mode: "percent", widths: values.map((value) => `${Math.min(100, Math.max(1, value))}%`) };
  const top = Math.max(...values);
  if (top <= 0) return null;
  return { mode: "relative", widths: values.map((value) => `${Math.max(4, Math.round((value / top) * 100))}%`) };
}

/**
 * 가로 막대 차트: 수치마다 이름 · 막대 · 값 글자 한 줄입니다. 값은 받은 글자 그대로 두고, 막대는 길이로만 비교합니다.
 * 비교할 수 없는 수치는 막대 없이 이름과 값만 그립니다(`data-bars="neutral"`).
 */
export function Bars({ metrics }: { metrics: readonly Metric[] }) {
  const scale = barScale(metrics);
  return (
    <ul className="xp-barlist" data-bars={scale?.mode ?? "neutral"}>
      {metrics.map((metric, index) => (
        <li key={index}>
          <span className="xp-barlist-label">{metric.label}</span>
          <span className="xp-barlist-track" aria-hidden="true">
            {scale ? <span className="xp-barlist-fill" style={{ "--w": scale.widths[index] } as CSSProperties} /> : null}
          </span>
          <strong className="xp-barlist-value">{metric.value}</strong>
          {metric.before || metric.note ? (
            <span className="xp-small xp-barlist-note">{[metric.before ? `이전 ${metric.before}` : "", metric.note ?? ""].filter(Boolean).join(" · ")}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
