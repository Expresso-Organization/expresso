import { z } from "zod";

import { TimestampSchema, UuidSchema } from "./common.js";

/**
 * 컨설턴트의 기억 — 대화가 바뀌어도 이어 가는 것.
 *
 * 구직 목표는 `career`가 가진다(`JobGoalSchema`). 여기에는 컨설턴트가 대화에서 알게 된
 * 단계와 조건, 그리고 지난 대화의 요지를 둔다. 사용자는 「내 진행」 화면에서 보고 고친다.
 */

/** 구직 단계. 탐색(하고 싶은 일을 정하는 중) · 준비(목표를 두고 경험을 쌓는 중) · 지원(공고를 고르고 포트폴리오를 만드는 중). */
export const ConsultantStageSchema = z.enum(["exploring", "preparing", "applying"]);
export const CONSULTANT_PREFERENCE_LIMIT = 30;
/** 사용자가 원하거나(`prefer`) 피하는(`avoid`) 조건. 글은 사용자가 한 말을 짧게 옮긴 것이다. */
export const ConsultantPreferenceSchema = z.strictObject({
  id: UuidSchema,
  kind: z.enum(["prefer", "avoid"]),
  text: z.string().trim().min(1).max(200),
  /** 대화에서 컨설턴트가 적었으면 `chat`, 사용자가 화면에서 적었으면 `user`. */
  source: z.enum(["chat", "user"]),
  createdAt: TimestampSchema,
});

/**
 * 지난 대화 하나의 요지. 저장된 대화에서 규칙으로 뽑는다 — 사용자가 한 말, 완료한 도구 결과, 마지막 답변의 앞부분.
 * 모델이 쓴 요약이 아니므로 대화에 없는 일이 들어가지 않는다.
 */
export const ConversationDigestSchema = z.strictObject({
  conversationId: UuidSchema,
  title: z.string().max(120),
  updatedAt: TimestampSchema,
  said: z.array(z.string().max(200)).max(3),
  outcomes: z.array(z.string().max(300)).max(8),
  lastAnswer: z.string().max(300),
});

export const ConsultantMemorySchema = z.strictObject({
  stage: ConsultantStageSchema.nullable(),
  /** 단계를 마지막으로 정한 쪽. 아직 없으면 null. */
  stageSource: z.enum(["agent", "user"]).nullable(),
  stageUpdatedAt: TimestampSchema.nullable(),
  preferences: z.array(ConsultantPreferenceSchema).max(CONSULTANT_PREFERENCE_LIMIT),
  recentConversations: z.array(ConversationDigestSchema).max(5),
});
export const ConsultantMemoryResponseSchema = z.strictObject({ data: ConsultantMemorySchema });
export const SetConsultantStageSchema = z.strictObject({ stage: ConsultantStageSchema });

/** 에이전트가 `update_memory`에 넣는 것. 셋 중 하나는 있어야 한다. */
export const AgentMemoryUpdateInputSchema = z.strictObject({
  stage: ConsultantStageSchema.optional().describe("대화에서 분명히 드러난 구직 단계. 바뀌지 않았으면 넣지 않는다"),
  remember: z.array(z.strictObject({ kind: z.enum(["prefer", "avoid"]).describe("원하는 조건이면 prefer, 피하는 조건이면 avoid"), text: z.string().trim().min(1).max(200).describe("사용자가 한 말을 짧게 옮긴 조건") })).max(5).optional().describe("새로 기억할 조건"),
  forget: z.array(UuidSchema).max(5).optional().describe("사용자가 거둔 조건의 id(memory.preferences의 id)"),
});

export type ConsultantStage = z.infer<typeof ConsultantStageSchema>;
export type ConsultantPreference = z.infer<typeof ConsultantPreferenceSchema>;
export type ConversationDigest = z.infer<typeof ConversationDigestSchema>;
export type ConsultantMemory = z.infer<typeof ConsultantMemorySchema>;
export type AgentMemoryUpdateInput = z.infer<typeof AgentMemoryUpdateInputSchema>;
