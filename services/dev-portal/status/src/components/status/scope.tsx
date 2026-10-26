import { useLayoutEffect, useMemo, useRef, useState } from "react"
import { Bar, BarChart, CartesianGrid, Cell as BarCell, Line, LineChart, ReferenceArea, ReferenceLine, XAxis, YAxis } from "recharts"

import { Badge } from "@/components/ui/badge"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { STATE_CHART, STATE_COLOR } from "@/components/status/state-badge"
import { STATE_LABEL, STATES, countStates, semesterWeek, totals, type Data, type Row } from "@/lib/data"
import { inset, pace, remainingOf, squarify, weekPosition, type Rect } from "@/lib/scope"

const STILL = { isAnimationActive: false } as const

// 칸 하나 = 기능 하나. 도메인 → 주요기능 → 기능 순으로 겹쳐 나눈다.
type Cell = Rect & { row: Row }
type Block = Rect & { id: string; label: string | null; count: number }

function layout(rows: Row[], order: string[], names: Map<string, string>, width: number, height: number) {
  const byGroup = new Map<string, Map<string, Row[]>>()
  for (const r of rows) {
    const majors = byGroup.get(r.group) ?? new Map<string, Row[]>()
    majors.set(r.major, [...(majors.get(r.major) ?? []), r])
    byGroup.set(r.group, majors)
  }
  const groups = order.filter((g) => byGroup.has(g)).map((g) => ({ id: g, majors: byGroup.get(g)! }))
  const domains: Block[] = []
  const majors: Rect[] = []
  const cells: Cell[] = []
  const count = (m: Map<string, Row[]>) => [...m.values()].reduce((a, l) => a + l.length, 0)

  for (const d of squarify(
    groups.map((g) => ({ value: count(g.majors), item: g })),
    { x: 0, y: 0, w: width, h: height }
  )) {
    const box = inset(d, 2)
    const n = count(d.item.majors)
    // 머리글은 블록이 충분히 클 때만 — 작은 도메인은 칸만 그리고 이름은 칸 설명에 둔다.
    const header = box.w >= 72 && box.h >= 64 ? 18 : 0
    domains.push({ ...box, id: d.item.id, label: header ? `${d.item.id} ${names.get(d.item.id) ?? ""}` : null, count: n })
    const body = { x: box.x, y: box.y + header, w: box.w, h: box.h - header }
    for (const m of squarify(
      [...d.item.majors.values()].map((list) => ({ value: list.length, item: list })),
      body
    )) {
      const mbox = inset(m, 1.5)
      majors.push(mbox)
      for (const c of squarify(
        m.item.map((row) => ({ value: 1, item: row })),
        mbox
      ))
        cells.push({ ...inset(c, Math.min(c.w, c.h) > 10 ? 1 : 0.5), row: c.item })
    }
  }
  return { domains, majors, cells }
}

function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

