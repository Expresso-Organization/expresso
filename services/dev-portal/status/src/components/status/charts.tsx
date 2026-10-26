import { useMemo, useState } from "react"
import { Area, AreaChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import { Badge } from "@/components/ui/badge"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { STATE_CHART, STATE_COLOR } from "@/components/status/state-badge"
import { STATE_LABEL, STATES, ago, changed, countStates, semesterWeek, totals, type Data, type Row } from "@/lib/data"

// 등장 애니메이션은 끈다 — 탭을 옮겨 막 그려진 차트에서 시작되지 않는 경우가 있었다.
const STILL = { isAnimationActive: false } as const
const SERIES = ["series-1", "series-2", "series-3", "series-4", "series-5"]
const md = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`
const sortByState = (item: { dataKey?: unknown }) => STATES.indexOf(item.dataKey as (typeof STATES)[number])

export function DomainProgress({
  data,
  rows,
  groups,
  onPick,
}: {
  data: Data
  rows: Row[]
  groups: string[]
  onPick: (group: string) => void
}) {
  const { report, history } = data
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>도메인 진척</CardTitle>
        <CardDescription>막대는 지금 판정, 오른쪽 선은 스캔마다의 완료 수 · 누르면 그 도메인 목록</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {report.groups
          .filter((g) => groups.includes(g.id))
          .map((g) => {
            const mine = rows.filter((r) => r.group === g.id)
            const c = countStates(mine)
            const moved = mine.filter((r) => changed(r.judgment)).length
            const line = history.map((h) => ({ at: h.at, done: h.groups[g.id]?.done ?? 0 }))
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => onPick(g.id)}
                className="grid grid-cols-[9.5rem_1fr_5.5rem] items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-muted/60"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">
                    <span className="font-mono text-xs text-muted-foreground">{g.id}</span> {g.name}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {g.owner} · {g.scannedAt ? ago(g.scannedAt) : "판정 전"}
                    {moved ? ` · 변동 ${moved}` : ""}
                  </span>
                </span>
                <Tooltip>
                  <TooltipTrigger render={<span className="flex h-3 w-full overflow-hidden rounded-full bg-muted" />}>
                    {STATES.map((s) =>
                      c[s] ? <span key={s} style={{ width: `${(c[s] / mine.length) * 100}%`, background: STATE_COLOR[s] }} /> : null
                    )}
                  </TooltipTrigger>
                  <TooltipContent>
                    {STATES.map((s) => `${STATE_LABEL[s]} ${c[s]}`).join(" · ")}
                    {c.unknown ? ` · 판정 전 ${c.unknown}` : ""}
                  </TooltipContent>
                </Tooltip>
                <span className="flex items-center gap-2">
                  <span className="w-9 text-right text-xs tabular-nums">{mine.length ? Math.round((c.done / mine.length) * 100) : 0}%</span>
                  {line.length > 1 ? (
                    <ChartContainer config={{ done: { label: "완료", color: STATE_COLOR.done } }} className="aspect-auto h-6 w-12">
                      <LineChart data={line} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
                        <Line dataKey="done" type="monotone" stroke="var(--color-done)" strokeWidth={2} dot={false} {...STILL} />
                      </LineChart>
                    </ChartContainer>
                  ) : (
                    <span className="w-12" />
                  )}
                </span>
              </button>
            )
          })}
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 px-2 text-xs text-muted-foreground">
          {STATES.map((s) => (
            <span key={s} className="flex items-center gap-1.5">
              <span className="size-2 rounded-[2px]" style={{ background: STATE_COLOR[s] }} />
              {STATE_LABEL[s]}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export function TrendChart({ data, groups }: { data: Data; groups: string[] }) {
  const points = data.history.map((h) => ({ at: h.at, ...totals(h, groups) }))
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>판정 추이</CardTitle>
        <CardDescription>스캔할 때마다 쌓은 판정 수</CardDescription>
        <CardAction>
          <Badge variant="outline" className="tabular-nums">
            스캔 {data.history.length}회
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        {points.length < 2 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            스캔이 두 번 이상 쌓이면 선이 그려집니다. 지금 {points.length}회.
          </p>
        ) : (
          <ChartContainer config={STATE_CHART} className="aspect-auto h-64 w-full">
            <AreaChart data={points} margin={{ left: 0, right: 12, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="at" tickLine={false} axisLine={false} minTickGap={32} tickFormatter={(v: string) => md(v.slice(0, 10))} />
              <YAxis width={32} allowDecimals={false} tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent indicator="dot" labelFormatter={(v) => String(v).slice(0, 16).replace("T", " ")} />} />
              <ChartLegend content={<ChartLegendContent />} itemSorter={sortByState} />
              {STATES.map((s) => (
                <Area key={s} dataKey={s} stackId="a" type="stepAfter" stroke={`var(--color-${s})`} fill={`var(--color-${s})`} fillOpacity={0.55} {...STILL} />
              ))}
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}

export function ActivityChart({ data }: { data: Data }) {
  const { report } = data
  const [metric, setMetric] = useState<"merged" | "commits">("merged")
  const [range, setRange] = useState<"all" | "8w">("all")

  const accounts = useMemo(() => {
    const total = new Map<string, number>()
    for (const w of report.activity) for (const [a, n] of Object.entries(w.merged)) total.set(a, (total.get(a) ?? 0) + n)
    return [...total.entries()].sort((a, b) => b[1] - a[1]).map(([a]) => a)
  }, [report])

  const config = useMemo<ChartConfig>(() => {
    if (metric === "commits") return { commits: { label: "main 커밋", color: "var(--color-series-2)" } }
    return Object.fromEntries(accounts.map((a, i) => [`a${i}`, { label: a, color: `var(--color-${SERIES[i % SERIES.length]})` }]))
  }, [accounts, metric])

  const rows = report.activity.slice(range === "8w" ? -8 : 0).map((w) => {
    const sem = semesterWeek(report.semester.week2Start, new Date(`${w.week}T12:00:00`))
    return {
      week: w.week,
      label: sem >= 1 ? `${sem}주차 · ${md(w.week)}` : `${md(w.week)} 주`,
      commits: w.commits,
      ...Object.fromEntries(accounts.map((a, i) => [`a${i}`, w.merged[a] ?? 0])),
    }
  })

  return (
    <Card className="@container/card h-full">
      <CardHeader>
        <CardTitle>주별 활동</CardTitle>
        <CardDescription>{metric === "merged" ? "main에 머지된 PR · 작성 계정별" : "main에 들어간 커밋(머지 커밋 제외)"}</CardDescription>
        <CardAction className="flex flex-wrap justify-end gap-2">
          <ToggleGroup variant="outline" size="sm" value={[metric]} onValueChange={(v: string[]) => v[0] && setMetric(v[0] as "merged" | "commits")}>
            <ToggleGroupItem value="merged">머지 PR</ToggleGroupItem>
            <ToggleGroupItem value="commits">커밋</ToggleGroupItem>
          </ToggleGroup>
          <ToggleGroup variant="outline" size="sm" value={[range]} onValueChange={(v: string[]) => v[0] && setRange(v[0] as "all" | "8w")}>
            <ToggleGroupItem value="all">전체</ToggleGroupItem>
            <ToggleGroupItem value="8w">8주</ToggleGroupItem>
          </ToggleGroup>
        </CardAction>
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        <ChartContainer config={config} className="aspect-auto h-64 w-full">
          <AreaChart data={rows} margin={{ left: 0, right: 12, top: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="week" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tickFormatter={md} />
            <YAxis width={28} allowDecimals={false} tickLine={false} axisLine={false} />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent indicator="dot" labelFormatter={(_, payload) => (payload?.[0]?.payload as { label?: string })?.label ?? ""} />}
            />
            {Object.keys(config).map((k) => (
              <Area key={k} dataKey={k} type="monotone" stackId="a" stroke={`var(--color-${k})`} fill={`var(--color-${k})`} fillOpacity={0.45} {...STILL} />
            ))}
            {metric === "merged" && <ChartLegend content={<ChartLegendContent />} />}
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
