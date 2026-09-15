/**
 * 로그인 뒤 돌아갈 자리. 열린 리다이렉트를 만들지 않는다.
 *
 * 받는 것: 같은 출처의 경로(`/`로 시작, `//`가 아님). 라우트 핸들러(`/api/`)와 인증
 * 화면 자체(`/login`, `/signup`)는 돌아갈 자리가 아니라 기본값으로 떨어진다.
 */
export const DEFAULT_NEXT = "/home";

export function safeNext(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return DEFAULT_NEXT;
  }
  if (value === "/" || value.startsWith("/api/") || value.startsWith("/login") || value.startsWith("/signup")) {
    return DEFAULT_NEXT;
  }
  return value;
}

/** `?next=` 하나를 붙인 로그인 주소. 기본값으로 갈 자리면 파라미터를 붙이지 않는다. */
export function loginPath(next: string | null | undefined): string {
  const safe = safeNext(next);
  return safe === DEFAULT_NEXT ? "/login" : `/login?next=${encodeURIComponent(safe)}`;
}

/**
 * 프록시가 보호 구간의 요청에 붙이는 헤더. 값은 경로 + 쿼리다. `requireSession()`이 401을
 * 만나면 이걸 읽어 "어디를 보다가 밀려났는지"를 로그인에 넘긴다. 클라이언트가 같은 이름을
 * 보내도 프록시가 덮어쓴다 — 바깥에서 들어온 값은 믿지 않는다.
 */
export const PATHNAME_HEADER = "x-ex-pathname";
