import { z } from "zod";

import { AgentContextSchema } from "./agent-chat.js";
import { TimestampSchema, UuidSchema } from "./common.js";
import { JobPostingCompanySchema } from "./job-board.js";

/**
 * 활동 — 채용 공고가 아닌 기회. 공모전 · 해커톤 · 부트캠프다.
 *
 * 출처가 준 한 줄을 옮긴다. 해커톤 분류는 출처에 없어 제목으로 가른다. 여러 출처에 같은 활동이 있으면
 * 목록에는 대표 하나만 나온다(`ActivityService`의 중복 묶기).
 */
export const ActivityKindSchema = z.enum(["contest", "hackathon", "bootcamp"]);

/** 활동을 읽어 오는 곳. */
export const ActivitySourceSchema = z.enum(["wevity", "linkareer", "contestkorea", "devevent", "boottent"]);

/** 서울 날짜 `YYYY-MM-DD`. */
const DateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const ActivitySchema = z.strictObject({
  /** 출처와 출처 안의 번호. `wevity:112294`. */
  id: z.string().min(1).max(120),
  source: ActivitySourceSchema,
  kind: ActivityKindSchema,
  title: z.string().min(1).max(300),
  /** 주최 · 운영사. */
  host: z.string().max(200),
  fields: z.array(z.string().min(1).max(60)).max(12),
  /** 출처의 원문 주소. */
  url: z.string().min(1).max(2_000),
  /** 주최가 직접 올린 원 공고 주소. 출처가 주지 않으면 null. */
  homepageUrl: z.string().max(2_000).nullable(),
  /** 접수 시작일. 출처가 주지 않으면 null. */
  applyStartOn: DateOnlySchema.nullable(),
  /** 접수 마감일. */
  deadlineOn: DateOnlySchema,
  /** `month`면 출처가 마감을 「12월 중」처럼 달로만 적었고, `deadlineOn`은 그달 말일이다. */
  deadlinePrecision: z.enum(["day", "month"]),
  /** 접수 마감까지 남은 날. 오늘 마감이면 0. */
  daysLeft: z.number().int().nonnegative(),
  /** "접수예정"(접수 시작 전) 또는 "접수중". */
  status: z.string().max(40),
  /** 활동 · 수업이 시작하는 날. 부트캠프 수업 시작일, 당일 행사의 날짜. */
  startsOn: DateOnlySchema.nullable(),
  /** 응모 · 지원 대상. 출처가 적은 글 그대로. */
  eligibility: z.string().max(300).nullable(),
  /** 상금 · 시상. 출처가 적은 글 그대로. */
  prize: z.string().max(200).nullable(),
  /** 부트캠프 본인 부담 학비(원). 0이면 무료. */
  tuition: z.number().int().nonnegative().nullable(),
  /** 부트캠프가 국민내일배움카드를 요구하는가. */
  nbcardRequired: z.boolean().nullable(),
  /** 수집기가 이 활동을 처음 본 때. "새로 올라온 것"의 기준이다. */
  firstSeenAt: TimestampSchema,
});

export const ListActivitiesQuerySchema = z.strictObject({
  kind: ActivityKindSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});

export const ActivityListResponseSchema = z.strictObject({
  data: z.array(ActivitySchema),
  /** 조건에 맞는 접수 중 활동 전체 수. */
  summary: z.strictObject({ total: z.number().int().nonnegative() }),
});

/**
 * 능동 제안 — 에이전트가 사용자의 기록과 새 공고 · 활동을 읽고 권하는 행동.
 *
 * 행동은 닫힌 목록이다. 카드의 제목과 버튼은 행동이 정한다. 모델은 이 가운데서 고르고 메시지를 쓰며, 대화를 시작할 요청문과 연결할 자료는
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

/** 공고의 회사 아바타 — 로고 주소와, 로고가 없을 때 쓰는 이니셜 · 색. */
export const ProposalCompanySchema = JobPostingCompanySchema.pick({ name: true, initial: true, avatarBackground: true, avatarColor: true, logoUrl: true });

