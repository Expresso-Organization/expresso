import { z } from "zod"

import { PatchNotes, sortEntries, type PatchNoteEntry } from "../../shared/patch-notes.ts"

export type { PatchNoteEntry }

const REPO = "https://github.com/Expresso-Organization/expresso"
export const prUrl = (n: number) => `${REPO}/pull/${n}`

// 생성기가 쓴 파일을 읽는다. 서버에서는 nginx 가 /status/data/ 를 /var/lib/expresso-status 로 잇고,
// 로컬에서는 docs/status/data/ 다(진행 현황과 같은 자리).
export async function loadPatchNotes(): Promise<PatchNotes> {
  const response = await fetch("./data/patch-notes.json", { cache: "no-cache" })
  if (!response.ok) throw new Error(`patch-notes.json 요청 실패 (HTTP ${response.status})`)
  const parsed = PatchNotes.safeParse(await response.json())
  if (!parsed.success) throw new Error(`patch-notes.json 형식 오류 — ${z.prettifyError(parsed.error)}`)
  return parsed.data
}

export type Day = { date: string; user: PatchNoteEntry[]; dev: PatchNoteEntry[] }

// 날짜별로 묶는다. 날짜 안의 순서는 sortEntries(늦게 머지된 것부터)를 따른다.
export function byDay(entries: PatchNoteEntry[]): Day[] {
  const days: Day[] = []
  for (const entry of sortEntries(entries)) {
    let day = days.at(-1)
    if (!day || day.date !== entry.date) {
      day = { date: entry.date, user: [], dev: [] }
      days.push(day)
    }
    day[entry.kind].push(entry)
  }
  return days
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"]

// "2026-11-10" → { month: 11, day: 10, weekday: "화" } — 날짜 문자열 자체가 KST 날짜다.
export function dayParts(date: string) {
  const [y, m, d] = date.split("-").map(Number)
  return { month: m, day: d, weekday: WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] }
}

export function periodLabel(period: { from: string; to: string }) {
  const a = dayParts(period.from)
  const b = dayParts(period.to)
  return `${a.month}월 ${a.day}일 – ${b.month}월 ${b.day}일`
}
