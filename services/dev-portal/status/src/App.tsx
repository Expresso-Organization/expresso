import { useEffect, useMemo, useState } from "react"
import { CircleAlertIcon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TooltipProvider } from "@/components/ui/tooltip"
import { DomainChart, FocusList, MilestoneCards, ScheduleCard, SummaryCards } from "@/components/status/overview"
import { AdminCard, AiPanel, NextCard, PrCard } from "@/components/status/panels"
import { TaskTable } from "@/components/status/tasks"
import { useView, type Tab } from "@/lib/route"
import { allTasks, loadStatus, semesterPosition, weekOf, type Status } from "@/lib/status"
import { usePortalTheme } from "@/lib/theme"

const EVERYONE = "__all"

type Load = { status: Status } | { error: string } | null

export function App() {
  usePortalTheme()
  const [load, setLoad] = useState<Load>(null)
  const [view, setView] = useView()

  const fetchStatus = () =>
    loadStatus().then(
      (status) => setLoad({ status }),
      (e: unknown) => setLoad({ error: e instanceof Error ? e.message : String(e) })
    )
  const retry = () => {
    setLoad(null)
    void fetchStatus()
  }
  useEffect(() => {
    void fetchStatus()
  }, [])

  return (
    <TooltipProvider>
      <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8">
        {load === null && <Loading />}
        {load && "error" in load && (
          <Alert variant="destructive">
            <CircleAlertIcon />
            <AlertTitle>진행 현황 데이터를 읽지 못했습니다</AlertTitle>
            <AlertDescription>
              <p>{load.error}</p>
              <Button variant="outline" size="sm" onClick={retry}>
                다시 불러오기
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {load && "status" in load && <Dashboard status={load.status} view={view} setView={setView} />}
      </main>
    </TooltipProvider>
  )
}

function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-16 w-full" />
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-36" />
        ))}
      </div>
      <Skeleton className="h-80 w-full" />
    </div>
  )
}

function Dashboard({
  status,
  view,
  setView,
}: {
  status: Status
  view: ReturnType<typeof useView>[0]
  setView: ReturnType<typeof useView>[1]
}) {
  const position = semesterPosition(status.semester.week2Start)
  const week = weekOf(position)
  const owner = view.owner && status.owners.includes(view.owner) ? view.owner : null
  const tasks = useMemo(() => allTasks(status).filter((t) => !owner || t.owner === owner), [status, owner])
  const ownerItems = [
    { value: EVERYONE, label: "담당 전체" },
    ...status.owners.map((o) => ({ value: o, label: o })),
  ]
  const weekLabel =
    week < 2 ? "학기 시작 전" : week > status.semester.weeks ? "학기 종료" : `${week}주차 / ${status.semester.weeks}주`

  return (
    <>
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-2">
          <span className="font-mono text-xs tracking-widest text-muted-foreground">STATUS</span>
          <h1 className="text-2xl font-semibold tracking-tight">작업 범위와 진행 현황</h1>
          <p className="text-sm text-muted-foreground">
            제안서 · 설계서가 정한 범위를 main 코드와 열린 PR에 대조한 결과입니다.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="default">오늘 {weekLabel}</Badge>
            <Badge variant="outline">판정 기준일 {status.asOf}</Badge>
            <Badge variant="outline" className="font-mono">
              main {status.commit}
            </Badge>
          </div>
        </div>
        <Select
          items={ownerItems}
          value={owner ?? EVERYONE}
          onValueChange={(value) =>
            setView({ owner: value === EVERYONE ? null : (value as string), domain: null })
          }
        >
          <SelectTrigger className="w-44" aria-label="담당자">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {ownerItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </header>

      <SummaryCards tasks={tasks} status={status} />

      <Tabs value={view.tab} onValueChange={(value) => setView({ tab: value as Tab })} className="gap-4">
        <TabsList className="max-w-full overflow-x-auto">
          <TabsTrigger value="overview">개요</TabsTrigger>
          <TabsTrigger value="tasks">상세기능</TabsTrigger>
          <TabsTrigger value="ai">AI 학습</TabsTrigger>
          <TabsTrigger value="ops">관리자 · PR</TabsTrigger>
          <TabsTrigger value="next">남은 작업</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="flex flex-col gap-4">
          <FocusList status={status} owner={owner} />
          <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
            <ScheduleCard status={status} position={position} />
            <DomainChart status={status} owner={owner} onPick={(domain) => setView({ tab: "tasks", domain, state: null, q: "" })} />
          </div>
          <MilestoneCards status={status} />
        </TabsContent>

        <TabsContent value="tasks">
          <TaskTable status={status} tasks={tasks} view={view} setView={setView} />
        </TabsContent>

        <TabsContent value="ai">
          <AiPanel status={status} />
        </TabsContent>

        <TabsContent value="ops" className="flex flex-col gap-4">
          <AdminCard status={status} owner={owner} />
          <PrCard status={status} />
        </TabsContent>

        <TabsContent value="next">
          <NextCard status={status} owner={owner} currentWeek={week} />
        </TabsContent>
      </Tabs>

      <Separator />
      <footer className="flex flex-col gap-2 text-xs text-muted-foreground">
        <p>{status.limits}</p>
        <ul className="flex flex-wrap gap-x-6 gap-y-1">
          {status.sources.map((s) => (
            <li key={s.label}>
              <span className="font-medium text-foreground">{s.label}</span> {s.value}
            </li>
          ))}
        </ul>
        <p>
          갱신은 <code className="font-mono">node scripts/status/refresh-status.mjs</code> · 판정은{" "}
          <code className="font-mono">docs/status/status.json</code>에서 고칩니다.
        </p>
      </footer>
    </>
  )
}

export default App
