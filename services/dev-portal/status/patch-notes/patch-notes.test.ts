import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"

import { z } from "zod"

import { PatchNoteEntry, inPeriod, kstDate, sortEntries } from "../shared/patch-notes.ts"
import { buildNotes, coveredPrs, generatedOf, selectTodo, type Pull } from "./notes.ts"
import { checkFields, parseObject, writeDraft, type Ask } from "./writer.ts"

const seed = z
  .object({ entries: z.array(PatchNoteEntry) })
  .parse(JSON.parse(readFileSync(join(import.meta.dirname, "seed.json"), "utf8"))).entries
const period = { from: "2026-11-02", to: "2026-12-01" }
const pull = (number: number, mergedAt: string): Pull => ({ number, title: `PR ${number}`, body: "", mergedAt, url: "", files: [] })

test("정리본의 날짜는 묶은 PR 의 KST 머지 날짜와 같다", () => {
  for (const e of seed) assert.equal(kstDate(e.mergedAt), e.date, `${e.id} ${e.title}`)
})

test("KST 기간은 양 끝 날짜를 포함한다", () => {
  assert.equal(kstDate("2026-11-01T15:00:00Z"), "2026-11-02")
  assert.equal(inPeriod("2026-11-01T14:59:59Z", period), false)
  assert.equal(inPeriod("2026-11-01T15:00:00Z", period), true)
  assert.equal(inPeriod("2026-12-01T14:59:59Z", period), true)
  assert.equal(inPeriod("2026-12-01T15:00:00Z", period), false)
})

test("정리본이 묶은 PR 은 모두 이미 쓴 것으로 본다", () => {
  const covered = coveredPrs(seed)
  for (const n of [197, 195, 188, 163, 166]) assert.ok(covered.has(n), `#${n}`)
  const todo = selectTodo([pull(188, "2026-11-10T02:00:00Z"), pull(300, "2026-11-12T01:00:00Z"), pull(299, "2026-11-11T01:00:00Z")], covered, period)
  assert.deepEqual(todo.map((p) => p.number), [299, 300])
})

test("기간 밖 PR 은 고르지 않는다", () => {
  const todo = selectTodo([pull(1, "2026-11-01T10:00:00Z"), pull(2, "2026-12-02T01:00:00Z")], new Set(), period)
  assert.deepEqual(todo, [])
})

test("정리본에 들어간 PR 의 생성 항목은 버린다", () => {
  const generated = { ...seed[0], id: "pr-188", prs: [188] }
  const kept = { ...seed[0], id: "pr-400", prs: [400] }
  const previous = buildNotes({ now: new Date(), period, seed, generated: [generated, kept], pending: [] })
  assert.deepEqual(generatedOf(previous, seed).map((e) => e.id), ["pr-400"])
})

test("항목은 날짜 내림차순, 같은 날은 늦게 머지된 것부터", () => {
  const sorted = sortEntries(seed)
  for (let i = 1; i < sorted.length; i++) {
    const [a, b] = [sorted[i - 1], sorted[i]]
    assert.ok(a.date > b.date || (a.date === b.date && Date.parse(a.mergedAt) >= Date.parse(b.mergedAt)), `${a.id} → ${b.id}`)
  }
})

test("코드 울타리와 앞뒤 글이 붙은 답에서 JSON 을 꺼낸다", () => {
  const { value } = parseObject('설명\n```json\n{"kind":"user","title":"검색 개선","details":["찾을 수 있습니다."]}\n```')
  assert.deepEqual(checkFields(value!), {})
})

const draft = { kind: "user", title: "검색 개선", details: ["회사 이름으로 찾을 수 있습니다."] }
function scripted(replies: string[]): { ask: Ask; prompts: Array<{ prompt: string; resume: string | null }> } {
  const prompts: Array<{ prompt: string; resume: string | null }> = []
  const ask: Ask = async (input) => {
    prompts.push(input)
    return { text: replies[prompts.length - 1], sessionId: "s1", costUsd: 0.01 }
  }
  return { ask, prompts }
}

test("형식이 맞으면 한 번에 끝난다", async () => {
  const { ask, prompts } = scripted([JSON.stringify(draft)])
  const result = await writeDraft(pull(1, "2026-11-11T00:00:00Z"), ask, 3)
  assert.deepEqual(result.draft, draft)
  assert.equal(prompts.length, 1)
})

test("틀린 칸만 같은 대화에서 다시 받아 덮는다", async () => {
  const { ask, prompts } = scripted([JSON.stringify({ ...draft, details: [] }), JSON.stringify({ details: draft.details })])
  const result = await writeDraft(pull(1, "2026-11-11T00:00:00Z"), ask, 3)
  assert.deepEqual(result.draft, draft)
  assert.equal(prompts[1].resume, "s1")
  assert.match(prompts[1].prompt, /details/)
  assert.doesNotMatch(prompts[1].prompt, /- title/)
})

test("깨진 JSON 은 같은 대화에서 다시 받는다", async () => {
  const { ask, prompts } = scripted(['{"kind":"user","title":"검색 개선","details":["찾습니다."]', JSON.stringify(draft)])
  const result = await writeDraft(pull(1, "2026-11-11T00:00:00Z"), ask, 3)
  assert.deepEqual(result.draft, draft)
  assert.equal(prompts[1].resume, "s1")
})

test("고쳐도 나아지지 않으면 멈춘다", async () => {
  const bad = JSON.stringify({ ...draft, kind: "both" })
  const { ask } = scripted([bad, JSON.stringify({ kind: "both" })])
  await assert.rejects(writeDraft(pull(1, "2026-11-11T00:00:00Z"), ask, 3), /나아지지 않습니다/)
})
