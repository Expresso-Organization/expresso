import assert from "node:assert/strict"
import { test } from "node:test"

import { pace, remainingOf, squarify, weekPosition, type Rect } from "./scope.ts"

const overlap = (a: Rect, b: Rect) => {
  const eps = 1e-6
  return a.x + a.w > b.x + eps && b.x + b.w > a.x + eps && a.y + a.h > b.y + eps && b.y + b.h > a.y + eps
}

test("squarify 는 전체 넓이를 겹치지 않게 나눈다", () => {
  const rect = { x: 0, y: 0, w: 800, h: 440 }
  const values = [63, 63, 33, 31, 19]
  const out = squarify(
    values.map((value, i) => ({ value, item: i })),
    rect
  )
  assert.equal(out.length, values.length)
  const area = out.reduce((a, r) => a + r.w * r.h, 0)
  assert.ok(Math.abs(area - rect.w * rect.h) < 1e-6)
  for (const r of out) {
    assert.ok(r.x >= -1e-6 && r.y >= -1e-6 && r.x + r.w <= rect.w + 1e-6 && r.y + r.h <= rect.h + 1e-6)
    // 넓이는 값에 비례한다.
    assert.ok(Math.abs((r.w * r.h) / area - values[r.item] / 209) < 1e-9)
  }
  for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) assert.ok(!overlap(out[i], out[j]))
})

test("squarify 는 같은 값을 들어온 순서대로 놓고 0 은 뺀다", () => {
  const out = squarify(
    ["a", "b", "c", "d", "z"].map((item) => ({ value: item === "z" ? 0 : 1, item })),
    { x: 10, y: 20, w: 100, h: 100 }
  )
  assert.deepEqual(
    out.map((r) => r.item),
    ["a", "b", "c", "d"]
  )
  assert.equal(squarify([{ value: 1, item: "a" }], { x: 0, y: 0, w: 0, h: 10 }).length, 0)
})

test("pace 는 이번 주를 포함한 남은 주로 나눠 올림한다", () => {
  assert.deepEqual(pace(197, 10, 15), { weeksLeft: 6, perWeek: 33 })
  assert.deepEqual(pace(0, 15, 15), { weeksLeft: 1, perWeek: 0 })
  assert.equal(pace(10, 16, 15), null)
})

test("weekPosition 은 2주차 첫날 자정이 2.0 이고 semesterWeek 는 그 내림이다", () => {
  assert.equal(weekPosition("2026-08-31T00:00:00", "2026-08-31"), 2)
  assert.equal(Math.floor(weekPosition("2026-10-26T09:00:00", "2026-08-31")), 10)
  assert.equal(Math.floor(weekPosition("2026-10-25T23:59:00", "2026-08-31")), 9)
})

test("remainingOf 는 판정 전도 남은 작업으로 센다", () => {
  assert.equal(remainingOf({ partial: 93, api: 29, todo: 75 }), 197)
  assert.equal(remainingOf({ partial: 1, api: 1, todo: 1, unknown: 2 }), 5)
})
