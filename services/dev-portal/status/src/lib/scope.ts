// 작업 범위 · 분량 그림이 쓰는 계산. 별칭(@/) 없이 두어 node --test 로 바로 돈다.

const WEEK = 7 * 86_400_000

// 학기 주차 좌표. 주 n 은 [n, n+1) 구간이다 — 2주차 첫날 자정이 2.0.
// 「N주차」 배지(semesterWeek)는 이 값을 내림한다.
export function weekPosition(at: number | string | Date, week2Start: string): number {
  const start = new Date(`${week2Start}T00:00:00`).getTime()
  return 2 + (new Date(at).getTime() - start) / WEEK
}

// 학기 끝(weeks 주차 마지막 날)까지 남은 기능을 0 으로 만들려면 주당 몇 개를 끝내야 하는가.
// 이번 주를 포함해 센다. 기능은 쪼갤 수 없으므로 올림한다. 학기가 끝났으면 null.
export function pace(remaining: number, week: number, weeks: number): { weeksLeft: number; perWeek: number } | null {
  const weeksLeft = weeks - week + 1
  if (weeksLeft <= 0) return null
  return { weeksLeft, perWeek: Math.ceil(remaining / weeksLeft) }
}

// 완료가 아닌 기능 수. 판정 전(unknown)도 남은 작업이다.
export const remainingOf = (c: { partial: number; api: number; todo: number; unknown?: number }) =>
  c.partial + c.api + c.todo + (c.unknown ?? 0)

export type Rect = { x: number; y: number; w: number; h: number }

// 가장 나쁜 가로세로 비 — 줄에 하나를 더 넣을지 판단한다(Bruls · Huizing · van Wijk 2000).
function worst(row: number[], side: number): number {
  const sum = row.reduce((a, b) => a + b, 0)
  const max = Math.max(...row)
  const min = Math.min(...row)
  return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min))
}

// squarified treemap 배치. 값이 0 이하인 항목은 빼고, 큰 값부터 놓는다(같은 값은 들어온 순서).
export function squarify<T>(items: Array<{ value: number; item: T }>, rect: Rect): Array<Rect & { item: T }> {
  const list = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value)
  const total = list.reduce((a, i) => a + i.value, 0)
  if (!list.length || rect.w <= 0 || rect.h <= 0) return []
  const scale = (rect.w * rect.h) / total
  const areas = list.map((i) => i.value * scale)

  const out: Array<Rect & { item: T }> = []
  const free = { ...rect }
  let start = 0
  // 짧은 변을 따라 한 줄씩 채운다.
  const place = (end: number) => {
    const row = areas.slice(start, end)
    const sum = row.reduce((a, b) => a + b, 0)
    if (free.w >= free.h) {
      const width = sum / free.h
      let y = free.y
      row.forEach((a, k) => {
        out.push({ x: free.x, y, w: width, h: a / width, item: list[start + k].item })
        y += a / width
      })
      free.x += width
      free.w -= width
    } else {
      const height = sum / free.w
      let x = free.x
      row.forEach((a, k) => {
        out.push({ x, y: free.y, w: a / height, h: height, item: list[start + k].item })
        x += a / height
      })
      free.y += height
      free.h -= height
    }
    start = end
  }
  let end = start
  while (end < areas.length) {
    const side = Math.min(free.w, free.h)
    const row = areas.slice(start, end)
    if (row.length === 0 || worst([...row, areas[end]], side) <= worst(row, side)) end += 1
    else place(end)
  }
  if (start < areas.length) place(areas.length)
  return out
}

// 바깥을 d 만큼 줄인 사각형 — 칸 사이 간격. 너무 작아지면 0 으로 둔다.
export const inset = (r: Rect, d: number): Rect => ({
  x: r.x + d,
  y: r.y + d,
  w: Math.max(0, r.w - 2 * d),
  h: Math.max(0, r.h - 2 * d),
})
