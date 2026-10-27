/**
 * 개발 로그인 — 환경 변수에 적어 둔 계정으로 제품의 실제 로그인을 대신 수행하는 문.
 *
 * 켜는 조건은 여기 한 곳에만 있다. 로그인 화면(버튼을 세울지), 프록시(로그인 대신
 * 이 문으로 보낼지), `/api/dev/session`(응답할지)이 모두 이 함수를 본다.
 *
 * **`NODE_ENV`를 보지 않는다.** 배포된 주소에서도 화면을 확인할 수 있어야 해서
 * 프로덕션 빌드 차단을 거뒀다. 그래서 스위치가 유일한 안전장치다 — `DEV_LOGIN=1`을
 * 명시적으로 켜고 계정 정보를 둘 다 적은 서버에서만 열린다. 켜 둔 서버의 로그인
 * 화면에서는 누구나 그 버튼을 누를 수 있으므로, 공개돼도 괜찮은 계정만 적는다.
 */

export interface DevLogin {
  email: string;
  password: string;
  displayName: string;
}

export function readDevLogin(): DevLogin | null {
  if (process.env.DEV_LOGIN !== "1") return null;
  const email = process.env.DEV_LOGIN_EMAIL;
  const password = process.env.DEV_LOGIN_PASSWORD;
  if (!email || !password) return null;
  // 빈 문자열은 적지 않은 것과 같이 본다 — 가입이 표시 이름을 비워 두면 거절한다.
  return { email, password, displayName: process.env.DEV_LOGIN_NAME || "Dev" };
}

export function isDevLoginEnabled(): boolean {
  return readDevLogin() !== null;
}

/**
 * 세션이 없는 요청을 로그인 화면 대신 이 문으로 바로 보내도 되는가.
 *
 * 개발 서버에서만 그렇게 한다. 주소를 열면 곧 화면이 나오는 편의인데, 배포된
 * 주소에서 같은 일이 벌어지면 방문자가 누르지 않은 로그인이 일어난다. 배포본에서는
 * 로그인 화면의 버튼을 누른 사람만 들어간다.
 */
export function isDevLoginAutoRedirectEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && isDevLoginEnabled();
}
