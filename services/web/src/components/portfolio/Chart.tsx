import type { PortfolioChart } from "@expresso/contracts";

/**
 * 지면 위의 그림.
 *
 * **색을 새로 만들지 않는다.** 전부 `currentColor`와 그 농도로 그린다 — 블록에
 * `text-accent`가 붙으면 강조색으로, `text-ink`면 본문색으로 선다. 팔레트가
 * 지면마다 다른데 그림만 제 색을 들고 있으면 그 지면의 그림이 아니게 된다.
 *
 * 크기도 지면이 정한다. 뷰박스만 두고 폭은 100%라, 카드에 넣으면 카드 폭에
 * 맞고 격자 한 칸에 넣으면 그 칸에 맞는다.
 */

const FADE = [1, 0.72, 0.54, 0.4, 0.3, 0.24, 0.19, 0.15];

function format(value: number, unit?: string): string {
  const text = Number.isInteger(value) ? value.toLocaleString("ko-KR") : String(value);
  return unit ? `${text}${unit}` : text;
}

/** 그림 하나를 한 줄로 읽어 준다. 스크린 리더가 이 문장을 읽는다. */
function describe(chart: PortfolioChart): string {
  const points = chart.points
    .map(({ label, value }) => `${label} ${format(value, chart.unit)}`)
    .join(", ");
  return `${chart.caption}: ${points}`;
}

export function ChartView({ chart }: { chart: PortfolioChart }) {
  const label = describe(chart);
  return (
    <>
      <div role="img" aria-label={label}>
        {chart.visualization === "bar" ? <Bars chart={chart} /> : null}
        {chart.visualization === "donut" ? <Donut chart={chart} /> : null}
        {chart.visualization === "gauge" ? <Gauge chart={chart} /> : null}
        {chart.visualization === "spark" ? <Spark chart={chart} /> : null}
      </div>
      <p className="text-step-1 font-body opacity-60">{chart.caption}</p>
    </>
  );
}

/**
 * 견주기. 가로 막대다 — 세로 막대는 한국어 라벨을 눕히거나 자르게 되고,
 * 그러면 읽히라고 그린 그림이 안 읽힌다.
 */
function Bars({ chart }: { chart: PortfolioChart }) {
  const top = Math.max(...chart.points.map(({ value }) => Math.abs(value)), 1);
  return (
    <div className="grid gap-2">
      {chart.points.map((point, index) => (
        <div key={point.label} className="grid gap-1">
          <div className="flex items-baseline justify-between gap-2 text-step-1 font-body">
            <span className="min-w-0 truncate opacity-70">{point.label}</span>
            <span className="tabular-nums font-medium">{format(point.value, chart.unit)}</span>
          </div>
          <div className="h-2 w-full rounded-full bg-ink/5 overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max((Math.abs(point.value) / top) * 100, 1.5)}%`,
                background: "currentColor",
                opacity: FADE[index] ?? 0.15,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/** 나눠 담기. 가운데를 비워 두면 그 자리에 합계를 적을 수 있다. */
function Donut({ chart }: { chart: PortfolioChart }) {
  const total = chart.points.reduce((sum, { value }) => sum + Math.abs(value), 0) || 1;
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 100 100" className="w-24 h-24 shrink-0" aria-hidden="true">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="currentColor" strokeWidth="12" opacity="0.08" />
        {chart.points.map((point, index) => {
          const share = Math.abs(point.value) / total;
          const dash = share * circumference;
          const element = (
            <circle
              key={point.label}
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth="12"
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
              opacity={FADE[index] ?? 0.15}
              transform="rotate(-90 50 50)"
            />
          );
          offset += dash;
          return element;
        })}
      </svg>
      <ul className="grid gap-1 min-w-0">
        {chart.points.map((point, index) => (
          <li key={point.label} className="flex items-center gap-2 text-step-1 font-body">
            <span
              className="size-2 rounded-full shrink-0"
              style={{ background: "currentColor", opacity: FADE[index] ?? 0.15 }}
            />
            <span className="min-w-0 truncate opacity-70">{point.label}</span>
            <span className="tabular-nums font-medium">{format(point.value, chart.unit)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 얼마나 찼나. 값 하나와 그 값이 놓인 자리를 함께 보인다. */
function Gauge({ chart }: { chart: PortfolioChart }) {
  const point = chart.points[0];
  const max = chart.max ?? 1;
  if (!point) return null;
  const share = Math.min(Math.max(point.value / max, 0), 1);
  // 위가 트인 반원. 양 끝이 240°를 덮는다.
  const sweep = 240;
  const radius = 40;
  const arc = (fraction: number) => {
    const start = 150;
    const end = start + sweep * fraction;
    const at = (angle: number) => {
      const radians = (angle * Math.PI) / 180;
      return `${(50 + radius * Math.cos(radians)).toFixed(2)} ${(50 + radius * Math.sin(radians)).toFixed(2)}`;
    };
    return `M ${at(start)} A ${radius} ${radius} 0 ${sweep * fraction > 180 ? 1 : 0} 1 ${at(end)}`;
  };

  return (
    <div className="grid justify-items-center gap-1">
      <svg viewBox="0 0 100 88" className="w-32 h-28" aria-hidden="true">
        <path d={arc(1)} fill="none" stroke="currentColor" strokeWidth="9" strokeLinecap="round" opacity="0.1" />
        <path d={arc(share)} fill="none" stroke="currentColor" strokeWidth="9" strokeLinecap="round" />
        <text
          x="50"
          y="56"
          textAnchor="middle"
          fill="currentColor"
          style={{ font: "600 20px var(--pf-display)" }}
        >
          {format(point.value, chart.unit)}
        </text>
      </svg>
      <span className="text-step-1 font-body opacity-70">
        {point.label} · {format(max, chart.unit)} 중
      </span>
    </div>
  );
}

/** 흐름. 축도 눈금도 없다 — 모양만 남기고 값은 양 끝에 적는다. */
function Spark({ chart }: { chart: PortfolioChart }) {
  const values = chart.points.map(({ value }) => value);
  const top = Math.max(...values);
  const bottom = Math.min(...values);
  const span = top - bottom || 1;
  const step = 100 / Math.max(chart.points.length - 1, 1);
  const points = values
    .map((value, index) => `${(index * step).toFixed(2)},${(28 - ((value - bottom) / span) * 24).toFixed(2)}`)
    .join(" ");
  const first = chart.points[0];
  const last = chart.points[chart.points.length - 1];

  return (
    <div className="grid gap-1">
      <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="w-full h-12" aria-hidden="true">
        <polyline
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="flex items-baseline justify-between text-step-1 font-body opacity-70">
        <span>{first ? `${first.label} ${format(first.value, chart.unit)}` : ""}</span>
        <span className="font-medium opacity-100">
          {last ? `${last.label} ${format(last.value, chart.unit)}` : ""}
        </span>
      </div>
    </div>
  );
}
