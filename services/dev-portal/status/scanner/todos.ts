import { z } from "zod"

import type { Feature, Judgment, PullRequest, Todo } from "../shared/report.ts"
import { callAgent } from "./agent.ts"

// 팀원별 할 일. 후보는 코드가 사실에서 만들고, 에이전트는 그중에서 고르고 순서와 이유만 붙인다.
// 후보에 없는 id 를 답하면 버린다 — 할 일이 지어낸 말이 되지 않게 하는 장치다.

export type Candidate = {
  id: string
  kind: Todo["kind"]
  title: string
  facts: string // 에이전트에게 주는 근거 한 줄
  href: string | null
  ref: string | null
}

const STATE_WORD = { done: "완료", partial: "부분", api: "API만", todo: "미구현" } as const

export function candidatesFor(options: {
  member: string
  logins: string[]
  features: Feature[]
  judgments: Map<string, Judgment>
  pulls: PullRequest[]
  plan: Array<{ name: string; from: number; to: number; owners: string[] }>
  week: number
  staleDays: number
  now: Date
  repo: string
}): Candidate[] {
  const out: Candidate[] = []
  const designDoc = `https://github.com/${options.repo}/blob/main/docs/design-doc/02-요구사항-정의.md`

  for (const p of options.pulls) {
    if (!options.logins.includes(p.author)) continue
    const idle = Math.floor((options.now.getTime() - new Date(p.updatedAt).getTime()) / 86_400_000)
    const problems = [
      p.checks === "failure" ? `CI 실패(${p.failedChecks.join(", ")})` : null,
      p.mergeable === "CONFLICTING" ? "main 과 충돌" : null,
      p.review === "CHANGES_REQUESTED" ? "변경 요청 받음" : null,
      idle > options.staleDays ? `${idle}일째 갱신 없음` : null,
      p.review === "REVIEW_REQUIRED" ? "리뷰 대기" : null,
    ].filter(Boolean)
    if (!problems.length && !p.draft) {
      out.push({ id: `pr:${p.number}`, kind: "pr", title: `#${p.number} ${p.title}`, facts: "CI 통과 · 충돌 없음 — 머지 대기", href: p.url, ref: `#${p.number}` })
      continue
    }
    out.push({ id: `pr:${p.number}`, kind: "pr", title: `#${p.number} ${p.title}`, facts: problems.join(" · ") || "초안", href: p.url, ref: `#${p.number}` })
  }

  for (const [i, item] of options.plan.entries()) {
    const mine = item.owners.includes("*") || item.owners.includes(options.member)
    const live = options.week >= item.from - 1 && options.week <= item.to
    if (!mine || !live) continue
    out.push({
      id: `plan:${i}`,
      kind: "plan",
      title: item.name,
      facts: `제안서 일정 ${item.from}–${item.to}주 · 지금 ${options.week}주차${options.week > item.to ? " · 기한 지남" : options.week === item.to ? " · 이번 주 마감" : ""}`,
      href: null,
      ref: `${item.from}–${item.to}주`,
    })
  }

  for (const f of options.features) {
    if (f.owner !== options.member) continue
    const j = options.judgments.get(f.id)
    if (!j || j.state === "done") continue
    out.push({
      id: `feature:${f.id}`,
      kind: "feature",
      title: `${f.id} ${f.name}`,
      facts: `${STATE_WORD[j.state]} — ${j.missing ?? "구현 코드 없음"}${j.evidence[0] ? ` (${j.evidence[0]})` : ""}`,
      href: j.evidence[0] ? `https://github.com/${options.repo}/blob/main/${j.evidence[0].replace(/:(\d+)$/, "#L$1")}` : designDoc,
      ref: f.id,
    })
  }
  return out
}

const Output = z.object({
  picks: z.array(z.object({ id: z.string(), reason: z.string() })),
})

const SYSTEM = `너는 Expresso 팀의 개발 진행을 돕는다. 한 팀원의 할 일 후보 목록에서 지금 먼저 할 것을 고른다.
- 후보 id 만 쓴다. 목록에 없는 일을 만들지 않는다.
- 막힌 PR(CI 실패 · 충돌 · 변경 요청)과 기한이 지났거나 이번 주에 끝나는 일정을 먼저 둔다.
- 기능 후보는 같은 화면 · 모듈을 함께 끝낼 수 있는 것, 미구현보다 부분 · API만(조금만 더 하면 끝나는 것)을 앞에 둔다.
- reason 은 왜 지금 이것인지 한국어 한 줄(60자 이내)로, 후보의 사실에 근거해 쓴다.`

export async function rankTodos(options: {
  cli: string
  cwd: string
  model: string
  member: string
  week: number
  candidates: Candidate[]
  limit: number
  budgetUsd: number
}): Promise<{ todos: Todo[]; costUsd: number }> {
  if (!options.candidates.length) return { todos: [], costUsd: 0 }
  const byId = new Map(options.candidates.map((c) => [c.id, c]))
  const prompt = `팀원: ${options.member} · 학기 ${options.week}주차
아래 후보에서 지금 할 일을 최대 ${options.limit}개 골라 순서대로 답하라.

${options.candidates.map((c) => `- ${c.id} | ${c.title} | ${c.facts}`).join("\n")}`
  const result = await callAgent<z.infer<typeof Output>>({
    cli: options.cli,
    cwd: options.cwd,
    model: options.model,
    system: SYSTEM,
    prompt,
    schema: Output,
    tools: [],
    budgetUsd: options.budgetUsd,
    timeoutMs: 180_000,
  })
  const seen = new Set<string>()
  const todos: Todo[] = []
  for (const pick of result.data.picks) {
    const c = byId.get(pick.id)
    if (!c || seen.has(c.id)) continue
    seen.add(c.id)
    todos.push({ id: c.id, kind: c.kind, title: c.title, reason: pick.reason, href: c.href, ref: c.ref })
    if (todos.length >= options.limit) break
  }
  return { todos, costUsd: result.costUsd }
}
