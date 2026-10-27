/** 생성을 시작한 뒤 브루잉 그림을 보이는 시간. 사용자가 정한 값이다(2026-10-27 "브루잉 화면을 10초간 띄우고"). */
export const BREWING_MS = 10_000;

/**
 * 브루잉이 얼마나 남았는가.
 *
 * 시작 시각과 지금을 **같은 시계**로 잰다 — 서버가 잡을 만든 시각을 서버가 그리는 순간과 견준다.
 * 브라우저 시계와 섞으면 둘이 어긋난 만큼 브루잉이 길어지거나 건너뛰어진다.
 */
export function brewingLeftMs(startedAt: string, now: number): number {
  const elapsed = now - Date.parse(startedAt);
  if (!Number.isFinite(elapsed)) return 0;
  return Math.min(BREWING_MS, Math.max(0, BREWING_MS - elapsed));
}
