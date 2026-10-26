import { z } from "zod"

// 스캐너(scanner/)가 쓰고 대시보드(src/)가 읽는 파일의 모양. 둘이 이 한 곳을 같이 본다.
// Node 가 타입을 지우고 바로 실행하므로 enum · namespace 같은 지울 수 없는 문법을 쓰지 않는다.

export const STATES = ["done", "partial", "api", "todo"] as const
export const State = z.enum(STATES)
export type State = z.infer<typeof State>

const text = z.string().min(1)

// 설계서 표 한 줄 = 기능 하나. 2.5 는 T번호, 2.3 은 AI-n, 2.6 은 ADM-n.
export const Feature = z.object({
  id: text,
  group: text, // 도메인 id — D1 … D12 · AI · ADM
  name: text,
  major: text, // 주요기능(F) 또는 모듈 이름
  owner: text,
  does: z.string().nullable(),
  rule: z.string().nullable(),
})
export type Feature = z.infer<typeof Feature>

export const Judgment = z.object({
  id: text,
  state: State,
  missing: z.string().nullable(), // 정의서 대비 빠진 것 · 완료면 null
  evidence: z.array(text), // 클론에 실제로 있는 경로만(검사 후)
  scannedAt: z.iso.datetime(),
  commit: text, // 판정한 main 커밋
  previous: State.nullable(), // 직전 판정 — 바뀐 것을 화면에 표시
})
export type Judgment = z.infer<typeof Judgment>

export const Group = z.object({
  id: text,
  name: text,
  owner: text,
  scannedAt: z.iso.datetime().nullable(),
  commit: z.string().nullable(),
})
export type Group = z.infer<typeof Group>

export const PullRequest = z.object({
  number: z.number().int(),
  title: text,
  author: text,
  url: text,
  draft: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  additions: z.number().int(),
  deletions: z.number().int(),
  changedFiles: z.number().int(),
  checks: z.enum(["success", "failure", "pending", "none"]),
  failedChecks: z.array(text),
  mergeable: z.enum(["MERGEABLE", "CONFLICTING", "UNKNOWN"]),
  review: z.enum(["APPROVED", "CHANGES_REQUESTED", "REVIEW_REQUIRED", "NONE"]),
})
export type PullRequest = z.infer<typeof PullRequest>

export const WorkflowRun = z.object({
  workflow: text,
  event: text,
  branch: text,
  status: text,
  conclusion: z.string().nullable(),
  createdAt: z.iso.datetime(),
  url: text,
})
export type WorkflowRun = z.infer<typeof WorkflowRun>

export const Week = z.object({
  week: z.iso.date(), // 월요일
  merged: z.record(z.string(), z.number().int()), // 계정별 머지 PR 수
  commits: z.number().int(),
})

export const Todo = z.object({
  id: text, // 후보 id — feature:T1.2.3 · pr:101 · plan:3
  kind: z.enum(["feature", "pr", "plan"]),
  title: text,
  reason: text,
  href: z.string().nullable(),
  ref: z.string().nullable(), // 설계서 번호 · PR 번호 · 일정 주차
})
export type Todo = z.infer<typeof Todo>

export const Member = z.object({
  name: text,
  logins: z.array(text),
  groups: z.array(text), // 담당 도메인
  todos: z.array(Todo),
  todosAt: z.iso.datetime().nullable(),
})
export type Member = z.infer<typeof Member>

export const Report = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.iso.datetime(),
  repo: text,
  main: z.object({ commit: text, committedAt: z.iso.datetime(), subject: text }),
  // 기능 판정을 마지막으로 돌린 커밋 · 시각과 마지막 전체 판정 시각. 다음 실행이 다시 볼 도메인을 고를 때 쓴다.
  scan: z.object({
    judgedCommit: z.string().nullable(),
    judgedAt: z.iso.datetime().nullable(),
    fullAt: z.iso.datetime().nullable(),
    specHash: z.record(z.string(), z.string()),
  }),
  semester: z.object({ week2Start: z.iso.date(), weeks: z.number().int() }),
  plan: z.array(z.object({ name: text, from: z.number().int(), to: z.number().int(), owners: z.array(text) })),
  groups: z.array(Group),
  features: z.array(Feature),
  judgments: z.array(Judgment),
  members: z.array(Member),
  pulls: z.array(PullRequest),
  runs: z.array(WorkflowRun),
  activity: z.array(Week),
})
export type Report = z.infer<typeof Report>

export const HistoryPoint = z.object({
  at: z.iso.datetime(),
  commit: text,
  groups: z.record(z.string(), z.record(State, z.number().int())),
})
export const History = z.array(HistoryPoint)
export type HistoryPoint = z.infer<typeof HistoryPoint>

export const ScanRun = z.object({
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime(),
  ok: z.boolean(),
  commit: z.string().nullable(),
  judged: z.array(text), // 이번에 다시 판정한 도메인
  reason: text, // 왜 그 도메인을 봤는지 · 왜 판정을 건너뛰었는지
  evidenceKept: z.number().int(),
  evidenceDropped: z.number().int(),
  costUsd: z.number(),
  error: z.string().nullable(),
})
export const ScanRuns = z.array(ScanRun)
export type ScanRun = z.infer<typeof ScanRun>
