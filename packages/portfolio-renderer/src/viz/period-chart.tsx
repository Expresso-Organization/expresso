import type { CSSProperties, ReactNode } from "react";
import { parsePeriod } from "./period.js";

export interface PeriodRow {
  key: string;
  /** 막대 위치를 읽는 기간 글자입니다. 글자 자체는 `text` 안에서 보입니다. */
  period: string | undefined;
  /** 행 왼쪽의 글(제목 · 기간 · 설명)입니다. */
  text: ReactNode;
  /** 행 전체를 누르면 가는 곳입니다. */
  href?: string | undefined;
}

/**
 * 기간 차트: 행마다 왼쪽에 글, 오른쪽에 한 시간축 위의 막대를 둡니다. 시간축 양 끝에는 가장 이른 시작과 가장 늦은 끝의
 * 원문 조각만 적고, 눈금 · 개월 수처럼 렌더러가 만든 숫자는 적지 않습니다. 기간을 두 개 이상 읽지 못하면 null을 돌려주고
 * 부르는 쪽이 목록으로 그립니다. 기간을 읽지 못한 행은 막대 없이 글만 둡니다.
 */
export function PeriodChart({ rows, now }: { rows: readonly PeriodRow[]; now: Date }) {
  const spans = rows.map((row) => parsePeriod(row.period, now));
  const read = spans.flatMap((span) => (span ? [span] : []));
  if (read.length < 2) return null;
  const first = read.reduce((a, b) => (b.start < a.start ? b : a));
  const last = read.reduce((a, b) => (b.end > a.end || (b.end === a.end && b.open) ? b : a));
  // 끝 월을 포함하도록 한 달을 더합니다. 한 달짜리 구간도 막대가 보입니다.
  const total = last.end + 1 - first.start;
  const percent = (value: number) => `${Math.round((value / total) * 1000) / 10}%`;
  return (
    <div className="xp-period">
      <ol className="xp-period-rows">
        {rows.map((row, index) => {
          const span = spans[index];
          const bar = span ? (
            <span
              className="xp-period-bar"
              {...(span.open ? { "data-open": "" } : {})}
              style={{ "--l": percent(span.start - first.start), "--w": percent(span.end + 1 - span.start) } as CSSProperties}
            />
          ) : null;
          const inner = (
            <>
              <span className="xp-period-text">{row.text}</span>
              <span className="xp-period-track" aria-hidden="true">
                {bar}
              </span>
            </>
          );
          return (
            <li key={row.key}>
              {row.href ? (
                <a className="xp-period-row" href={row.href}>
                  {inner}
                </a>
              ) : (
                <div className="xp-period-row">{inner}</div>
              )}
            </li>
          );
        })}
      </ol>
      <p className="xp-period-axis xp-small" aria-hidden="true">
        <span>{first.startText}</span>
        <span>{last.endText}</span>
      </p>
    </div>
  );
}
