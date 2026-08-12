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

export type PlanCode = z.infer<typeof PlanCodeSchema>;
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
