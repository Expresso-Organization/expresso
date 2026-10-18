export interface DemoAccount {
  email: string;
  password: string;
}

/** 개발 서버에서만 계정 정보를 로그인 화면에 전달한다. */
export function readDemoAccount(): DemoAccount | null | undefined {
  if (process.env.NODE_ENV !== "development") return undefined;

  const email = process.env.DEV_LOGIN_EMAIL;
  const password = process.env.DEV_LOGIN_PASSWORD;
  return email && password ? { email, password } : null;
}
