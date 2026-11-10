import { inPeriod, kstDate, sortEntries, type Draft, type PatchNoteEntry, type PatchNotes } from "../shared/patch-notes.ts"

// 생성기의 계산 부분 — 파일 · 네트워크 · AI 를 부르지 않는다. 테스트가 이 파일을 본다.

export type Pull = { number: number; title: string; body: string; mergedAt: string; url: string; files: string[] }
export type Pending = PatchNotes["pending"][number]

// 이미 패치노트에 있는 PR. 정리본은 PR 여러 개를 한 항목으로 묶으므로 prs 를 모두 펼친다.
export function coveredPrs(entries: PatchNoteEntry[]): Set<number> {
  return new Set(entries.flatMap((e) => e.prs))
}

// 새로 쓸 PR — 기간 안에 머지됐고 아직 없는 것, 먼저 머지된 것부터.
export function selectTodo(pulls: Pull[], covered: Set<number>, period: { from: string; to: string }): Pull[] {
  return pulls
    .filter((p) => inPeriod(p.mergedAt, period) && !covered.has(p.number))
    .sort((a, b) => Date.parse(a.mergedAt) - Date.parse(b.mergedAt))
}

export function entryFor(pull: Pull, draft: Draft): PatchNoteEntry {
  return { id: `pr-${pull.number}`, date: kstDate(pull.mergedAt), mergedAt: pull.mergedAt, prs: [pull.number], ...draft }
}

// 정리본은 매번 파일에서 다시 읽고, 생성한 항목(pr-*)만 이전 결과에서 이어받는다.
// 정리본에 들어간 PR 의 생성 항목은 버린다 — 사람이 다듬은 문구가 이긴다.
export function generatedOf(previous: PatchNotes | null, seed: PatchNoteEntry[]): PatchNoteEntry[] {
  const seeded = coveredPrs(seed)
  return (previous?.entries ?? []).filter((e) => e.id.startsWith("pr-") && !e.prs.some((n) => seeded.has(n)))
}

export function buildNotes(input: {
  now: Date
  period: { from: string; to: string }
  seed: PatchNoteEntry[]
  generated: PatchNoteEntry[]
  pending: Pending[]
}): PatchNotes {
  return {
    generatedAt: input.now.toISOString(),
    period: input.period,
    entries: sortEntries([...input.seed, ...input.generated]),
    pending: input.pending,
  }
}
