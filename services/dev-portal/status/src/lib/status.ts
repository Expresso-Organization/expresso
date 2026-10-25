import { z } from "zod"

// docs/status/status.json 의 모양. 화면은 이 스키마로 검사한 값만 그립니다.
export const STATES = ["done", "partial", "api", "todo"] as const
export type State = (typeof STATES)[number]

export const STATE_LABEL: Record<State, string> = {
  done: "완료",
  partial: "부분",
  api: "API만",
  todo: "미구현",
}

export const STATE_HELP: Record<State, string> = {
  done: "정의서의 동작과 규칙을 모두 충족하고 화면에서 쓸 수 있음",
  partial: "동작하는 경로가 있으나 규칙 일부가 빠졌거나 화면 일부만 연결됨",
  api: "백엔드 경로는 있으나 웹 화면에서 호출하지 않음",
  todo: "근거 코드를 찾지 못함",
}

const state = z.enum(STATES)
const text = z.string().min(1)
const optionalText = text.nullable()

const task = z.object({
  id: text,
  name: text,
  state,
  missing: optionalText,
  evidence: optionalText,
})

export const statusSchema = z.object({
  schemaVersion: z.literal(1),
  asOf: z.iso.date(),
  commit: text,
  semester: z.object({ week2Start: z.iso.date(), weeks: z.number().int(), basis: text }),
  owners: z.array(text),
  sources: z.array(z.object({ label: text, value: text })),
  limits: text,
  focus: z.array(z.object({ title: text, body: text, owners: z.array(text) })),
  schedule: z.array(
    z.object({
      phase: text,
      name: text,
      from: z.number().int(),
      to: z.number().int(),
      state: z.enum(["done", "wip", "pilot", "todo"]),
      note: optionalText,
    })
  ),
  milestones: z.array(
    z.object({
      id: text,
      name: text,
      items: z.array(z.object({ name: text, state, note: text })),
    })
  ),
  domains: z.array(
    z.object({ id: text, name: text, owner: text, note: optionalText, tasks: z.array(task) })
  ),
  ai: z.object({
    owner: text,
    branch: text,
    summary: text,
    modules: z.array(
      z.object({ name: text, numbers: text, state: z.enum(["pilot", "todo"]), note: optionalText })
    ),
    pilot: z.array(
      z.object({
        model: text,
        baseline: z.boolean(),
        ndcg: z.number(),
        pairwise: z.number(),
        mae: z.number(),
      })
    ),
    pilotNote: text,
    unmeasured: z.array(text),
  }),
  admin: z.array(
    z.object({ no: text, group: text, name: text, state, note: optionalText, owner: text })
  ),
  prs: z.array(
    z.object({ number: z.number().int(), group: text, title: text, author: text, updated: z.iso.date() })
  ),
  prNote: text,
  next: z.array(
    z.object({
      task: text,
      scope: text,
      owner: text,
      owners: z.array(text),
      from: z.number().int(),
      to: z.number().int(),
      weekNote: optionalText,
    })
  ),
})

export type Status = z.infer<typeof statusSchema>
export type Domain = Status["domains"][number]
export type Task = Domain["tasks"][number] & { domain: string; domainName: string; owner: string }

export async function loadStatus(): Promise<Status> {
  const response = await fetch("./status.json", { cache: "no-cache" })
  if (!response.ok) throw new Error(`status.json 요청 실패 (HTTP ${response.status})`)
  const parsed = statusSchema.safeParse(await response.json())
  if (!parsed.success) throw new Error(`status.json 형식 오류 — ${z.prettifyError(parsed.error)}`)
  return parsed.data
}

export function countStates<T extends { state: State }>(rows: T[]): Record<State, number> {
  const counts: Record<State, number> = { done: 0, partial: 0, api: 0, todo: 0 }
  for (const row of rows) counts[row.state] += 1
  return counts
}

export function allTasks(status: Status): Task[] {
  return status.domains.flatMap((d) =>
    d.tasks.map((t) => ({ ...t, domain: d.id, domainName: d.name, owner: d.owner }))
  )
}

const DAY = 86_400_000

// 학기 주차. 2주차가 시작하는 월요일을 기준으로 7일씩 셉니다.
// 소수부는 그 주에서 지난 비율이라 일정 막대 위의 오늘 선 위치가 됩니다.
export function semesterPosition(week2Start: string, today = new Date()): number {
  const start = new Date(`${week2Start}T00:00:00`)
  const local = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const days = Math.round((local.getTime() - start.getTime()) / DAY)
  return 2 + (days + 1) / 7
}

export function weekOf(position: number): number {
  return Math.ceil(position - 1)
}

export function weekRange(week2Start: string, from: number, to: number): string {
  const start = new Date(`${week2Start}T00:00:00`)
  const a = new Date(start.getTime() + (from - 2) * 7 * DAY)
  const b = new Date(start.getTime() + ((to - 2) * 7 + 6) * DAY)
  const f = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`
  return `${f(a)} – ${f(b)}`
}
