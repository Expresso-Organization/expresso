import { useMemo } from "react"
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, XAxis, YAxis } from "recharts"
import { CircleAlertIcon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { PhaseBadge, StateBadge } from "@/components/status/state-badge"
import {
  STATE_LABEL,
  STATES,
  countStates,
  weekRange,
  type State,
  type Status,
  type Task,
} from "@/lib/status"

const STATE_CHART: ChartConfig = {
  done: { label: STATE_LABEL.done, color: "var(--color-chart-1)" },
  partial: { label: STATE_LABEL.partial, color: "var(--color-chart-2)" },
  api: { label: STATE_LABEL.api, color: "var(--color-chart-3)" },
  todo: { label: STATE_LABEL.todo, color: "var(--color-chart-4)" },
}

const percent = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0)

export function SummaryCards({ tasks, status }: { tasks: Task[]; status: Status }) {
  const c = countStates(tasks)
  const total = tasks.length
  const admin = countStates(status.admin)
  const pilotModules = status.ai.modules.filter((m) => m.state === "pilot").length
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card>
        <CardHeader>
          <CardDescription>상세기능 완료</CardDescription>
          <CardTitle className="font-brand text-4xl font-light tabular-nums">
            {c.done}
            <span className="text-lg text-muted-foreground"> / {total}</span>
          </CardTitle>
          <CardAction>
            <Badge variant="success">{percent(c.done, total)}%</Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-2">
          <Progress value={percent(c.done, total)} className="w-full" />
          <span className="text-xs text-muted-foreground">정의서의 동작 · 규칙 · 화면을 모두 갖춤</span>
        </CardFooter>
      </Card>
      <Card>
        <CardHeader>
          <CardDescription>동작하는 경로가 있는 기능</CardDescription>
          <CardTitle className="font-brand text-4xl font-light tabular-nums">
            {c.done + c.partial}
            <span className="text-lg text-muted-foreground"> / {total}</span>
          </CardTitle>
          <CardAction>
            <Badge variant="warning">부분 {c.partial}</Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-2">
          <Progress value={percent(c.done + c.partial, total)} className="w-full" />
          <span className="text-xs text-muted-foreground">완료와 부분을 합친 수</span>
        </CardFooter>
      </Card>
      <Card>
        <CardHeader>
          <CardDescription>화면이 없거나 미구현</CardDescription>
          <CardTitle className="font-brand text-4xl font-light tabular-nums">
            {c.api + c.todo}
            <span className="text-lg text-muted-foreground"> / {total}</span>
          </CardTitle>
          <CardAction>
            <Badge variant="outline">미구현 {c.todo}</Badge>
          </CardAction>
        </CardHeader>
        <CardFooter>
          <span className="text-xs text-muted-foreground">API만 {c.api} · 근거 코드 없음 {c.todo}</span>
        </CardFooter>
      </Card>
      <Card>
        <CardHeader>
          <CardDescription>AI학습서버 모듈 중 파일럿을 마친 것</CardDescription>
          <CardTitle className="font-brand text-4xl font-light tabular-nums">
            {pilotModules}
            <span className="text-lg text-muted-foreground"> / {status.ai.modules.length}</span>
          </CardTitle>
          <CardAction>
            <Badge variant="outline">관리자 완료 {admin.done}</Badge>
          </CardAction>
        </CardHeader>
        <CardFooter>
          <span className="text-xs text-muted-foreground">
            서비스 연결 전 · 관리자 기능 {status.admin.length}개 중 미구현 {admin.todo}
          </span>
        </CardFooter>
      </Card>
    </div>
  )
}

const PHASE_FILL = {
  done: "var(--color-chart-1)",
  wip: "var(--color-chart-2)",
  pilot: "var(--color-chart-2)",
  todo: "var(--color-chart-4)",
} as const

const SCHEDULE_CHART: ChartConfig = { span: { label: "기간" } }

