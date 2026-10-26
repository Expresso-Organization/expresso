import assert from "node:assert/strict"
import { resolve } from "node:path"
import { test } from "node:test"

import type { Feature, Judgment, PullRequest } from "../shared/report.ts"
import { checkEvidence } from "./judge.ts"
import { candidatesFor } from "./todos.ts"

const repo = resolve(import.meta.dirname, "../../../..")

test("근거 경로는 실제 파일만 남기고, 파일 길이를 넘는 줄 번호는 뗀다", () => {
  const { kept, dropped } = checkEvidence(repo, [
    "services/dev-portal/status/scanner/judge.ts:3",
    "./services/dev-portal/status/scanner/judge.ts:999999",
    "services/없는-파일.ts:10",
    "../etc/passwd",
    "services/dev-portal/status/scanner", // 폴더는 근거가 아니다
  ])
  assert.deepEqual(kept, ["services/dev-portal/status/scanner/judge.ts:3", "services/dev-portal/status/scanner/judge.ts"])
  assert.equal(dropped, 3)
})

const feature = (id: string, owner: string): Feature => ({ id, group: "D1", name: `기능 ${id}`, major: "F", owner, does: null, rule: null })
const judgment = (id: string, state: Judgment["state"]): Judgment => ({
  id,
  state,
  missing: state === "done" ? null : "빠진 것",
  evidence: ["a.ts:1"],
  scannedAt: "2026-10-25T00:00:00.000Z",
  commit: "abc",
  previous: null,
})
const pull = (number: number, author: string, patch: Partial<PullRequest> = {}): PullRequest => ({
  number,
  title: `PR ${number}`,
  author,
  url: `https://example.test/${number}`,
  draft: false,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-24T00:00:00.000Z",
  additions: 1,
  deletions: 1,
  changedFiles: 1,
  checks: "success",
  failedChecks: [],
  mergeable: "MERGEABLE",
  review: "NONE",
  ...patch,
})

test("할 일 후보 — 내 PR · 이번 주 일정 · 완료가 아닌 내 기능만", () => {
  const out = candidatesFor({
    member: "오시건",
    logins: ["dhtlrjs5"],
    features: [feature("T1", "오시건"), feature("T2", "오시건"), feature("T3", "박민재")],
    judgments: new Map([
      ["T1", judgment("T1", "done")],
      ["T2", judgment("T2", "partial")],
      ["T3", judgment("T3", "todo")],
    ]),
    pulls: [pull(71, "dhtlrjs5", { checks: "failure", failedChecks: ["백엔드 CI"] }), pull(99, "someone-else")],
    plan: [
      { name: "지난 일", from: 2, to: 3, owners: ["*"] },
      { name: "이번 주 일", from: 8, to: 10, owners: ["*"] },
      { name: "남의 일", from: 8, to: 10, owners: ["채서현"] },
    ],
    week: 9,
    staleDays: 7,
    now: new Date("2026-10-25T00:00:00.000Z"),
    repo: "o/r",
  })
  assert.deepEqual(
    out.map((c) => c.id),
    ["pr:71", "plan:1", "feature:T2"]
  )
  assert.match(out[0].facts, /CI 실패\(백엔드 CI\)/)
  assert.equal(out[2].href, "https://github.com/o/r/blob/main/a.ts#L1")
})
