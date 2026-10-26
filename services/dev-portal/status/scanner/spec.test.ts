import assert from "node:assert/strict"
import { resolve } from "node:path"
import { test } from "node:test"

import { readSpec } from "./spec.ts"

const repo = resolve(import.meta.dirname, "../../../..")

test("설계서 2.5 · 2.3 · 2.6 표에서 기능을 모두 읽는다", () => {
  const { features, groups } = readSpec(repo)
  const count = (prefix: string) => features.filter((f) => f.id.startsWith(prefix)).length
  assert.equal(count("T"), 150)
  assert.equal(count("AI-"), 35)
  assert.equal(count("ADM-"), 24)
  assert.equal(new Set(features.map((f) => f.id)).size, features.length, "기능 id 가 겹친다")
  assert.deepEqual(
    groups.map((g) => g.id),
    ["D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10", "D11", "D12", "AI", "ADM"]
  )
})

test("task-spec.js 의 동작 · 규칙을 T번호에 붙인다", () => {
  const { features } = readSpec(repo)
  const t = features.find((f) => f.id === "T1.1.1")
  assert.ok(t?.does?.includes("7종"))
  assert.equal(t?.owner, "오시건")
})