export function ScheduleCard({ status, position }: { status: Status; position: number }) {
  const rows = status.schedule.map((s) => ({ ...s, offset: s.from, span: s.to - s.from + 1 }))
  const last = status.semester.weeks + 1
  const ticks = Array.from({ length: status.semester.weeks - 1 }, (_, i) => i + 2.5)
  const inRange = position >= 2 && position <= last
  return (
    <Card>
      <CardHeader>
        <CardTitle>개발 일정</CardTitle>
        <CardDescription>제안서 추진 일정 · {status.semester.basis}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ChartContainer config={SCHEDULE_CHART} className="aspect-auto h-80 w-full">
          <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16, top: 20 }} barSize={14}>
            <XAxis
              type="number"
              domain={[2, last]}
              ticks={ticks}
              tickFormatter={(v: number) => `${Math.floor(v)}주`}
              allowDataOverflow
              tickLine={false}
              axisLine={false}
              orientation="top"
            />
            <YAxis
              type="category"
              dataKey="name"
              width={220}
              tickLine={false}
              axisLine={false}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  hideIndicator
                  formatter={(_, __, item) => {
                    const row = item.payload as (typeof rows)[number]
                    return (
                      <span>
                        {row.from}–{row.to}주 · {weekRange(status.semester.week2Start, row.from, row.to)}
                        {row.note ? ` · ${row.note}` : ""}
                      </span>
                    )
                  }}
                />
              }
            />
            {/* 앞 막대는 시작 주까지의 빈 자리입니다. 축이 2주부터라 보이지 않습니다. */}
            <Bar dataKey="offset" stackId="w" fill="transparent" isAnimationActive={false} />
            <Bar dataKey="span" stackId="w" radius={7} isAnimationActive={false}>
              {rows.map((r) => (
                <Cell key={r.name} fill={PHASE_FILL[r.state]} />
              ))}
            </Bar>
            {inRange && (
              <ReferenceLine
                x={position}
                stroke="var(--color-signature)"
                strokeWidth={2}
                label={{ value: "오늘", position: "top", fill: "var(--color-signature)", fontSize: 12 }}
              />
            )}
          </BarChart>
        </ChartContainer>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <PhaseBadge state="done" />
          <PhaseBadge state="wip" />
          <PhaseBadge state="todo" />
          <span>막대에 마우스를 올리면 기간과 근거가 보입니다.</span>
        </div>
      </CardContent>
    </Card>
  )
}

export function MilestoneCards({ status }: { status: Status }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-4">
      {status.milestones.map((m) => {
        const c = countStates(m.items)
        return (
          <Card key={m.id} size="sm">
            <CardHeader>
              <CardDescription className="font-mono">{m.id}</CardDescription>
              <CardTitle>{m.name}</CardTitle>
              <CardAction className="flex gap-1">
                {STATES.filter((s) => c[s]).map((s) => (
                  <Badge key={s} variant="outline" className="tabular-nums">
                    {STATE_LABEL[s]} {c[s]}
                  </Badge>
                ))}
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {m.items.map((item, i) => (
                <div key={item.name} className="flex flex-col gap-1.5">
                  {i > 0 && <Separator className="mb-1.5" />}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{item.name}</span>
                    <StateBadge state={item.state} />
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">{item.note}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

export function DomainChart({
  status,
  owner,
  onPick,
}: {
  status: Status
  owner: string | null
  onPick: (domain: string) => void
}) {
  const rows = useMemo(
    () =>
      status.domains
        .filter((d) => !owner || d.owner === owner)
        .map((d) => ({ label: `${d.id} ${d.name}`, id: d.id, owner: d.owner, ...countStates(d.tasks) })),
    [status, owner]
  )
  return (
    <Card>
      <CardHeader>
        <CardTitle>도메인별 판정</CardTitle>
        <CardDescription>막대를 누르면 그 도메인의 상세기능 표로 갑니다.</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={STATE_CHART} className="aspect-auto w-full" style={{ height: rows.length * 34 + 70 }}>
          <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16 }} barSize={18}>
            <CartesianGrid horizontal={false} />
            <XAxis type="number" domain={[0, "dataMax"]} allowDecimals={false} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="label" width={170} tickLine={false} axisLine={false} />
            <ChartTooltip cursor={{ fill: "var(--color-muted)" }} content={<ChartTooltipContent />} />
            {/* 범례는 판정 순서(완료 → 미구현)를 따릅니다. 기본값은 이름순입니다. */}
            <ChartLegend
              content={<ChartLegendContent />}
              itemSorter={(item) => STATES.indexOf(item.dataKey as State)}
            />
            {STATES.map((s: State, i) => (
              <Bar
                key={s}
                dataKey={s}
                stackId="d"
                isAnimationActive={false}
                fill={`var(--color-${s})`}
                radius={i === 0 ? [4, 0, 0, 4] : i === STATES.length - 1 ? [0, 4, 4, 0] : 0}
                className="cursor-pointer"
                onClick={(entry: { payload?: { id?: string } }) => entry.payload?.id && onPick(entry.payload.id)}
              />
            ))}
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

export function FocusList({ status, owner }: { status: Status; owner: string | null }) {
  const items = status.focus.filter((f) => !owner || f.owners.includes(owner))
  if (!items.length) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle>먼저 막아야 할 자리</CardTitle>
        <CardDescription>일정 · 마일스톤에 직접 걸린 공백입니다.</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {items.map((f) => (
          <Alert key={f.title}>
            <CircleAlertIcon />
            <AlertTitle>{f.title}</AlertTitle>
            <AlertDescription>
              <p>{f.body}</p>
              <p className="text-xs">담당 {f.owners.join(" · ")}</p>
            </AlertDescription>
          </Alert>
        ))}
      </CardContent>
    </Card>
  )
}