/**
 * 제안이 인용하는 것 — 대상(공고 · 활동 · 기록)이나 근거로 든 내 기록.
 *
 * 화면은 이것을 카드에 한 줄로 세운다. 그 줄을 그리는 데 쓰는 것을 함께 싣는다 —
 * 공고는 회사 아바타, 기록은 서랍, 활동은 종류. 해당하지 않는 칸은 null이다.
 */
export const ProposalRefSchema = z.strictObject({
  kind: z.enum(["job", "activity", "record"]),
  id: z.string().min(1).max(120),
  label: z.string().min(1).max(400),
  /** 이름 아래에 적는 한 줄 — 공고는 회사, 활동은 주최, 기록은 서랍 이름. */
  sub: z.string().max(200).nullable(),
  /** 눌렀을 때 열릴 주소. 활동은 출처의 원문이라 `external`이 참이다. */
  href: z.string().min(1).max(2_000),
  external: z.boolean(),
  /** 마감까지 남은 날. 마감이 없거나 기록이면 null. */
  daysLeft: z.number().int().nullable(),
  company: ProposalCompanySchema.nullable(),
  /** 기록이 든 서랍의 키. 화면은 이 키로 서랍 아이콘을 고른다. */
  categoryKey: z.string().max(80).nullable(),
  activityKind: ActivityKindSchema.nullable(),
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
  /**
   * 에이전트가 사용자에게 건네는 제안 메시지. 화면에만 쓴다 —
   * 바깥에서 온 글(공고 · 활동)을 담을 수 있어 대화의 요청문으로 넘기지 않는다.
   */
  message: z.string().min(1).max(400),
  subject: ProposalRefSchema,
  /** 근거로 든 내 기록. */
  records: z.array(ProposalRefSchema).max(4),
  start: ProposalStartSchema,
  createdAt: TimestampSchema,
});

export const ProposalTriggerSchema = z.enum(["enable", "manual", "daily", "news"]);

/** 실행하지 않았거나 끝내지 못한 까닭. */
export const ProposalRunReasonSchema = z.enum([
  /** 예전 실행 기록에만 남아 있다. 능동 제안은 이제 크레딧을 보지 않는다. */
  "no_credits",
  /** 요금제가 능동 제안을 열지 않는다. */
  "plan_required",
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
  /** 요금제가 능동 제안을 여는가. 열지 않으면 켜져 있어도 `enabled`는 false이고 제안은 비어 있다. */
  available: z.boolean(),
  /** 사용자가 능동 제안을 켰는가. 꺼져 있으면 서버는 이 사용자에게 AI를 돌리지 않는다. */
  enabled: z.boolean(),
  proposals: z.array(ProposalSchema).max(12),
  run: ProposalRunSchema,
});

export const ProposalFeedResponseSchema = z.strictObject({ data: ProposalFeedSchema });

export type Activity = z.infer<typeof ActivitySchema>;
export type ActivityKind = z.infer<typeof ActivityKindSchema>;
export type ActivitySource = z.infer<typeof ActivitySourceSchema>;
export type ListActivitiesQuery = z.infer<typeof ListActivitiesQuerySchema>;
export type ProposalAction = z.infer<typeof ProposalActionSchema>;
export type ProposalCompany = z.infer<typeof ProposalCompanySchema>;
export type ProposalRef = z.infer<typeof ProposalRefSchema>;
export type ProposalStart = z.infer<typeof ProposalStartSchema>;
export type Proposal = z.infer<typeof ProposalSchema>;
export type ProposalTrigger = z.infer<typeof ProposalTriggerSchema>;
export type ProposalRunReason = z.infer<typeof ProposalRunReasonSchema>;
export type ProposalRun = z.infer<typeof ProposalRunSchema>;
export type ProposalFeed = z.infer<typeof ProposalFeedSchema>;
