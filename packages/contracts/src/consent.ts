import { z } from "zod";

import { TimestampSchema } from "./common.js";

/**
 * 동의.
 *
 * §8.3 계약은 사용자가 쓴 글을 외부 모델로 보낸다. 그 일을 하기 전에 승낙을
 * 받아야 하고, **범위를 나눠서** 받아야 한다 — 공고 원문은 남이 쓴 공개된 글이고
 * 커리어 기록은 내가 쓴 글이다. 하나만 주고 다른 하나는 안 줄 수 있어야 한다.
 *
 * 철회는 지우는 것이 아니라 **끄는 것**이다. 동의한 적이 있다는 사실은 남는다.
 */
export const ConsentScopeSchema = z.enum(["job_posting_analysis", "career_records"]);

/**
 * 지금 묻고 있는 문구의 판.
 *
 * 문구가 바뀌면 올린다. 그때부터 옛 동의는 무효이고 다시 물어야 한다 —
 * 사용자가 승낙한 것은 "AI 사용" 일반이 아니라 **그때 읽은 그 문장**이다.
 */
export const CONSENT_POLICY_VERSION = 1;

export const ConsentSchema = z.strictObject({
  scope: ConsentScopeSchema,
  granted: z.boolean(),
  /** 승낙했을 때 읽은 문구의 판. 아직이면 null. */
  policyVersion: z.number().int().positive().nullable(),
  grantedAt: TimestampSchema.nullable(),
  revokedAt: TimestampSchema.nullable(),
  /**
   * 지금 문구로 다시 물어야 하는가.
   *
   * 승낙한 적은 있지만 그 뒤 문구가 바뀐 경우다. 철회와 구분해서 보여줘야
   * 한다 — 사용자가 끈 것이 아니라 우리가 조건을 바꾼 것이다.
   */
  needsRenewal: z.boolean(),
});

export const ConsentListResponseSchema = z.strictObject({
  data: z.strictObject({
    policyVersion: z.number().int().positive(),
    consents: z.array(ConsentSchema).length(2),
  }),
});

export const GrantConsentSchema = z.strictObject({
  scopes: z.array(ConsentScopeSchema).min(1).max(2)
    .refine((scopes) => new Set(scopes).size === scopes.length, {
      message: "scopes must be unique",
    }),
  /** 사용자가 읽은 문구의 판. 우리가 지금 묻는 판과 같아야 한다. */
  policyVersion: z.number().int().positive(),
});

export const RevokeConsentParamsSchema = z.strictObject({
  scope: ConsentScopeSchema,
});

export type ConsentScope = z.infer<typeof ConsentScopeSchema>;
export type Consent = z.infer<typeof ConsentSchema>;
