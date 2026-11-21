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
  /** 요금제가 먼저 연락하기를 여는가. 열지 않으면 확인할 약속과 안부는 비어 있다. */
  available: z.boolean(),
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

/**
 * 진단 — 구직 목표가 요구하는 것과 내 기록의 대조.
 *
 * 요건은 목표와 같은 직군의 실제 공고에서 센다(`GoalDemandSchema`). 건수는 「그 표현이 나온 공고의 수」다.
 * 컨설턴트가 항목마다 기록에서 근거를 찾아 상태를 매기고, 서버가 인용이 기록에 있는지 확인한다.
 */
export const DemandKindSchema = z.enum(["technology", "experience", "career", "qualification"]);
export const CONSULTANT_DIAGNOSIS_ITEM_LIMIT = 14;
/** 요건 한 줄. `id`는 `technology:kubernetes`처럼 사전의 항목을 가리키는 고정된 이름이다. */
export const DemandItemSchema = z.strictObject({
  id: z.string().min(1).max(80),
  kind: DemandKindSchema,
  label: z.string().min(1).max(80),
  /** 이 요건이 나온 공고의 수. 표본의 수(`sampleSize`)를 넘지 않는다. */
  count: z.number().int().nonnegative(),
});
const demandShape = {
  /** 집계할 때의 구직 목표(하고 싶은 일). */
  work: z.string().max(300),
  /** 목표의 글이 분류된 직군. 분류되지 않았으면 null이고 목표의 글로 찾았다(`basis: "keyword"`). */
  family: z.string().max(40).nullable(),
  basis: z.enum(["family", "keyword"]),
  /** 표본을 좁힌 기술. 목표의 글에 기술 이름이 있고 그 기술이 나온 공고가 충분하면 그 공고들만 본다. */
  focus: z.string().max(80).nullable(),
  /** 신입 · 주니어 목표면 경력 2년 이하(또는 연차를 적지 않은) 공고로 좁힌다. */
  level: z.enum(["entry"]).nullable(),
  /** 표본이 된 공고의 수. */
  sampleSize: z.number().int().nonnegative(),
  /** 표본에 든 회사의 수. 한 회사의 공고는 10건까지만 표본에 넣는다. */
  companyCount: z.number().int().nonnegative(),
  /** 표본에 든 관심 공고의 수. */
  interestedCount: z.number().int().nonnegative(),
  /** 표본이 적다(5건 미만). 건수로 말하기 어렵다. */
  small: z.boolean(),
};
export const GoalDemandSchema = z.strictObject({ ...demandShape, items: z.array(DemandItemSchema).max(CONSULTANT_DIAGNOSIS_ITEM_LIMIT) });
/** 확인됨(기록에 근거가 있다) · 일부 확인됨 · 미확인(기록에 없고 아직 묻지 않았다) · 부족(해 본 적이 없다고 사용자가 말했다). */
export const DiagnosisStatusSchema = z.enum(["confirmed", "partial", "unconfirmed", "gap"]);
const diagnosisEvidenceShape = { recordId: UuidSchema, quote: z.string().trim().min(1).max(600) };
export const DiagnosisItemSchema = DemandItemSchema.extend({
  status: DiagnosisStatusSchema,
  evidence: z.array(z.strictObject({ ...diagnosisEvidenceShape, recordTitle: z.string().max(200) })).max(3),
  note: z.string().max(300),
});
/**
 * 진단의 상태별 수. 진단 카드 · 컨설턴트의 답변 · 대화의 요지가 이 함수 하나로 센다.
 *
 * 경력 연차(`career`)는 공고가 받는 경력의 분포라 기록과 대조하지 않는다. 어느 수에도 넣지 않는다 —
 * 넣으면 카드는 「미확인 2」인데 답변은 「미확인 3」이 된다(운영에서 실제로 그랬다).
 */
export function diagnosisCounts(items: readonly { kind: string; status: z.infer<typeof DiagnosisStatusSchema> }[]): Record<z.infer<typeof DiagnosisStatusSchema>, number> {
  const counts = { confirmed: 0, partial: 0, unconfirmed: 0, gap: 0 };
  for (const item of items) if (item.kind !== "career") counts[item.status] += 1;
  return counts;
}

/** 상태별 수를 한 줄로. 「확인 6 · 일부 1 · 미확인 2 · 부족 4」. */
export function diagnosisCountsLine(counts: Record<z.infer<typeof DiagnosisStatusSchema>, number>): string {
  return `확인 ${counts.confirmed} · 일부 ${counts.partial} · 미확인 ${counts.unconfirmed} · 부족 ${counts.gap}`;
}

export const ConsultantDiagnosisSchema = z.strictObject({
  ...demandShape,
  /** 컨설턴트가 쓴 진단의 한 줄 요약. 아직 대조하지 않았으면 빈 글이다. */
  summary: z.string().max(600),
  items: z.array(DiagnosisItemSchema).max(CONSULTANT_DIAGNOSIS_ITEM_LIMIT),
  demandAt: TimestampSchema,
  /** 기록과 대조한 때. 집계만 하고 아직 대조하지 않았으면 null. */
  assessedAt: TimestampSchema.nullable(),
  /** 다시 진단이 필요한 까닭. 목표가 바뀌었거나(`goal`), 대조한 뒤에 기록이 바뀌었다(`records`). */
  stale: z.enum(["goal", "records"]).nullable(),
});
/** 에이전트가 `record_diagnosis`에 넣는 것. 적지 않은 항목은 앞선 상태를 둔다. */
export const AgentDiagnosisInputSchema = z.strictObject({
  summary: z.string().trim().min(1).max(600).describe("진단의 한 줄 요약. 표본 수와 가장 큰 부족한 점을 적는다. 상태별 수는 적지 않는다 — 카드가 센다."),
  items: z.array(z.strictObject({
    itemId: z.string().min(1).max(80).describe("read_goal_demand가 돌려준 항목의 id."),
    status: DiagnosisStatusSchema.describe("confirmed · partial은 기록의 근거가 있을 때만. gap은 사용자가 해 본 적이 없다고 답한 뒤에만."),
    evidence: z.array(z.strictObject(diagnosisEvidenceShape)).max(3).default([]).describe("근거 기록의 id와 그 기록에서 그대로 옮긴 인용."),
    note: z.string().trim().max(300).default("").describe("판단의 까닭 한 줄. 없으면 비운다."),
  })).min(1).max(CONSULTANT_DIAGNOSIS_ITEM_LIMIT),
});

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
  /** 저장된 진단. 아직 진단하지 않았으면 null. */
  diagnosis: ConsultantDiagnosisSchema.nullable(),
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

export type DemandKind = z.infer<typeof DemandKindSchema>;
export type DemandItem = z.infer<typeof DemandItemSchema>;
export type GoalDemand = z.infer<typeof GoalDemandSchema>;
export type DiagnosisStatus = z.infer<typeof DiagnosisStatusSchema>;
export type DiagnosisItem = z.infer<typeof DiagnosisItemSchema>;
export type ConsultantDiagnosis = z.infer<typeof ConsultantDiagnosisSchema>;
export type AgentDiagnosisInput = z.infer<typeof AgentDiagnosisInputSchema>;
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
