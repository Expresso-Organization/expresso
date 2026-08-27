/**
 * 지면 밝기.
 *
 * 고른 값은 쿠키 하나에 둡니다. 세션 토큰과 달리 이건 비밀이 아니라 **그리는
 * 방법**이라 클라이언트가 읽어도 됩니다 — 오히려 읽을 수 있어야 첫 페인트
 * 전에 적용됩니다.
 *
 * 루트 레이아웃에서 쿠키를 읽지 않는 이유는 렌더링 방식입니다. 서버에서 읽으면
 * 모든 라우트가 동적이 되고, 그중에는 **캐시되어야 할 공개 포트폴리오**가
 * 있습니다. 대신 `<head>`에서 동기로 도는 작은 스크립트가 `data-theme`을
 * 붙입니다 — 몸통이 그려지기 전이라 깜빡임이 없습니다.
 */

export const THEME_COOKIE = "ex_theme";

/** `system`은 쿠키를 지운 상태입니다 — OS 설정(`prefers-color-scheme`)을 따릅니다. */
export type ThemeChoice = "light" | "dark" | "system";

export const THEME_CHOICES: readonly {
  value: ThemeChoice;
  label: string;
  icon: string;
}[] = [
  { value: "light", label: "밝게", icon: "sun" },
  { value: "dark", label: "어둡게", icon: "moon" },
  { value: "system", label: "시스템", icon: "desktop" },
];

/**
 * `<head>` 안에서 몸통보다 먼저 도는 글.
 *
 * 여기서 하는 일은 하나뿐입니다 — 쿠키에 고른 값이 있으면 `data-theme`으로
 * 옮긴다. 없으면 아무것도 하지 않고 토큰의 `prefers-color-scheme` 규칙이
 * 맡습니다.
 *
 * 쿠키를 못 읽는 환경(차단·비공개 모드)에서도 화면은 그려져야 하므로 통째로
 * `try`에 넣습니다.
 */
export const THEME_BOOTSTRAP = `(function(){try{var m=document.cookie.match(/(?:^|;\\s*)${THEME_COOKIE}=(light|dark)/);if(m){document.documentElement.setAttribute("data-theme",m[1]);}}catch(e){}})();`;

/** 쿠키에서 읽은 값을 고른 값으로. 모르는 값은 `system`으로 떨어뜨립니다. */
export function parseThemeChoice(raw: string | undefined | null): ThemeChoice {
  return raw === "light" || raw === "dark" ? raw : "system";
}