export function ScopeMap({ data, rows, onPick }: { data: Data; rows: Row[]; onPick: (row: Row) => void }) {
  const { report } = data
  const [ref, width] = useWidth()
  const [hover, setHover] = useState<Row | null>(null)
  // 휴대폰 폭에서는 세로로 길게 — 209칸이 한 칸 25px 안팎이 되도록.
  const height = width && width < 640 ? 520 : 440
  const names = useMemo(() => new Map(report.groups.map((g) => [g.id, g.name])), [report])
  const map = useMemo(
    () => (width ? layout(rows, report.groups.map((g) => g.id), names, width, height) : null),
    [rows, report, names, width, height]
  )
  const c = countStates(rows)

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>작업 범위 지도</CardTitle>
        <CardDescription>칸 하나가 기능 하나 · 도메인 → 주요기능 → 기능 · 누르면 판정 상세</CardDescription>
        <CardAction>
          <Badge variant="outline" className="tabular-nums">
            기능 {rows.length}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <div ref={ref} className="relative w-full" style={{ height }} onMouseLeave={() => setHover(null)}>
          {map?.domains.map((d) => (
            <div key={d.id} className="absolute rounded-md bg-muted/50" style={{ left: d.x, top: d.y, width: d.w, height: d.h }}>
              {d.label && (
                <span className="absolute inset-x-1.5 top-0.5 truncate text-[11px] leading-4 text-muted-foreground">
                  {d.label} · {d.count}
                </span>
              )}
            </div>
          ))}
          {map?.majors.map((m, i) => (
            <div key={i} className="absolute rounded-sm ring-1 ring-border" style={{ left: m.x, top: m.y, width: m.w, height: m.h }} />
          ))}
          {map?.cells.map(({ row, ...r }) => {
            const state = row.judgment?.state ?? null
            return (
              <button
                key={row.id}
                type="button"
                aria-label={`${row.id} ${row.name} · ${state ? STATE_LABEL[state] : "판정 전"}`}
                onClick={() => onPick(row)}
                onMouseEnter={() => setHover(row)}
                onFocus={() => setHover(row)}
                className={`absolute rounded-[2px] outline-offset-1 hover:brightness-110 focus-visible:outline-2 focus-visible:outline-ring ${state ? "" : "bg-muted-foreground/30"} ${hover?.id === row.id ? "outline-2 outline-foreground" : ""}`}
                style={{ left: r.x, top: r.y, width: r.w, height: r.h, background: state ? STATE_COLOR[state] : undefined }}
              />
            )
          })}
        </div>
        <p className="min-h-5 truncate text-xs text-muted-foreground">
          {hover ? (
            <>
              <span className="font-mono">{hover.id}</span> {hover.name} · {hover.group} {hover.major} · {hover.owner} ·{" "}
              {hover.judgment ? STATE_LABEL[hover.judgment.state] : "판정 전"}
            </>
          ) : (
            "칸에 올리면 기능 이름이 여기에 나옵니다"
          )}
        </p>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {STATES.map((s) => (
            <span key={s} className="flex items-center gap-1.5 tabular-nums">
              <span className="size-2 rounded-[2px]" style={{ background: STATE_COLOR[s] }} />
              {STATE_LABEL[s]} {c[s]}
            </span>
          ))}
          {c.unknown > 0 && (
            <span className="flex items-center gap-1.5 tabular-nums">
              <span className="size-2 rounded-[2px] bg-muted-foreground/30" />
              판정 전 {c.unknown}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// 주차 2 … weeks. 눈금 글자는 그 주 칸의 가운데에 둔다 — 가로축 끝은 학기 마지막 날(weeks + 1).
const weekTicks = (weeks: number) => Array.from({ length: weeks - 1 }, (_, i) => i + 2)

export function Burndown({ data, rows, member }: { data: Data; rows: Row[]; member: string | null }) {
  const { report, history } = data
  const { week2Start, weeks } = report.semester
  const remaining = remainingOf(countStates(rows))
  const week = semesterWeek(week2Start, new Date(data.loadedAt))
  const need = pace(remaining, week, weeks)
  const nowX = weekPosition(report.generatedAt, week2Start)

  // 마지막 점은 언제나 지금 판정이다 — 카드의 숫자와 같게. 팀원별 값은 이력에 없어 팀 전체에서만 이력을 앞에 둔다.
  const actual = [
    ...(member ? [] : history.filter((h) => h.at !== report.generatedAt).map((h) => ({ x: weekPosition(h.at, week2Start), actual: remainingOf(totals(h)) }))),
    { x: nowX, actual: remaining },
  ]
  const target = need ? [{ x: nowX, target: remaining }, { x: weeks + 1, target: 0 }] : []
  const config = {
    actual: { label: "남은 기능", color: STATE_COLOR.todo },
    target: { label: "필요 속도", color: "var(--color-muted-foreground)" },
  } satisfies ChartConfig

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>남은 작업 번다운</CardTitle>
        <CardDescription>
          완료가 아닌 기능 수 · 점선은 {weeks}주차 끝에 0이 되는 속도
          {member ? " · 팀원별 값은 스캔 이력에 없어 지금 값만 찍습니다" : ""}
        </CardDescription>
        <CardAction>
          <Badge variant={need ? "default" : "outline"} className="tabular-nums">
            {need ? `주당 ${need.perWeek}개` : "학기 종료"}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        <ChartContainer config={config} className="aspect-auto h-60 w-full">
          <LineChart margin={{ left: 0, right: 12, top: 16 }}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="x"
              type="number"
              domain={[2, weeks + 1]}
              ticks={weekTicks(weeks).map((w) => w + 0.5)}
              interval={0}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => `${Math.floor(v)}`}
            />
            <YAxis width={32} domain={[0, "auto"]} allowDecimals={false} tickLine={false} axisLine={false} />
            {/* 음영이 이번 주 칸 — 일정표와 같은 표시 */}
            {week >= 2 && week <= weeks && <ReferenceArea x1={week} x2={week + 1} fill="var(--color-muted)" fillOpacity={0.8} />}
            <ReferenceLine x={weekPosition(data.loadedAt, week2Start)} stroke="var(--color-foreground)" strokeOpacity={0.5} label={{ value: "지금", position: "top", fontSize: 11, fill: "var(--color-muted-foreground)" }} />
            <ChartTooltip
              content={<ChartTooltipContent indicator="dot" labelFormatter={(_, payload) => `${Math.floor(Number(payload?.[0]?.payload?.x ?? 0))}주차`} />}
            />
            <Line data={target} dataKey="target" type="linear" stroke="var(--color-target)" strokeWidth={1.5} strokeDasharray="5 4" dot={false} {...STILL} />
            <Line data={actual} dataKey="actual" type="linear" stroke="var(--color-actual)" strokeWidth={2} dot={{ r: 3, fill: "var(--color-actual)" }} {...STILL} />
          </LineChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="text-sm text-muted-foreground tabular-nums">
        {need ? `남은 ${remaining}개 ÷ 남은 ${need.weeksLeft}주(${week}–${weeks}주차) = 주당 ${need.perWeek}개` : `남은 ${remaining}개 · ${weeks}주차가 지났습니다`}
      </CardFooter>
    </Card>
  )
}

export function Workload({ data, rows, member, onMember }: { data: Data; rows: Row[]; member: string | null; onMember: (name: string | null) => void }) {
  const { report } = data
  const bars = report.members.map((m) => {
    const c = countStates(rows.filter((r) => r.owner === m.name))
    return { name: m.name, ...c, remaining: remainingOf(c) }
  })
  const unknown = bars.some((b) => b.unknown > 0)
  const config: ChartConfig = { ...STATE_CHART, ...(unknown ? { unknown: { label: "판정 전", color: "var(--color-muted-foreground)" } } : {}) }
  const keys = [...STATES, ...(unknown ? (["unknown"] as const) : [])]

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>팀원별 작업량</CardTitle>
        <CardDescription>담당 기능 수 · 누르면 그 팀원 화면</CardDescription>
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        <ChartContainer config={config} className="aspect-auto w-full" style={{ height: bars.length * 44 + 32 }}>
          <BarChart
            data={bars}
            layout="vertical"
            margin={{ left: 0, right: 12 }}
            className="cursor-pointer"
            onClick={(state) => {
              const name = state.activeLabel
              if (typeof name === "string") onMember(name === member ? null : name)
            }}
          >
            <CartesianGrid horizontal={false} />
            <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="name" width={52} tickLine={false} axisLine={false} />
            <ChartTooltip cursor={{ fill: "var(--color-muted)", opacity: 0.6 }} content={<ChartTooltipContent indicator="dot" />} />
            {keys.map((k) => (
              <Bar key={k} dataKey={k} stackId="a" fill={`var(--color-${k})`} barSize={22} {...STILL}>
                {/* 고른 팀원 외의 막대는 흐리게 */}
                {bars.map((b) => (
                  <BarCell key={b.name} fillOpacity={member && member !== b.name ? 0.3 : 1} />
                ))}
              </Bar>
            ))}
          </BarChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums">
        {bars.map((b) => (
          <span key={b.name} className={member && member !== b.name ? "opacity-50" : undefined}>
            {b.name} 남은 {b.remaining}
          </span>
        ))}
      </CardFooter>
    </Card>
  )
}

