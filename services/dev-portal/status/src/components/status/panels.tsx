import { Bar, BarChart, CartesianGrid, Cell, LabelList, XAxis, YAxis } from "recharts"
import { GitPullRequestIcon, TriangleAlertIcon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PhaseBadge, StateBadge } from "@/components/status/state-badge"
import type { Status } from "@/lib/status"

const REPO = "https://github.com/Expresso-Organization/expresso/pull/"

function PilotChart({
  rows,
  dataKey,
  label,
  domain,
  digits,
}: {
  rows: Status["ai"]["pilot"]
  dataKey: "ndcg" | "mae"
  label: string
  domain: [number, number]
  digits: number
}) {
  const config: ChartConfig = { [dataKey]: { label } }
  return (
    <ChartContainer config={config} className="aspect-auto h-44 w-full">
      <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 48 }} barSize={18}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" domain={domain} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="model" width={120} tickLine={false} axisLine={false} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent hideIndicator />} />
        {/* 탭을 옮겨 막 그려진 차트에서 막대 등장 애니메이션이 시작되지 않는 경우가 있어 끕니다. */}
        <Bar dataKey={dataKey} radius={4} isAnimationActive={false}>
          {rows.map((r) => (
            <Cell key={r.model} fill={r.baseline ? "var(--color-chart-3)" : "var(--color-chart-1)"} />
          ))}
          <LabelList
            dataKey={dataKey}
            position="right"
            className="fill-foreground"
            fontSize={12}
            formatter={(v) => (typeof v === "number" ? v.toFixed(digits) : String(v ?? ""))}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}

