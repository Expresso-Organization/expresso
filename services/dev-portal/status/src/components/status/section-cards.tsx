import { CircleCheckIcon, CircleXIcon, GitPullRequestIcon, LoaderIcon, TrendingDownIcon, TrendingUpIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { ago, countStates, needsAction, pointBefore, totals, type Data, type Row } from "@/lib/data"

const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0)

function Delta({ now, before, unit = "%p" }: { now: number; before: number | null; unit?: string }) {
  if (before === null) return <Badge variant="outline">이력 쌓는 중</Badge>
  const d = now - before
  return (
    <Badge variant={d > 0 ? "success" : d < 0 ? "destructive" : "outline"} className="tabular-nums">
      {d >= 0 ? <TrendingUpIcon /> : <TrendingDownIcon />}
      {d > 0 ? "+" : ""}
      {d}
      {unit}
    </Badge>
  )
}

export function SectionCards({ data, rows, groups, logins }: { data: Data; rows: Row[]; groups: string[] | null; logins: string[] | null }) {
  const { report, history } = data
  const c = countStates(rows)
  const total = rows.length
  // 「7일 전」은 이 스캔 시각에서 잰다 — 화면을 연 시각과 무관하게 같은 값이 나오게.
  const weekAgo = pointBefore(history, new Date(report.generatedAt).getTime() - 7 * 86_400_000)
  const prev = weekAgo ? totals(weekAgo, groups ?? undefined) : null
  const prevTotal = prev ? prev.done + prev.partial + prev.api + prev.todo : 0

  // 팀원을 골랐으면 그 사람 계정의 PR 만 센다.
  const pulls = logins ? report.pulls.filter((p) => logins.includes(p.author)) : report.pulls
  const action = pulls.filter((p) => needsAction(p).length > 0)
  const ci = report.runs.find((r) => /CI/i.test(r.workflow))
  const deploy = report.runs.find((r) => /배포|deploy/i.test(r.workflow))
  const runIcon = (conclusion: string | null | undefined, status?: string) =>
    status && status !== "completed" ? (
      <LoaderIcon className="text-warning" />
    ) : conclusion === "success" ? (
      <CircleCheckIcon className="text-success" />
    ) : (
      <CircleXIcon className="text-destructive" />
    )

  return (
    <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>기능 완료</CardDescription>
          <CardTitle className="font-brand text-3xl font-light tabular-nums @[250px]/card:text-4xl">{pct(c.done, total)}%</CardTitle>
          <CardAction>
            <Delta now={pct(c.done, total)} before={prev ? pct(prev.done, prevTotal) : null} />
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-stretch gap-2 text-sm">
          <Progress value={pct(c.done, total)} aria-label="기능 완료율" />
          <span className="text-muted-foreground tabular-nums">
            {c.done} / {total} · 7일 전 대비{c.unknown ? ` · 판정 전 ${c.unknown}` : ""}
          </span>
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardDescription>동작하는 경로가 있는 기능</CardDescription>
          <CardTitle className="font-brand text-3xl font-light tabular-nums @[250px]/card:text-4xl">
            {pct(c.done + c.partial, total)}%
          </CardTitle>
          <CardAction>
            <Delta now={pct(c.done + c.partial, total)} before={prev ? pct(prev.done + prev.partial, prevTotal) : null} />
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-stretch gap-2 text-sm">
          <Progress value={pct(c.done + c.partial, total)} aria-label="동작하는 경로가 있는 기능 비율" />
          <span className="text-muted-foreground tabular-nums">
            부분 {c.partial} · API만 {c.api} · 미구현 {c.todo}
          </span>
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardDescription>손봐야 할 PR</CardDescription>
          <CardTitle className="font-brand text-3xl font-light tabular-nums @[250px]/card:text-4xl">{action.length}</CardTitle>
          <CardAction>
            <Badge variant="outline" className="tabular-nums">
              <GitPullRequestIcon />
              열림 {pulls.length}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1 text-sm">
          <span className="font-medium">
            CI 실패 {pulls.filter((p) => p.checks === "failure").length} · 충돌{" "}
            {pulls.filter((p) => p.mergeable === "CONFLICTING").length}
          </span>
          <span className="text-muted-foreground">7일 넘게 멈춘 PR 포함</span>
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardDescription>main 상태</CardDescription>
          <CardTitle className="flex items-center gap-2 text-xl font-medium">
            {runIcon(ci?.conclusion, ci?.status)}
            {ci ? (ci.conclusion === "success" ? "CI 통과" : ci.status !== "completed" ? "CI 실행 중" : "CI 실패") : "CI 기록 없음"}
          </CardTitle>
          <CardAction>
            <Badge variant="outline" className="font-mono">
              {report.main.commit}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1 text-sm">
          <span className="flex items-center gap-1.5 font-medium [&_svg]:size-4">
            {deploy ? runIcon(deploy.conclusion, deploy.status) : null}
            운영 배포 {deploy ? ago(deploy.createdAt) : "기록 없음"}
          </span>
          <span className="line-clamp-1 text-muted-foreground">{report.main.subject}</span>
        </CardFooter>
      </Card>
    </div>
  )
}
