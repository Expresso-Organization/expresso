import type { CSSProperties } from "react";
import { comparableMetrics, metricNumber, metricUnit, type StructuredSection } from "@expresso/contracts";

type Metric = NonNullable<StructuredSection["metrics"]>[number];

export { metricNumber };

export interface BarScale {
  /** percent는 0–100% 눈금, relative는 가장 큰 값을 100%로 둔 비율입니다. */
  mode: "percent" | "relative";
  /** 수치마다 막대 너비(CSS 퍼센트)입니다. */
  widths: string[];
}

/**
 * 수치 목록을 막대로 비교할 수 있으면(`comparableMetrics`) 막대 너비를 돌려줍니다.
 * 단위가 다른 수치("1.9초"와 "180KB")는 길이를 비교할 수 없어 null입니다.
 */
export function barScale(metrics: readonly Metric[]): BarScale | null {
  if (!comparableMetrics(metrics)) return null;
  const values = metrics.map((metric) => metricNumber(metric.value)!);
  if (metricUnit(metrics[0]!.value) === "%")
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