export function AiPanel({ status }: { status: Status }) {
  const ai = status.ai
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
      <Card className="xl:col-span-3">
        <CardHeader>
          <CardTitle>AI학습서버 모듈</CardTitle>
          <CardDescription>
            설계서 2.3 · 담당 {ai.owner} · {ai.summary}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader className="bg-muted">
                <TableRow>
                  <TableHead>모듈</TableHead>
                  <TableHead className="w-20">번호</TableHead>
                  <TableHead className="w-24">상태</TableHead>
                  <TableHead>근거</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ai.modules.map((m) => (
                  <TableRow key={m.name}>
                    <TableCell className="font-medium">{m.name}</TableCell>
                    <TableCell className="font-mono text-xs">{m.numbers}</TableCell>
                    <TableCell>
                      <PhaseBadge state={m.state} />
                    </TableCell>
                    <TableCell className="whitespace-normal text-muted-foreground">{m.note ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            파일럿은 <code className="font-mono">{ai.branch}</code> 브랜치에만 있고 main에는 없습니다.
          </p>
        </CardContent>
      </Card>
      <div className="flex flex-col gap-4 xl:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>파일럿 평가 결과</CardTitle>
            <CardDescription>{ai.pilotNote}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <span className="text-xs font-medium text-muted-foreground">NDCG@10 · 높을수록 좋음</span>
            <PilotChart rows={ai.pilot} dataKey="ndcg" label="NDCG@10" domain={[0, 1]} digits={4} />
            <span className="text-xs font-medium text-muted-foreground">MAE · 낮을수록 좋음</span>
            <PilotChart rows={ai.pilot} dataKey="mae" label="MAE" domain={[0, 16]} digits={2} />
          </CardContent>
        </Card>
        <Alert>
          <TriangleAlertIcon />
          <AlertTitle>측정하지 않은 지표</AlertTitle>
          <AlertDescription>
            <ul className="flex list-disc flex-col gap-1 pl-4">
              {ai.unmeasured.map((u) => (
                <li key={u}>{u}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      </div>
    </div>
  )
}

export function AdminCard({ status, owner }: { status: Status; owner: string | null }) {
  const rows = status.admin.filter((a) => !owner || a.owner === owner)
  return (
    <Card>
      <CardHeader>
        <CardTitle>관리자 기능</CardTitle>
        <CardDescription>
          설계서 2.6. 관리자 화면과 역할 기반 권한이 없어, 「API만」은 경로는 있으나 관리자가 쓸 화면과 권한 검사가 없다는 뜻입니다.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{owner} 담당 관리자 기능이 없습니다</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader className="bg-muted">
                <TableRow>
                  <TableHead className="w-12">번호</TableHead>
                  <TableHead className="hidden md:table-cell">주요기능</TableHead>
                  <TableHead>상세기능</TableHead>
                  <TableHead className="w-24">판정</TableHead>
                  <TableHead className="hidden lg:table-cell">참고</TableHead>
                  <TableHead className="w-20">담당</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((a) => (
                  <TableRow key={a.no}>
                    <TableCell className="font-mono text-xs">{a.no}</TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">{a.group}</TableCell>
                    <TableCell className="font-medium whitespace-normal">{a.name}</TableCell>
                    <TableCell>
                      <StateBadge state={a.state} />
                    </TableCell>
                    <TableCell className="hidden whitespace-normal text-muted-foreground lg:table-cell">
                      {a.note ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{a.owner}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function PrCard({ status }: { status: Status }) {
  const groups = [...new Set(status.prs.map((p) => p.group))]
  return (
    <Card>
      <CardHeader>
        <CardTitle>열린 PR</CardTitle>
        <CardDescription>{status.prNote}</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {groups.map((g) => (
          <div key={g} className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{g}</span>
              <Badge variant="outline" className="tabular-nums">
                {status.prs.filter((p) => p.group === g).length}
              </Badge>
            </div>
            <div className="flex flex-col divide-y rounded-lg border">
              {status.prs
                .filter((p) => p.group === g)
                .map((p) => (
                  <a
                    key={p.number}
                    href={`${REPO}${p.number}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-3 px-3 py-2.5 text-sm hover:bg-muted/60"
                  >
                    <GitPullRequestIcon className="mt-0.5 size-4 shrink-0 text-success" />
                    <span className="min-w-0 flex-1">
                      <span className="font-mono text-xs text-muted-foreground">#{p.number}</span>{" "}
                      <span>{p.title}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {p.author} · {p.updated.slice(5)}
                    </span>
                  </a>
                ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export function NextCard({
  status,
  owner,
  currentWeek,
}: {
  status: Status
  owner: string | null
  currentWeek: number
}) {
  const rows = status.next.filter((n) => !owner || n.owners.includes(owner))
  return (
    <Card>
      <CardHeader>
        <CardTitle>남은 작업</CardTitle>
        <CardDescription>담당은 설계서 1.3 · 2.6, 일정은 제안서 추진 일정을 따랐습니다.</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{owner} 담당으로 적힌 남은 작업이 없습니다</EmptyTitle>
              <EmptyDescription>「각 PR 작성자」 · 「팀」 작업은 담당자를 「전체」로 두면 보입니다.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader className="bg-muted">
                <TableRow>
                  <TableHead className="w-28">일정</TableHead>
                  <TableHead>할 일</TableHead>
                  <TableHead className="hidden lg:table-cell">관련 범위</TableHead>
                  <TableHead className="w-36">담당</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((n) => {
                  const now = currentWeek >= n.from && currentWeek <= n.to
                  const late = currentWeek > n.to
                  return (
                    <TableRow key={n.task}>
                      <TableCell>
                        <div className="flex flex-col items-start gap-1">
                          <span className="font-mono text-xs tabular-nums">
                            {n.from === n.to ? n.from : `${n.from}–${n.to}`}주
                          </span>
                          {now && <Badge variant="warning">이번 주</Badge>}
                          {late && <Badge variant="destructive">기한 지남</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        <span className="font-medium">{n.task}</span>
                        {n.weekNote && <span className="text-muted-foreground"> · {n.weekNote}</span>}
                      </TableCell>
                      <TableCell className="hidden whitespace-normal text-muted-foreground lg:table-cell">
                        {n.scope}
                      </TableCell>
                      <TableCell className="whitespace-normal text-muted-foreground">{n.owner}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
