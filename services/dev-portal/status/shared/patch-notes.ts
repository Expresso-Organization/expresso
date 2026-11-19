import { z } from "zod"

// 패치노트 — 생성기(patch-notes/main.ts)가 쓰고 화면(src/patch-notes)이 읽는 형식.
// 서버에서는 /var/lib/expresso-status/patch-notes.json 에 쓰고 nginx 가 /status/data/ 로 내보낸다.

export const KINDS = ["user", "dev"] as const
export type Kind = (typeof KINDS)[number]

// AI 가 PR 하나를 읽고 쓰는 세 칸. 화면에 보이는 문구 전부다.
export const Draft = z.object({
  kind: z.enum(KINDS).describe("user: 제품을 쓰는 사람이 화면 · 동작에서 겪는 변경. dev: CI · 테스트 · 문서 · 서버 운영 · 실험처럼 제품 화면에 드러나지 않는 변경"),
  title: z.string().trim().min(1).describe("변경 이름. 명사구. 예: 포트폴리오 휴지통"),
  details: z.array(z.string().trim().min(1)).min(1).describe("사용자가 보는 결과를 한 줄에 한 가지씩 쓴 완결형 존댓말 문장"),
})
export type Draft = z.infer<typeof Draft>

export const PatchNoteEntry = Draft.extend({
  id: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // 머지 시각의 KST 날짜
  mergedAt: z.string(), // 묶은 PR 중 가장 늦은 머지 시각(ISO)
  prs: z.array(z.number().int().positive()).min(1),
})
export type PatchNoteEntry = z.infer<typeof PatchNoteEntry>

export const PatchNotes = z.object({
  generatedAt: z.string(),
  period: z.object({ from: z.string(), to: z.string() }), // KST 날짜, 양 끝 포함
  entries: z.array(PatchNoteEntry),
  // 이번 실행에서 문구를 받지 못한 PR. 다음 실행에서 다시 시도한다.
  pending: z.array(z.object({ pr: z.number().int(), title: z.string(), reason: z.string(), attempts: z.number().int() })),
})
export type PatchNotes = z.infer<typeof PatchNotes>

const KST_MS = 9 * 60 * 60 * 1000

// ISO 시각 → KST 날짜(YYYY-MM-DD)
export function kstDate(iso: string): string {
  return new Date(Date.parse(iso) + KST_MS).toISOString().slice(0, 10)
}

export function inPeriod(iso: string, period: { from: string; to: string }): boolean {
  const day = kstDate(iso)
  return day >= period.from && day <= period.to
}

// 화면 순서 — 날짜 내림차순, 같은 날은 늦게 머지된 것부터.
export function sortEntries(entries: PatchNoteEntry[]): PatchNoteEntry[] {
  return [...entries].sort((a, b) => (a.date === b.date ? Date.parse(b.mergedAt) - Date.parse(a.mergedAt) : a.date < b.date ? 1 : -1))
}
