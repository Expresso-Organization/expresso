/**
 * 로고가 없는 회사의 이니셜 아바타 색.
 *
 * **회사마다 다르되 늘 같아야 한다.** 매번 새로 뽑으면 목록을 다시 그릴 때마다
 * 색이 바뀌고, 같은 회사가 06 목록과 사이드바에서 다른 색으로 선다. 그래서
 * 이름에서 결정적으로 뽑는다 — 무작위가 아니라 "이름이 정하는 색"이다.
 *
 * 색은 열두 개의 hex를 늘어놓는 대신 **규칙 하나**로 만든다. 채도와 밝기를
 * 고정하고 색상(hue)만 바꾼다. 그래서 어느 회사가 걸려도 지면 위에서 같은
 * 무게로 보이고, 대비도 한 번만 맞추면 끝난다.
 *
 *   바탕  hsl(h 46% 93%)   — 아주 옅은 틴트. 행 배경 위에 얹혀도 튀지 않는다.
 *   글자  hsl(h 58% 30%)   — 같은 색상의 짙은 잉크. 밝기 차가 63%p라 작은
 *                            글자에서도 읽힌다.
 *
 * 색상 여섯은 제품이 쓰는 대역에서 골랐고, **의미를 가진 색은 피했다** —
 * 성공(#12a97a·166°)과 위험(#e2543a·12°) 근처를 비우지 않으면 회사 아바타가
 * 상태 표시로 읽힌다.
 */
const HUES = [
  25, // 테라코타 — espresso 계열
  42, // 앰버
  95, // 올리브
  200, // 스틸 블루
  245, // 인디고
  292, // 플럼
] as const;

/**
 * FNV-1a. 짧은 문자열에 고르게 퍼지고 구현이 한 줄이라 여기 쓰기 좋다.
 * 암호용이 아니다 — 색을 고르는 데 그런 성질은 필요 없다.
 */
function hash(value: string): number {
  let result = 0x811c9dc5;
  for (const char of value) {
    result ^= char.codePointAt(0) ?? 0;
    result = Math.imul(result, 0x01000193) >>> 0;
  }
  return result;
}

export interface AvatarTint {
  background: string;
  color: string;
}

export function avatarTint(companyName: string): AvatarTint {
  // 이름 앞뒤 공백이나 대소문자가 달라도 같은 색이어야 한다.
  const hue = HUES[hash(companyName.trim().toLocaleLowerCase("en-US")) % HUES.length] ?? HUES[0];
  return {
    background: `hsl(${hue} 46% 93%)`,
    color: `hsl(${hue} 58% 30%)`,
  };
}
