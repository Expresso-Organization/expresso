/** 생성을 시작한 뒤 브루잉 그림을 보이는 시간. 사용자가 정한 값이다(2026-10-27 "브루잉 화면을 10초간 띄우고"). */
export const BREWING_MS = 10_000;

/**
 * 브루잉이 얼마나 남았는가.
 *
 * 시작 시각과 지금을 **같은 시계**로 잰다 — 서버가 잡을 만든 시각을 서버가 그리는 순간과 견준다.
 * 브라우저 시계와 섞으면 둘이 어긋난 만큼 브루잉이 길어지거나 건너뛰어진다.
 */
export function brewingLeftMs(startedAt: string, now: number): number {
  return Math.min(BREWING_MS, Math.max(0, BREWING_MS - waitedMs(startedAt, now)));
}

/** 잡을 만든 뒤 지난 시간. 시각을 못 읽으면 다 지난 것으로(무한대) 보고, 시계가 앞서면 0이다. */
export function waitedMs(startedAt: string, now: number): number {
  const elapsed = now - Date.parse(startedAt);
  return Number.isNaN(elapsed) ? Number.POSITIVE_INFINITY : Math.max(0, elapsed);
}

/**
 * 구성(레시피)이 끝나기 전에 생성을 맡겼을 때, 맡긴 뒤 구성이 끝나기까지 걸리는 시간의 중앙값.
 * 2026-11-10 운영 실측: 2026-10-27 이후 이렇게 기다린 6건이 107~248초였고 가운데가 약 151초다.
 */
export const RECIPE_WAIT_MS = 151_000;

/** 막대 값이 한 번 바뀌고 다음에 바뀌기까지의 가장 짧은 · 긴 구간. 구간 길이가 들쭉날쭉해야 멈칫거리며 찬다. */
const HOLD_MIN_MS = 300;
const HOLD_SPREAD_MS = 1_900;

/** 구간 번호마다 0~1 사이의 고정된 수. 서버와 브라우저가 같은 시각에 같은 값을 내도록 난수 대신 쓴다. */
function hash(index: number): number {
  const value = Math.sin(index * 12.9898 + 78.233) * 43_758.5453;
  return value - Math.floor(value);
}

/**
 * 브루잉 진행 막대의 값(0 이상 1 미만). 실제 진행률이 아니다 — 구성 잡은 진행 신호를 보내지 않는다.
 *
 * 생성을 맡긴 뒤 지난 시간(`waitedMs`)을 들쭉날쭉한 구간으로 끊고, 지금 구간이 시작한 시각에서
 * `1 - e^(-t/τ)`를 잰다. 구간 안에서는 값이 그대로라 막대가 멈췄다가 몇 칸씩 찬다. `τ`는 기준 시간
 * (`expectedMs`)에 값이 0.8이 되도록 잡는다 — 기준보다 오래 걸려도 막대가 끝에 닿지 않는다.
 */
export function fakeProgress(waitedMs: number, expectedMs: number): number {
  if (!(waitedMs > 0) || !(expectedMs > 0)) return 0;
  // 기준의 여섯 배가 지나면 값이 1에 0.0001도 안 남는다. 그 너머는 구간을 세지 않는다(시각을 못 읽은 무한대 포함).
  const until = Math.min(waitedMs, expectedMs * 6);
  let start = 0;
  for (let index = 0; ; index += 1) {
    const end = start + HOLD_MIN_MS + hash(index) * HOLD_SPREAD_MS;
    if (end > until) break;
    start = end;
  }
  return 1 - Math.exp((-start * Math.log(5)) / expectedMs);
}
