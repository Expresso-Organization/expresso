/**
 * 계정 삭제를 요청한 직후 취소 코드를 넘기는 쿠키.
 *
 * 요청한 계정은 그 순간부터 어떤 화면도 열 수 없어서, 코드는 로그인 없이 열리는
 * `/login/restore`에서만 보인다. 주소에 싣지 않고 그 경로에서만 읽히는 httpOnly
 * 쿠키로 10분 동안 둔다.
 */
export const DELETION_CODE_COOKIE = "ex_deletion_code";
export const DELETION_CODE_PATH = "/login/restore";
export const DELETION_CODE_MAX_AGE_SECONDS = 600;
