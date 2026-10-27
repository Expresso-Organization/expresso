import { z } from "zod";

import { TimestampSchema, UuidSchema } from "./common.js";

export const PlanCodeSchema = z.enum(["free", "pro", "team"]);

export const AuthenticatedUserSchema = z.strictObject({
  id: UuidSchema,
  email: z.email(),
  displayName: z.string().min(1).max(200),
  planCode: PlanCodeSchema,
  /**
   * 이 주소가 본인 것임을 확인한 시각. 아직이면 null.
   *
   * 화면은 이걸로 인증 안내 띠를 그리고, 발행 라우트는 이걸로 문을 연다 — 인증 전에는
   * 포트폴리오를 공개 주소에 올릴 수 없다.
   */
  emailVerifiedAt: TimestampSchema.nullable(),
});

export const CurrentUserResponseSchema = z.strictObject({
  data: AuthenticatedUserSchema,
});

export const IdentitySessionIdParamsSchema = z.strictObject({
  sessionId: UuidSchema,
});

/**
 * 세션 수명 정책. 백엔드가 만료를 연장할 때와 웹이 쿠키 만료를 찍을 때 같은 값을 본다.
 *
 * - `persistent` — "로그인 상태 유지"를 켠 세션. 마지막 활동 뒤 30일.
 * - `ephemeral` — 끈 세션. 마지막 활동 뒤 12시간. 쿠키는 브라우저를 닫으면 사라진다.
 * - `absoluteMs` — 두 모드 공통의 절대 상한. 발급 뒤 90일이 지나면 어떤 활동도 살리지 못한다.
 *   훔친 토큰의 수명을 여기서 끊는다.
 */
export const SESSION_POLICY = {
  persistent: { idleMs: 30 * 86_400_000 },
  ephemeral: { idleMs: 12 * 3_600_000 },
  absoluteMs: 90 * 86_400_000,
} as const;

/**
 * 로그인 상태 유지. 생략하면 켬 — 옵션을 모르는 클라이언트는 지금까지와 같은 세션을 받는다.
 * 기본값은 스키마가 아니라 세션을 발급하는 쪽이 채운다(`SESSION_POLICY`를 읽는 자리와 같다).
 */
export const SessionPersistenceSchema = z.boolean().optional();

export const IssuedIdentitySessionSchema = z.strictObject({
  sessionId: UuidSchema,
  accessToken: z.string().regex(/^exps_[A-Za-z0-9_-]{43}$/),
  expiresAt: TimestampSchema,
  /** 이 세션이 유지 모드인가. 웹이 쿠키에 `expires`를 찍을지 여기서 정한다. */
  persistent: z.boolean(),
});

export const EmailSchema = z.email().max(320);

/**
 * 이용약관 · 개인정보 처리방침의 현재 판. 문구가 바뀌면 올린다.
 *
 * 가입 요청은 사용자가 읽고 동의한 판을 그대로 보낸다. 서버가 지금 묻는 판과 같아야
 * 가입이 된다 — 사용자가 승낙한 것은 "약관" 일반이 아니라 그때 읽은 그 문장이다.
 */
export const TERMS_VERSION = 1;

/**
 * 10b 회원가입. 소셜 로그인이 1순위지만 이메일 경로를 대안으로 둔다(화면 정의서 10).
 * 최소 길이는 NIST SP 800-63B의 8자보다 한 단계 위인 10자로 잡는다.
 */
export const SignupSchema = z.strictObject({
  email: EmailSchema,
  password: z.string().min(10).max(200),
  displayName: z.string().trim().min(1).max(200),
  persistent: SessionPersistenceSchema,
  /** 동의한 약관의 판. 없거나 다르면 400 — 동의 없는 가입은 받지 않는다. */
  termsVersion: z.literal(TERMS_VERSION),
});

export const LoginSchema = z.strictObject({
  email: EmailSchema,
  password: z.string().min(1).max(200),
  persistent: SessionPersistenceSchema,
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
  persistent: SessionPersistenceSchema,
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
  persistent: SessionPersistenceSchema,
});

/* ── 비밀번호 재설정 · 이메일 인증 ── */

/**
 * 일회용 토큰. 세션 토큰(`exps_`)과 같은 방식으로 만들고 서버는 해시만 둔다.
 * 접두어로 종류를 구분해 재설정 링크를 인증 자리에 밀어 넣을 수 없게 한다.
 */
export const PasswordResetTokenSchema = z.string().regex(/^exrt_[A-Za-z0-9_-]{43}$/);
export const EmailVerificationTokenSchema = z.string().regex(/^exvt_[A-Za-z0-9_-]{43}$/);

/** 링크 수명. 재설정은 짧게(남의 메일함에 남아도 쓸모가 없게), 인증은 하루. */
export const PASSWORD_RESET_TTL_MS = 30 * 60_000;
export const EMAIL_VERIFICATION_TTL_MS = 24 * 3_600_000;
/** 같은 사람에게 같은 종류의 메일을 다시 보내기까지의 최소 간격. */
export const AUTH_MAIL_RESEND_INTERVAL_MS = 60_000;

/** 응답은 가입 여부와 무관하게 202 하나다 — 이메일 존재를 흘리지 않는다. */
export const PasswordResetRequestSchema = z.strictObject({
  email: EmailSchema,
});

export const PasswordResetConfirmSchema = z.strictObject({
  token: PasswordResetTokenSchema,
  password: z.string().min(10).max(200),
  persistent: SessionPersistenceSchema,
});

export const EmailVerificationConfirmSchema = z.strictObject({
  token: EmailVerificationTokenSchema,
});

/** 발행 라우트 403의 `error.details`. 화면은 이걸 보고 인증을 안내한다. */
export const EmailVerificationRequiredSchema = z.strictObject({
  reason: z.literal("email_verification_required"),
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
export type PasswordResetRequest = z.infer<typeof PasswordResetRequestSchema>;
export type PasswordResetConfirm = z.infer<typeof PasswordResetConfirmSchema>;
export type EmailVerificationConfirm = z.infer<typeof EmailVerificationConfirmSchema>;
export type EmailVerificationRequired = z.infer<typeof EmailVerificationRequiredSchema>;
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
