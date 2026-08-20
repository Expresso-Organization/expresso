import { z } from "zod";

import { TimestampSchema, UuidSchema } from "./common.js";

export const PlanCodeSchema = z.enum(["free", "pro", "team"]);

export const AuthenticatedUserSchema = z.strictObject({
  id: UuidSchema,
  email: z.email(),
  displayName: z.string().min(1).max(200),
  planCode: PlanCodeSchema,
});

export const CurrentUserResponseSchema = z.strictObject({
  data: AuthenticatedUserSchema,
});

export const IdentitySessionIdParamsSchema = z.strictObject({
  sessionId: UuidSchema,
});

export const IssuedIdentitySessionSchema = z.strictObject({
  sessionId: UuidSchema,
  accessToken: z.string().regex(/^exps_[A-Za-z0-9_-]{43}$/),
  expiresAt: TimestampSchema,
});

export const EmailSchema = z.email().max(320);

/**
 * 10b 회원가입. 소셜 로그인이 1순위지만 이메일 경로를 대안으로 둔다(화면 정의서 10).
 * 최소 길이는 NIST SP 800-63B의 8자보다 한 단계 위인 10자로 잡는다.
 */
export const SignupSchema = z.strictObject({
  email: EmailSchema,
  password: z.string().min(10).max(200),
  displayName: z.string().trim().min(1).max(200),
});

export const LoginSchema = z.strictObject({
  email: EmailSchema,
  password: z.string().min(1).max(200),
});

export const AuthSessionSchema = z.strictObject({
  user: AuthenticatedUserSchema,
  session: IssuedIdentitySessionSchema,
});

export const AuthSessionResponseSchema = z.strictObject({
  data: AuthSessionSchema,
});

/* ── 소셜 로그인 (화면 정의서 10 — "소셜 우선. 이메일은 대안으로 둡니다") ── */

export const OAuthProviderSchema = z.enum(["google"]);

/**
 * Google이 발급한 ID 토큰. 웹이 인가 코드와 바꿔 온 것을 그대로 넘긴다.
 *
 * `nonce`는 웹이 시작 단계에서 만들어 쿠키에 넣어 둔 값이다. 서버는 토큰 안의
 * `nonce`가 이것과 같은지 본다 — 다른 곳에서 받아 온 토큰을 여기에 밀어 넣을 수
 * 없게 하는 잠금이다.
 */
export const GoogleSignInSchema = z.strictObject({
  idToken: z.string().min(1).max(8_192),
  nonce: z.string().min(1).max(256),
});

/**
 * 이미 비밀번호로 가입된 이메일에 Google을 잇는다.
 *
 * 이 서비스에는 이메일 인증이 없다. 그래서 "이메일이 같으니 같은 사람"이라고
 * 볼 수 없다 — 남의 주소로 먼저 가입해 둔 계정에 진짜 주인을 착지시키게 된다.
 * 비밀번호를 받아 확인하는 것이 유일하게 안전한 연결 조건이다.
 */
export const GoogleLinkSchema = z.strictObject({
  idToken: z.string().min(1).max(8_192),
  nonce: z.string().min(1).max(256),
  password: z.string().min(1).max(200),
});

/** `created`는 이 요청이 계정을 새로 만들었는지다 — 온보딩으로 보낼지가 여기서 갈린다. */
export const SocialAuthSessionSchema = z.strictObject({
  user: AuthenticatedUserSchema,
  session: IssuedIdentitySessionSchema,
  created: z.boolean(),
});

export const SocialAuthSessionResponseSchema = z.strictObject({
  data: SocialAuthSessionSchema,
});

/**
 * 409의 `error.details`. "이 이메일은 비밀번호 계정이니 확인하고 이으라"는 뜻이고,
 * 화면은 이걸 보고 연결 확인으로 넘어간다.
 */
export const PasswordConfirmationRequiredSchema = z.strictObject({
  reason: z.literal("password_confirmation_required"),
  email: z.email(),
});

export type PlanCode = z.infer<typeof PlanCodeSchema>;
export type OAuthProvider = z.infer<typeof OAuthProviderSchema>;
export type GoogleSignIn = z.infer<typeof GoogleSignInSchema>;
export type GoogleLink = z.infer<typeof GoogleLinkSchema>;
export type SocialAuthSession = z.infer<typeof SocialAuthSessionSchema>;
export type PasswordConfirmationRequired = z.infer<
  typeof PasswordConfirmationRequiredSchema
>;
export type Signup = z.infer<typeof SignupSchema>;
export type Login = z.infer<typeof LoginSchema>;
export type AuthSession = z.infer<typeof AuthSessionSchema>;
export type AuthenticatedUser = z.infer<typeof AuthenticatedUserSchema>;
export type CurrentUserResponse = z.infer<typeof CurrentUserResponseSchema>;
export type IdentitySessionIdParams = z.infer<
  typeof IdentitySessionIdParamsSchema
>;
export type IssuedIdentitySession = z.infer<
  typeof IssuedIdentitySessionSchema
>;
