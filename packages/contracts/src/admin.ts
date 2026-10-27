import { z } from "zod";

import { TimestampSchema, UuidSchema } from "./common.js";

/** 저장소의 가상 인물 원본 키. `users.dummyKey`와 같은 규칙이다(0022). */
export const DummyAccountKeySchema = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);

export const DummyAccountKeyParamsSchema = z.strictObject({ key: DummyAccountKeySchema });

/**
 * 관리 화면의 더미 계정 한 줄. 원본(`persona`)은 저장소에 늘 있고, 계정(`account`)은
 * 관리자가 만들기 전에는 null이다.
 */
export const DummyAccountSchema = z.strictObject({
  key: DummyAccountKeySchema,
  displayName: z.string().min(1).max(200),
  email: z.email(),
  /** 직군 · 경력 한 줄. */
  headline: z.string().min(1).max(200),
  /** 원본에 적힌 기록 수. 만들면 이만큼 생긴다. */
  sourceRecordCount: z.number().int().nonnegative(),
  account: z.strictObject({
    userId: UuidSchema,
    recordCount: z.number().int().nonnegative(),
    createdAt: TimestampSchema,
  }).nullable(),
  lastImpersonation: z.strictObject({
    at: TimestampSchema,
    adminDisplayName: z.string().min(1).max(200).nullable(),
  }).nullable(),
});

export const DummyAccountListResponseSchema = z.strictObject({ data: z.array(DummyAccountSchema) });
export const DummyAccountResponseSchema = z.strictObject({ data: DummyAccountSchema });

export type DummyAccount = z.infer<typeof DummyAccountSchema>;
