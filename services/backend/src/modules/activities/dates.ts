const DAY_MS = 86_400_000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1_000;

/** 서울 날짜(`YYYY-MM-DD`). 마감일은 날짜로만 다룬다. */
export function seoulDate(at: Date): string {
  return new Date(at.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 서울 날짜 `on`까지 남은 날. 지났으면 음수다. */
export function daysUntil(on: string, at: Date): number {
  return Math.round((Date.parse(`${on}T00:00:00Z`) - Date.parse(`${seoulDate(at)}T00:00:00Z`)) / DAY_MS);
}

/** 날짜 `on`에서 `days`일 뒤의 날짜. */
export function addDays(on: string, days: number): string {
  return new Date(Date.parse(`${on}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** 그 달의 마지막 날. `2026-12` → `2026-12-31`. */
export function lastDayOfMonth(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

/** 연 · 월 · 일이 실제 있는 날짜면 `YYYY-MM-DD`, 아니면 null. */
export function isoDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

/** 밀리초 시각의 서울 날짜. */
export function seoulDateOfMs(ms: number): string {
  return seoulDate(new Date(ms));
}
