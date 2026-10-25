import { z } from "zod"

import {
  History,
  Report,
  STATES,
  ScanRuns,
  type Feature,
  type HistoryPoint,
  type Judgment,
  type PullRequest,
  type ScanRun,
  type State,
} from "../../shared/report.ts"

export { STATES }
export type { Feature, HistoryPoint, Judgment, PullRequest, ScanRun, State }

// 스캐너가 쓴 파일을 읽는다. 서버에서는 nginx 가 /status/data/ 를 /var/lib/expresso-status 로 잇고,
// 로컬에서는 docs/status/data/ 다. 둘 다 이 페이지 옆의 ./data/ 다.
async function get<T>(name: string, schema: z.ZodType<T>, optional = false): Promise<T | null> {
  const response = await fetch(`./data/${name}`, { cache: "no-cache" })
  if (optional && response.status === 404) return null
  if (!response.ok) throw new Error(`${name} 요청 실패 (HTTP ${response.status})`)
  const parsed = schema.safeParse(await response.json())
  if (!parsed.success) throw new Error(`${name} 형식 오류 — ${z.prettifyError(parsed.error)}`)
  return parsed.data
}

export type Data = { report: Report; history: HistoryPoint[]; runs: ScanRun[] }

export async function loadData(): Promise<Data> {
  const [report, history, runs] = await Promise.all([
    get("report.json", Report),
    get("history.json", History, true),
    get("runs.json", ScanRuns, true),
  ])
  return { report: report!, history: history ?? [], runs: runs ?? [] }
}

export const STATE_LABEL: Record<State, string> = { done: "완료", partial: "부분", api: "API만", todo: "미구현" }
export const STATE_HELP: Record<State, string> = {
  done: "정의서의 동작과 규칙을 모두 충족하고 화면에서 쓸 수 있음",
  partial: "동작하는 경로가 있으나 규칙 일부가 빠졌거나 화면 일부만 연결됨",
  api: "백엔드 경로는 있으나 웹 화면에서 호출하지 않음",
  todo: "근거 코드를 찾지 못함",
}

export type Row = Feature & { judgment: Judgment | null; groupName: string }

export function rows(report: Report): Row[] {
  const byId = new Map(report.judgments.map((j) => [j.id, j]))
  const names = new Map(report.groups.map((g) => [g.id, g.name]))
  return report.features.map((f) => ({ ...f, judgment: byId.get(f.id) ?? null, groupName: names.get(f.group) ?? f.group }))
}

export function countStates(list: Array<{ judgment: Judgment | null }>): Record<State, number> & { unknown: number } {
  const c = { done: 0, partial: 0, api: 0, todo: 0, unknown: 0 }
  for (const r of list) {
    if (r.judgment) c[r.judgment.state] += 1
    else c.unknown += 1
  }
  return c
}

// 최근 스캔에서 판정이 바뀐 기능. 판정한 지 7일이 지난 변화는 더 표시하지 않는다.
export function changed(j: Judgment | null, now = Date.now()): "up" | "down" | null {
  if (!j?.previous || j.previous === j.state) return null
  if (now - new Date(j.scannedAt).getTime() > 7 * 86_400_000) return null
  return STATES.indexOf(j.state) < STATES.indexOf(j.previous) ? "up" : "down"
}

// 손봐야 할 PR — CI 실패 · 충돌 · 변경 요청 · 오래 멈춤.
export function needsAction(p: PullRequest, staleDays = 7, now = Date.now()): string[] {
  const idle = Math.floor((now - new Date(p.updatedAt).getTime()) / 86_400_000)
  return [
    p.checks === "failure" ? "CI 실패" : null,
    p.mergeable === "CONFLICTING" ? "충돌" : null,
    p.review === "CHANGES_REQUESTED" ? "변경 요청" : null,
    idle > staleDays ? `${idle}일 멈춤` : null,
  ].filter((v): v is string => v !== null)
}

const DAY = 86_400_000

export function semesterWeek(week2Start: string, now = new Date()): number {
  const start = new Date(`${week2Start}T00:00:00`).getTime()
  return 2 + Math.floor((now.getTime() - start) / (7 * DAY))
}

export function ago(iso: string | null, now = Date.now()): string {
  if (!iso) return "없음"
  const minutes = Math.round((now - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return "방금"
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours}시간 전`
  return `${Math.round(hours / 24)}일 전`
}

// 이력에서 기준 시각에 가장 가까운(그 이전의) 점. 비교할 이력이 없으면 null.
export function pointBefore(history: HistoryPoint[], before: number): HistoryPoint | null {
  const past = history.filter((h) => new Date(h.at).getTime() <= before)
  return past.at(-1) ?? null
}

export function totals(point: HistoryPoint, groups?: string[]): Record<State, number> {
  const t = { done: 0, partial: 0, api: 0, todo: 0 }
  for (const [id, c] of Object.entries(point.groups)) {
    if (groups && !groups.includes(id)) continue
    for (const s of STATES) t[s] += c[s] ?? 0
  }
  return t
}

export const githubBlob = (repo: string, commit: string, path: string) => {
  const m = /^(.+?)(?::(\d+))?$/.exec(path)
  return `https://github.com/${repo}/blob/${commit}/${encodeURI(m?.[1] ?? path)}${m?.[2] ? `#L${m[2]}` : ""}`
}
