import { useEffect, useMemo, useState, type CSSProperties } from "react"
import { CircleAlertIcon, XIcon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { AppSidebar } from "@/components/status/app-sidebar"
import { ActivityChart, DomainProgress, TrendChart } from "@/components/status/charts"
import { ListTabs } from "@/components/status/data-table"
import { SectionCards } from "@/components/status/section-cards"
import { TeamTodos } from "@/components/status/todos"
import { useView, type View } from "@/lib/route"
import { ago, loadData, rows as toRows, semesterWeek, type Data } from "@/lib/data"
import { usePortalTheme } from "@/lib/theme"

type Load = { data: Data } | { error: string } | null

export function App() {
  usePortalTheme()
  const [load, setLoad] = useState<Load>(null)
  const [view, setView] = useView()

  const fetchData = () =>
    loadData().then(
      (data) => setLoad({ data }),
      (e: unknown) => setLoad({ error: e instanceof Error ? e.message : String(e) })
    )
  const retry = () => {
    setLoad(null)
    void fetchData()
  }
  useEffect(() => {
    void fetchData()
    // 스캐너는 15분마다 돈다. 열어 둔 화면도 5분마다 새 결과를 받는다.
    const timer = window.setInterval(() => void fetchData(), 5 * 60_000)
    return () => window.clearInterval(timer)
  }, [])

  if (load && "data" in load) {
    return (
      <TooltipProvider>
        <Dashboard data={load.data} view={view} setView={setView} />
      </TooltipProvider>
    )
  }
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-4 p-6">
      {load === null ? (
        <>
          <Skeleton className="h-12 w-full" />
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
          <Skeleton className="h-72 w-full" />
        </>
      ) : (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>스캔 결과를 읽지 못했습니다</AlertTitle>
          <AlertDescription>
            <p>{load.error}</p>
            <p>서버의 스캔 타이머(expresso-status-scan.timer)가 한 번도 돌지 않았으면 결과 파일이 없습니다.</p>
            <Button variant="outline" size="sm" onClick={retry}>
              다시 불러오기
            </Button>
          </AlertDescription>
        </Alert>
      )}
    </main>
  )
}

function Dashboard({ data, view, setView }: { data: Data; view: View; setView: (patch: Partial<View>) => void }) {
  const { report, runs } = data
  const member = report.members.find((m) => m.name === view.member) ?? null
  const all = useMemo(() => toRows(report), [report])
  const rows = member ? all.filter((r) => r.owner === member.name) : all
  const groups = member ? member.groups : report.groups.map((g) => g.id)
  const week = semesterWeek(report.semester.week2Start)
  const lastRun = runs.at(-1)
  const pickMember = (name: string | null) => setView({ member: name, group: null })
  const toList = (patch: Partial<View>) => {
    setView({ tab: "features", state: null, changed: false, q: "", ...patch })
    document.getElementById("list")?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  return (
    <SidebarProvider style={{ "--sidebar-width": "15rem" } as CSSProperties}>
      <AppSidebar data={data} member={member?.name ?? null} onMember={pickMember} />
      <SidebarInset>
        <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur lg:px-6">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-4" />
          <h1 className="text-base font-medium">진행 현황</h1>
          {member && (
            <Badge variant="secondary">
              {member.name}
              <button type="button" aria-label="팀원 필터 해제" onClick={() => pickMember(null)}>
                <XIcon />
              </button>
            </Badge>
          )}
          <div className="ml-auto flex items-center gap-2">
            {lastRun && !lastRun.ok && (
              <Tooltip>
                <TooltipTrigger render={<Badge variant="destructive" />}>마지막 스캔 실패</TooltipTrigger>
                <TooltipContent className="max-w-sm whitespace-pre-wrap">{lastRun.error}</TooltipContent>
              </Tooltip>
            )}
            <Badge variant="outline" className="hidden sm:inline-flex">
              스캔 {ago(report.generatedAt)}
            </Badge>
            <Badge variant="default">
              {week}주차 / {report.semester.weeks}주
            </Badge>
          </div>
        </header>

        <div className="@container/main flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6">
          <SectionCards data={data} rows={rows} groups={member ? groups : null} logins={member ? member.logins : null} />

          <section id="todos" className="scroll-mt-16">
            <TeamTodos data={data} member={member?.name ?? null} onMember={pickMember} />
          </section>

          <section id="progress" className="grid scroll-mt-16 grid-cols-1 gap-4 @5xl/main:grid-cols-2">
            <DomainProgress data={data} rows={rows} groups={groups} onPick={(group) => toList({ group })} />
            <TrendChart data={data} groups={groups} />
          </section>

          <section id="activity" className="scroll-mt-16">
            <ActivityChart data={data} />
          </section>

          <section id="list" className="scroll-mt-16">
            <ListTabs data={data} rows={rows} view={{ ...view, member: member?.name ?? null }} setView={setView} />
          </section>

          <footer className="pb-2 text-xs text-muted-foreground">
            판정은 서버의 Claude Code가 main 코드를 읽어 매긴 것입니다(설계서 2.5 · 2.3 · 2.6 기준). 마지막 판정 {ago(report.scan.judgedAt)} ·
            전체 판정 {ago(report.scan.fullAt)} · main {report.main.commit}
          </footer>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

export default App
