import { z } from "zod";

import { AgentContextSchema } from "./agent-chat.js";
import { TimestampSchema, UuidSchema } from "./common.js";

/**
 * 활동 — 채용 공고가 아닌 기회. 지금은 공모전과 해커톤이다.
 *
 * 출처가 준 목록의 한 줄을 그대로 옮긴다. 해커톤 분류는 출처에 없어 제목으로 가른다.
 */
export const ActivityKindSchema = z.enum(["contest", "hackathon"]);

export const ActivitySchema = z.strictObject({
  /** 출처와 출처 안의 번호. `wevity:112294`. */
  id: z.string().min(1).max(120),
  kind: ActivityKindSchema,
  title: z.string().min(1).max(300),
  host: z.string().max(200),
  fields: z.array(z.string().min(1).max(60)).max(12),
  /** 출처의 원문 주소. */
  url: z.string().min(1).max(2_000),
  /** 접수 마감까지 남은 날. 오늘 마감이면 0. */
  daysLeft: z.number().int().nonnegative(),
  /** 출처가 적은 접수 상태. "접수중" · "마감임박" · "접수예정". */
  status: z.string().max(40),
  /** 수집기가 이 활동을 처음 본 때. "새로 올라온 것"의 기준이다. */
  firstSeenAt: TimestampSchema,
});

export const ListActivitiesQuerySchema = z.strictObject({
  kind: ActivityKindSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const ActivityListResponseSchema = z.strictObject({ data: z.array(ActivitySchema) });

/**
 * 능동 제안 — 에이전트가 사용자의 기록과 새 공고 · 활동을 읽고 권하는 행동.
 *
 * 행동은 닫힌 목록이다. 모델은 이 가운데서 고르고, 대화를 시작할 요청문과 연결할 자료는
 * 서버가 만든다(`start`). 공고와 활동의 글은 바깥에서 온 글이라 요청문에 그대로 싣지 않는다.
 */
export const ProposalActionSchema = z.enum([
  /** 공고의 요건을 내 기록과 대조한다. */
  "compare_job",
  /** 이 공고로 포트폴리오를 만든다. */
  "start_portfolio",
  /** 활동(공모전 · 해커톤) 참가 계획을 세운다. */
  "plan_activity",
  /** 기록의 부족한 내용을 질문받아 채운다. */
  "strengthen_record",
]);

/** 제안이 짚는 것 — 대상(공고 · 활동 · 기록)이나 근거로 든 내 기록. */
export const ProposalRefSchema = z.strictObject({
  kind: z.enum(["job", "activity", "record"]),
  id: z.string().min(1).max(120),
  label: z.string().min(1).max(400),
  /** 눌렀을 때 열릴 주소. 활동은 출처의 원문이라 `external`이 참이다. */
  href: z.string().min(1).max(2_000),
  external: z.boolean(),
  /** 마감까지 남은 날. 마감이 없거나 기록이면 null. */
  daysLeft: z.number().int().nullable(),
});

export const ProposalStartSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("chat"),
    label: z.string().min(1).max(40),
    prompt: z.string().min(1).max(2_000),
    contexts: z.array(AgentContextSchema).max(10),
  }),
  z.strictObject({
    kind: z.literal("link"),
    label: z.string().min(1).max(40),
    href: z.string().min(1).max(2_000),
  }),
]);

export const ProposalSchema = z.strictObject({
  id: UuidSchema,
  action: ProposalActionSchema,
  /** 할 일 한 문장. 에이전트가 쓴다. */
  title: z.string().min(1).max(200),
  /** 그렇게 권하는 이유. 에이전트가 쓴다. */
  reason: z.string().min(1).max(600),
  subject: ProposalRefSchema,
  /** 근거로 든 내 기록. */
  records: z.array(ProposalRefSchema).max(4),
  start: ProposalStartSchema,
  createdAt: TimestampSchema,
});

export const ProposalTriggerSchema = z.enum(["enable", "manual", "daily", "news"]);

/** 실행하지 않았거나 끝내지 못한 까닭. */
export const ProposalRunReasonSchema = z.enum([
  "no_credits",
  "consent_required",
  "ai_unavailable",
  "nothing_new",
  "failed",
]);

export const ProposalRunSchema = z.strictObject({
  status: z.enum(["idle", "queued", "running", "complete", "skipped", "failed"]),
  /** 실행 중에 서버가 알리는 단계. 자료를 고르는 중인지 제안을 쓰는 중인지. */
  stage: z.enum(["collecting", "writing"]).nullable(),
  reason: ProposalRunReasonSchema.nullable(),
  trigger: ProposalTriggerSchema.nullable(),
  startedAt: TimestampSchema.nullable(),
  finishedAt: TimestampSchema.nullable(),
  /** 마지막으로 끝낸 실행이 읽은 것의 수. */
  read: z.strictObject({
    records: z.number().int().nonnegative(),
    jobs: z.number().int().nonnegative(),
    activities: z.number().int().nonnegative(),
  }).nullable(),
});

export const ProposalFeedSchema = z.strictObject({
  /** 사용자가 능동 제안을 켰는가. 꺼져 있으면 서버는 이 사용자에게 AI를 돌리지 않는다. */
  enabled: z.boolean(),
  proposals: z.array(ProposalSchema).max(12),
  run: ProposalRunSchema,
});

export const ProposalFeedResponseSchema = z.strictObject({ data: ProposalFeedSchema });

export type Activity = z.infer<typeof ActivitySchema>;
export type ActivityKind = z.infer<typeof ActivityKindSchema>;
export type ListActivitiesQuery = z.infer<typeof ListActivitiesQuerySchema>;
export type ProposalAction = z.infer<typeof ProposalActionSchema>;
export type ProposalRef = z.infer<typeof ProposalRefSchema>;
export type ProposalStart = z.infer<typeof ProposalStartSchema>;
export type Proposal = z.infer<typeof ProposalSchema>;
export type ProposalTrigger = z.infer<typeof ProposalTriggerSchema>;
export type ProposalRunReason = z.infer<typeof ProposalRunReasonSchema>;
export type ProposalRun = z.infer<typeof ProposalRunSchema>;
export type ProposalFeed = z.infer<typeof ProposalFeedSchema>;
