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

/** 서울 날짜(`YYYY-MM-DD`). 약속의 날짜는 시각이 아니라 날이다. */
const DaySchema = z.iso.date();
export const CONSULTANT_COMMITMENT_LIMIT = 20;
/**
 * 약속 — 사용자가 하겠다고 한 일과 날짜. 컨설턴트가 대화에서 저장하고, 약속한 날에 먼저 묻는다.
 *
 * - `status`: `open` 열림 · `done` 했음 · `dropped` 하지 않기로 함.
 * - `awaiting`: 컨설턴트가 물었고 아직 답이 없다. 홈의 확인 카드가 이 약속을 보인다.
 */
export const ConsultantCommitmentSchema = z.strictObject({
  id: UuidSchema,
  title: z.string().trim().min(1).max(200),
  detail: z.string().trim().max(500),
  dueOn: DaySchema,
  status: z.enum(["open", "done", "dropped"]),
  awaiting: z.boolean(),
  /** 약속을 만든 대화. 화면에서 그 대화로 돌아갈 수 있게. 대화가 지워졌으면 null. */
  conversationId: UuidSchema.nullable(),
  createdAt: TimestampSchema,
});
/** 에이전트가 `make_commitment`에 넣는 것. */
export const AgentCommitmentInputSchema = z.strictObject({
  title: z.string().trim().min(1).max(200).describe("사용자가 하겠다고 한 일. 「해커톤 지원서 내기」처럼 한 줄로"),
  detail: z.string().trim().max(500).optional().describe("덧붙일 내용. 없어도 된다"),
  dueOn: DaySchema.describe("하기로 한 날(YYYY-MM-DD). memory.today 이후여야 한다"),
});
/** 에이전트가 `update_commitment`에 넣는 것. `status`나 `dueOn` 가운데 하나는 있어야 한다. */
export const AgentCommitmentUpdateInputSchema = z.strictObject({
  commitmentId: UuidSchema.describe("memory.commitments의 id"),
  status: z.enum(["done", "dropped"]).optional().describe("사용자가 했다고 하면 done, 하지 않기로 했다고 하면 dropped"),
  dueOn: DaySchema.optional().describe("날짜를 미루거나 당길 때의 새 날(YYYY-MM-DD)"),
});
/** 화면에서 약속을 고친다. 날짜를 바꾸거나 거둔다. */
export const UpdateCommitmentSchema = z.strictObject({ dueOn: DaySchema.optional(), status: z.literal("dropped").optional() }).refine(input => !!input.dueOn || !!input.status, { message: "바꿀 것이 있어야 합니다." });
/** 확인 카드에서 한 답. 「아직이에요」는 새 날짜와 함께 온다. */
export const CommitmentCheckinAnswerSchema = z.discriminatedUnion("answer", [
  z.strictObject({ answer: z.literal("done") }),
  z.strictObject({ answer: z.literal("not_yet"), dueOn: DaySchema }),
  z.strictObject({ answer: z.literal("dropped") }),
]);
export const CommitmentCheckinResultSchema = z.strictObject({ data: z.strictObject({ commitment: ConsultantCommitmentSchema, /** 「했어요」로 열린 대화. 그 밖에는 null. */ conversationId: UuidSchema.nullable() }) });
/**
 * 홈이 읽는 컨설턴트의 연락.
 *
 * - `outreach`: 먼저 연락하기를 켰는가. `null`은 아직 정하지 않았다는 뜻이고, 홈이 한 번 묻는다.
 * - `commitments`: 컨설턴트가 물었고 답을 기다리는 약속.
 * - `quiet`: 한동안 대화가 없어 건넨 연락이 있는가.
 */
export const ConsultantCheckinsSchema = z.strictObject({
  outreach: z.boolean().nullable(),
  today: DaySchema,
  commitments: z.array(ConsultantCommitmentSchema).max(CONSULTANT_COMMITMENT_LIMIT),
  quiet: z.boolean(),
});
export const ConsultantCheckinsResponseSchema = z.strictObject({ data: ConsultantCheckinsSchema });
export const ConsultantCommitmentResponseSchema = z.strictObject({ data: ConsultantCommitmentSchema });
export const SetConsultantOutreachSchema = z.strictObject({
  enabled: z.boolean(),
  /** 능동 제안도 함께 켜고 끌지. 제안을 이미 켠 사용자에게 약속 확인만 따로 물을 때 거짓으로 보낸다. */
  proposals: z.boolean().default(true),
});
/** `proposals`는 능동 제안이 함께 켜졌는지다. 커리어 기록의 AI 사용 동의가 없으면 켜지지 않는다. */
export const ConsultantOutreachResponseSchema = z.strictObject({ data: z.strictObject({ enabled: z.boolean(), proposals: z.boolean() }) });

export const ConsultantMemorySchema = z.strictObject({
  stage: ConsultantStageSchema.nullable(),
  /** 단계를 마지막으로 정한 쪽. 아직 없으면 null. */
  stageSource: z.enum(["agent", "user"]).nullable(),
  stageUpdatedAt: TimestampSchema.nullable(),
  preferences: z.array(ConsultantPreferenceSchema).max(CONSULTANT_PREFERENCE_LIMIT),
  /** 먼저 연락하기를 켰는가. 아직 정하지 않았으면 null. */
  outreach: z.boolean().nullable(),
  /** 열린 약속. 날짜가 이른 순서. */
  commitments: z.array(ConsultantCommitmentSchema).max(CONSULTANT_COMMITMENT_LIMIT),
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
export type ConsultantCommitment = z.infer<typeof ConsultantCommitmentSchema>;
export type AgentCommitmentInput = z.infer<typeof AgentCommitmentInputSchema>;
export type AgentCommitmentUpdateInput = z.infer<typeof AgentCommitmentUpdateInputSchema>;
export type CommitmentCheckinAnswer = z.infer<typeof CommitmentCheckinAnswerSchema>;
export type ConsultantCheckins = z.infer<typeof ConsultantCheckinsSchema>;
