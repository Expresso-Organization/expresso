/**
 * 기간 글자("2024.04 — 2024.11" · "2023.03 — 현재" · "2021년 3월 ~ 2022년")를 월 단위 구간으로 읽습니다.
 * 작업 기간 차트 · 경력 기간 차트가 막대 위치를 정하고, 생성기가 차트로 그릴 수 있는지 판정할 때 함께 씁니다.
 *
 * 읽은 값은 막대의 위치와 길이에만 씁니다. 지면에 찍는 글자는 원문 조각(`startText` · `endText`)뿐입니다.
 */
export interface PeriodSpan {
  /** 시작 월(연 × 12 + 월 − 1)입니다. */
  start: number;
  /** 끝 월입니다. 시작과 같으면 한 달짜리 구간입니다. */
  end: number;
  /** "현재" · "재직 중" · "진행 중"으로 끝나 렌더 시각까지 이어진 구간입니다. */
  open: boolean;
  /** 원문의 시작 조각입니다. */
  startText: string;
  /** 원문의 끝 조각입니다. 한 시점만 적힌 기간은 시작 조각과 같습니다. */
  endText: string;
}

// 연도는 네 자리, 월은 연도 뒤에 구분자(. - / 년)와 함께 올 때만 읽습니다. "6개월"처럼 연도가 없는 글은 읽지 않습니다.
const DATE = /((?:19|20)\d{2})(?:\s*(?:[./-]|년)\s*(\d{1,2})(?!\d)\s*월?|\s*년)?/g;
const OPEN = /현재|재직\s*중|진행\s*중|present|now/i;

const monthOf = (date: Date) => date.getUTCFullYear() * 12 + date.getUTCMonth();

export function parsePeriod(text: string | undefined, now: Date): PeriodSpan | null {
  if (!text) return null;
  const dates = [...text.matchAll(DATE)].slice(0, 2).map((match) => {
    const year = Number(match[1]);
    const month = match[2] === undefined ? null : Number(match[2]);
    return { year, month, text: match[0].trim(), index: match.index ?? 0 };
  });
  const [first, second] = dates;
  if (!first || dates.some((date) => date.month !== null && (date.month < 1 || date.month > 12))) return null;
  const start = first.year * 12 + (first.month ?? 1) - 1;
  const open = !second && OPEN.exec(text.slice(first.index + first.text.length));
  if (open) {
    const end = Math.max(start, monthOf(now));
    return { start, end, open: true, startText: first.text, endText: open[0] };
  }
  // 끝이 연도만이면 그해 12월까지, 한 시점만 적힌 연도는 그해 전체입니다.
  const last = second ?? first;
  const end = last.year * 12 + (last.month ?? 12) - 1;
  if (end < start) return null;
  return { start, end, open: false, startText: first.text, endText: last.text };
}

/** 기간 글자 중 읽을 수 있는 개수입니다. 차트는 두 개 이상일 때만 그립니다. */
export function readablePeriods(texts: readonly (string | undefined)[], now: Date): number {
  return texts.filter((text) => parsePeriod(text, now)).length;
}