export function PlanTimeline({ data, member }: { data: Data; member: string | null }) {
  const { report } = data
  const { week2Start, weeks } = report.semester
  const week = semesterWeek(week2Start, new Date(data.loadedAt))
  const span = weeks - 1 // 2주차 시작 ~ weeks 주차 끝
  const at = (w: number) => `${((w - 2) / span) * 100}%`
  const now = Math.min(Math.max(weekPosition(data.loadedAt, week2Start), 2), weeks + 1)
  const items = report.plan.filter((p) => !member || p.owners.includes("*") || p.owners.includes(member))

  return (
    <Card className="@container/plan h-full">
      <CardHeader>
        <CardTitle>제안서 일정표</CardTitle>
        <CardDescription>제안서의 주차별 일정 · 음영이 이번 주, 세로선이 지금</CardDescription>
        <CardAction>
          <Badge variant="outline" className="tabular-nums">
            {week}주차 / {weeks}주
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        {/* 이름 칸 폭(--label)만큼 비켜 지금 선을 긋는다. 좁은 화면에서는 이름이 막대 위로 올라간다. */}
        <div className="relative flex flex-col gap-2 [--label:0rem] @lg/plan:[--label:15rem]">
          <div className="grid grid-cols-1 gap-x-3 @lg/plan:grid-cols-[calc(var(--label)-0.75rem)_1fr]">
            <span className="hidden @lg/plan:block" />
            <div className="relative h-4 text-[10px] text-muted-foreground tabular-nums">
              {weekTicks(weeks).map((w) => (
                <span key={w} className="absolute -translate-x-1/2" style={{ left: `calc(${at(w + 0.5)})` }}>
                  {w}
                </span>
              ))}
            </div>
          </div>
          {items.map((p) => {
            const state = p.to < week ? "past" : p.from <= week ? "now" : "next"
            const who = p.owners.includes("*") ? "전체" : p.owners.join(" · ")
            return (
              <div key={p.name} className="grid grid-cols-1 items-center gap-x-3 gap-y-1 @lg/plan:grid-cols-[calc(var(--label)-0.75rem)_1fr]">
                <span className="flex min-w-0 items-baseline gap-1.5 text-sm">
                  <span className={`truncate ${state === "past" ? "text-muted-foreground" : "font-medium"}`}>{p.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{who}</span>
                </span>
                <div className="relative h-5 rounded-sm bg-muted/50">
                  <div
                    title={`${p.from}–${p.to}주차 · ${who}`}
                    className={`absolute inset-y-0 rounded-sm ${state === "now" ? "bg-primary" : state === "past" ? "bg-muted-foreground/35" : "bg-primary/25"}`}
                    style={{ left: at(p.from), width: `${((p.to - p.from + 1) / span) * 100}%` }}
                  />
                </div>
              </div>
            )
          })}
          {week >= 2 && week <= weeks && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 bg-muted-foreground/10"
              style={{ left: `calc(var(--label) + (100% - var(--label)) * ${(week - 2) / span})`, width: `calc((100% - var(--label)) / ${span})` }}
            />
          )}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 w-px bg-foreground/60"
            style={{ left: `calc(var(--label) + (100% - var(--label)) * ${(now - 2) / span})` }}
          />
        </div>
      </CardContent>
    </Card>
  )
}
