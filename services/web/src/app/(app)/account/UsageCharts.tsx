import type { MonthlyUsage, UsageDay, UsageGroup } from "@expresso/contracts";

import { contractLabel, TOKEN_KINDS } from "@/lib/usage-copy";

import styles from "./page.module.css";

/** 기능별 · 모델별에서 이름을 세우는 줄 수. 나머지는 한 줄로 묶는다. */
const RANK_ROWS = 6;
const SEGMENT_CLASS = [styles.seg1, styles.seg2, styles.seg3];

/** 토큰을 크레딧으로. 한도와 같은 단위로 읽게 한다. */
function credits(tokens: number, perCredit: number): string {
  const value = tokens / perCredit;
  if (value === 0) return "0";
  if (value < 0.1) return "0.1 미만";
  return value.toLocaleString("ko-KR", { maximumFractionDigits: 1 });
}

/** 축 위쪽 끝. 1 · 2 · 5 단위로 올린다. */
function niceCeil(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 5, 10].find((candidate) => candidate * magnitude >= value)!;
  return step * magnitude;
}

function dayTotal(day: UsageDay): number {
  return TOKEN_KINDS.reduce((sum, { key }) => sum + day[key], 0);
}

function shortDate(date: string): string {
  return date.slice(5).replace("-", ".");
}

export function UsageCharts({ usage }: { usage: MonthlyUsage }) {
  return (
    <>
      <DailyChart usage={usage} />
      <div className={styles.rankGrid}>
        <Ranking title="기능별" rows={usage.byContract} label={contractLabel} perCredit={usage.tokensPerCredit} />
        <Ranking title="모델별" rows={usage.byModel} label={(key) => key} perCredit={usage.tokensPerCredit} modelNames />
      </div>
    </>
  );
}

function DailyChart({ usage }: { usage: MonthlyUsage }) {
  const perCredit = usage.tokensPerCredit;
  const top = niceCeil(Math.max(...usage.daily.map(dayTotal)) / perCredit);
  const days = usage.daily;
  const dateMarks = [0, Math.floor((days.length - 1) / 2), days.length - 1].filter(
    (index, position, all) => all.indexOf(index) === position,
  );

  return (
    <div className={styles.chartCard}>
      <div className={styles.chartHead}>
        <span className={styles.chartTitle}>날짜별</span>
        <span className={styles.chartUnit}>크레딧</span>
      </div>
      {/* 색만으로 계열을 가르지 않는다 — 범례가 이름과 이번 달 합계를 함께 적는다. */}
      <div className={styles.legend}>
        {TOKEN_KINDS.map((kind, index) => (
          <span key={kind.key} className={styles.legendItem}>
            <span className={`${styles.legendSwatch} ${SEGMENT_CLASS[index]}`} />
            {kind.label}
            <span className={styles.legendValue}>{credits(usage.tokens[kind.key], perCredit)}</span>
          </span>
        ))}
      </div>
      <div className={styles.plot}>
        <div className={styles.plotAxis} aria-hidden="true">
          <span>{top.toLocaleString("ko-KR")}</span>
          <span>{(top / 2).toLocaleString("ko-KR")}</span>
          <span>0</span>
        </div>
        <div className={styles.dayColumns}>
          {days.map((day, index) => {
            const total = dayTotal(day);
            return (
              <div
                key={day.date}
                className={styles.dayColumn}
                tabIndex={0}
                aria-label={`${shortDate(day.date)} · ${credits(total, perCredit)} 크레딧 · 호출 ${day.calls}회`}
              >
                {total > 0 ? (
                  <div className={styles.dayStack} style={{ height: `${(total / (top * perCredit)) * 100}%` }}>
                    {TOKEN_KINDS.map((kind, kindIndex) =>
                      // 막대 안에서 1%가 안 되는 조각은 그리지 않는다. 값은 범례와 말풍선이 적는다.
                      day[kind.key] / total >= 0.01 ? (
                        <span
                          key={kind.key}
                          className={`${styles.daySegment} ${SEGMENT_CLASS[kindIndex]}`}
                          style={{ flexGrow: day[kind.key] }}
                        />
                      ) : null,
                    )}
                  </div>
                ) : null}
                <div className={`${styles.dayTip} ${index > (days.length * 2) / 3 ? styles.dayTipEnd : ""}`}>
                  <div className={styles.dayTipHead}>
                    {shortDate(day.date)}
                    <span>{credits(total, perCredit)}</span>
                  </div>
                  {TOKEN_KINDS.map((kind, kindIndex) => (
                    <div key={kind.key} className={styles.dayTipRow}>
                      <span className={`${styles.legendSwatch} ${SEGMENT_CLASS[kindIndex]}`} />
                      {kind.label}
                      <span>{credits(day[kind.key], perCredit)}</span>
                    </div>
                  ))}
                  <div className={styles.dayTipRow}>
                    호출
                    <span>{day.calls}회</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className={styles.plotDates} aria-hidden="true">
        {dateMarks.map((index) => (
          <span key={index}>{shortDate(days[index]!.date)}</span>
        ))}
      </div>
    </div>
  );
}

function Ranking({
  title,
  rows,
  label,
  perCredit,
  modelNames = false,
}: {
  title: string;
  rows: UsageGroup[];
  label: (key: string) => string;
  perCredit: number;
  modelNames?: boolean;
}) {
  const shown = rows.slice(0, RANK_ROWS);
  const rest = rows.slice(RANK_ROWS);
  const lines = rest.length > 0
    ? [...shown, { key: `그 밖 ${rest.length}개`, totalTokens: rest.reduce((sum, row) => sum + row.totalTokens, 0), calls: rest.reduce((sum, row) => sum + row.calls, 0), folded: true }]
    : shown;
  const top = Math.max(...lines.map(({ totalTokens }) => totalTokens), 1);

  return (
    <div className={styles.chartCard}>
      <div className={styles.chartHead}>
        <span className={styles.chartTitle}>{title}</span>
        <span className={styles.chartUnit}>크레딧</span>
      </div>
      <div className={styles.rankRows}>
        {lines.map((row) => {
          const name = "folded" in row ? row.key : label(row.key);
          return (
            <div key={row.key} className={styles.rankRow} title={`${name} · 호출 ${row.calls}회`}>
              <span className={`${styles.rankLabel} ${modelNames && !("folded" in row) ? styles.rankLabelModel : ""}`}>
                {name}
              </span>
              <span className={styles.rankTrack}>
                <span className={styles.rankFill} style={{ width: `${(row.totalTokens / top) * 100}%` }} />
              </span>
              <span className={styles.rankValue}>{credits(row.totalTokens, perCredit)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
