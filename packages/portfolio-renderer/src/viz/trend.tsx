import type { CSSProperties } from "react";
import { metricNumber, metricUnit, trendReady, type StructuredSeries } from "@expresso/contracts";

export interface TrendScale {
  /** percent는 0–100% 높이, relative는 가장 큰 값을 꼭대기로 둔 비율입니다. 둘 다 바닥은 0입니다. */
  mode: "percent" | "relative";
  /** 점마다 가로 위치(0–100)입니다. 점 n개를 n칸의 가운데에 고르게 둡니다. */
  xs: number[];
  /** 점마다 높이(0–100)입니다. */
  ys: number[];
}

/** 소수 둘째 자리까지. SVG 좌표가 길어지지 않게 합니다. */
const round = (value: number) => Math.round(value * 100) / 100;

/**
 * 나열을 추이 차트로 그릴 수 있으면(`trendReady`) 점의 위치를 돌려줍니다.
 * 가로 위치는 순서로만 정합니다. 점 이름("2024.01", "1단계")에서 간격을 계산하지 않습니다.
 */
export function trendScale(series: StructuredSeries | undefined): TrendScale | null {
  if (!series || !trendReady(series)) return null;
  const values = series.points.map((point) => metricNumber(point.value)!);
  const percent = metricUnit(series.points[0]!.value) === "%";
  const top = percent ? 100 : Math.max(...values);
  if (top <= 0) return null;
  const count = values.length;
  return {
    mode: percent ? "percent" : "relative",
    xs: values.map((_, index) => round(((index + 0.5) / count) * 100)),
    ys: values.map((value) => round(Math.min(100, Math.max(0, (value / top) * 100)))),
  };
}

/**
 * 추이 차트: 한 수치의 나열을 순서대로 이은 꺾은선과 그 아래 면입니다.
 * 선과 면은 글자 없는 SVG이고, 점 · 값 · 점 이름은 HTML이라 좁은 폭에서도 본문 크기 그대로입니다.
 * 눈금 · 증감률처럼 렌더러가 계산한 숫자는 그리지 않습니다. 지면의 숫자는 받은 값 글자뿐입니다.
 */
export function Trend({ series }: { series: StructuredSeries | undefined }) {
  const scale = trendScale(series);
  if (!series || !scale) return null;
  const line = scale.xs.map((x, index) => `${x},${round(100 - scale.ys[index]!)}`).join(" ");
  const area = `M${scale.xs[0]},100 L${line.replaceAll(" ", " L")} L${scale.xs.at(-1)},100 Z`;
  const named = series.points.some((point) => point.label);
  return (
    <figure className="xp-trend" data-trend={scale.mode} {...(named ? { "data-named": "" } : {})} style={{ "--n": series.points.length } as CSSProperties}>
      <figcaption className="xp-trend-label">{series.label}</figcaption>
      <div className="xp-trend-plot">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <path className="xp-trend-area" d={area} />
          <polyline className="xp-trend-line" points={line} vectorEffect="non-scaling-stroke" />
        </svg>
        <ol className="xp-trend-points">
          {series.points.map((point, index) => (
            <li key={index} style={{ "--h": `${scale.ys[index]}%` } as CSSProperties}>
              <span className="xp-trend-dot" aria-hidden="true" />
              <strong className="xp-trend-value">{point.value}</strong>
              {point.label ? <span className="xp-small xp-trend-at">{point.label}</span> : null}
            </li>
          ))}
        </ol>
      </div>
    </figure>
  );
}
