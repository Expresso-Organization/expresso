import { useMemo, useState, type ReactNode } from "react"
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table"
import { ArrowUpDownIcon, ChevronLeftIcon, ChevronRightIcon, CircleCheckIcon, CircleXIcon, ExternalLinkIcon, LoaderIcon, SearchIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Toggle } from "@/components/ui/toggle"
import { StateBadge } from "@/components/status/state-badge"
import type { Tab, View } from "@/lib/route"
import {
  STATE_HELP,
  STATE_LABEL,
  STATES,
  ago,
  changed,
  githubBlob,
  needsAction,
  type Data,
  type PullRequest,
  type Row,
  type ScanRun,
  type State,
} from "@/lib/data"

const ALL = "__all"
type RunRow = Data["report"]["runs"][number]

function sortable<T>(label: string): ColumnDef<T>["header"] {
  return ({ column }) => (
    <Button variant="ghost" size="sm" className="-ml-2" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
      {label}
      <ArrowUpDownIcon data-icon="inline-end" />
    </Button>
  )
}

function DataTable<T>({ data, columns, onRow, query, empty }: { data: T[]; columns: ColumnDef<T>[]; onRow?: (row: T) => void; query: string; empty: string }) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 15 })
  const table = useReactTable({
    data,
    columns,
    state: { sorting, pagination, globalFilter: query },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    // 검색어는 행의 모든 글자 값에서 찾는다.
    globalFilterFn: (row, _id, value: string) => JSON.stringify(row.original).toLocaleLowerCase().includes(value.trim().toLocaleLowerCase()),
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    autoResetPageIndex: true,
  })
  const total = table.getFilteredRowModel().rows.length
  const { pageIndex, pageSize } = table.getState().pagination
  if (total === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>{empty}</EmptyTitle>
          <EmptyDescription>팀원 · 필터 · 검색어를 바꿔 보십시오.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader className="bg-muted">
            {table.getHeaderGroups().map((g) => (
              <TableRow key={g.id}>
                {g.headers.map((h) => (
                  <TableHead key={h.id}>{h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}</TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} className={onRow ? "cursor-pointer" : undefined} onClick={onRow ? () => onRow(row.original) : undefined}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between gap-2 px-1 text-sm text-muted-foreground">
        <span className="tabular-nums">
          {total}개 중 {pageIndex * pageSize + 1}–{Math.min(total, (pageIndex + 1) * pageSize)}
        </span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon-sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} aria-label="이전 쪽">
            <ChevronLeftIcon />
          </Button>
          <span className="tabular-nums">
            {pageIndex + 1} / {table.getPageCount()}
          </span>
          <Button variant="outline" size="icon-sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} aria-label="다음 쪽">
            <ChevronRightIcon />
          </Button>
        </div>
      </div>
    </div>
  )
}

const featureColumns: ColumnDef<Row>[] = [
  { accessorKey: "id", header: sortable("번호"), cell: ({ row }) => <span className="font-mono text-xs">{row.original.id}</span> },
  { accessorKey: "name", header: "기능", cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
  { accessorKey: "group", header: sortable("도메인"), cell: ({ row }) => <span className="text-muted-foreground">{row.original.group} {row.original.groupName}</span> },
  { accessorKey: "owner", header: sortable("담당"), cell: ({ row }) => <span className="text-muted-foreground">{row.original.owner}</span> },
  {
    id: "state",
    accessorFn: (r) => (r.judgment ? STATES.indexOf(r.judgment.state) : 9),
    header: sortable("판정"),
    cell: ({ row }) => <StateBadge state={row.original.judgment?.state ?? null} change={changed(row.original.judgment)} />,
  },
]

const checkIcon = (p: PullRequest) =>
  p.checks === "success" ? <CircleCheckIcon className="size-4 text-success" /> : p.checks === "failure" ? <CircleXIcon className="size-4 text-destructive" /> : p.checks === "pending" ? <LoaderIcon className="size-4 text-warning" /> : <span className="text-xs text-muted-foreground">없음</span>

const pullColumns: ColumnDef<PullRequest>[] = [
  {
    accessorKey: "number",
    header: sortable("PR"),
    cell: ({ row }) => (
      <a href={row.original.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-mono text-xs hover:underline">
        #{row.original.number}
        <ExternalLinkIcon className="size-3" />
      </a>
    ),
  },
  { accessorKey: "title", header: "제목", cell: ({ row }) => <span className="font-medium whitespace-normal">{row.original.title}</span> },
  { accessorKey: "author", header: sortable("작성"), cell: ({ row }) => <span className="text-muted-foreground">{row.original.author}</span> },
  { id: "ci", accessorFn: (p) => p.checks, header: sortable("CI"), cell: ({ row }) => checkIcon(row.original) },
  {
    id: "issues",
    accessorFn: (p) => needsAction(p).length,
    header: sortable("손볼 것"),
    cell: ({ row }) => (
      <span className="flex flex-wrap gap-1">
        {needsAction(row.original).map((n) => (
          <Badge key={n} variant="destructive">
            {n}
          </Badge>
        ))}
        {row.original.draft && <Badge variant="outline">초안</Badge>}
      </span>
    ),
  },
  { accessorKey: "updatedAt", header: sortable("갱신"), cell: ({ row }) => <span className="text-muted-foreground tabular-nums">{ago(row.original.updatedAt)}</span> },
  {
    id: "size",
    accessorFn: (p) => p.additions + p.deletions,
    header: sortable("규모"),
    cell: ({ row }) => (
      <span className="font-mono text-xs tabular-nums">
        <span className="text-success">+{row.original.additions}</span> <span className="text-destructive">−{row.original.deletions}</span>
      </span>
    ),
  },
]

const runColumns: ColumnDef<RunRow>[] = [
  { accessorKey: "workflow", header: sortable("워크플로"), cell: ({ row }) => <span className="font-medium">{row.original.workflow}</span> },
  { accessorKey: "event", header: "계기", cell: ({ row }) => <span className="text-muted-foreground">{row.original.event}</span> },
  {
    accessorKey: "conclusion",
    header: sortable("결과"),
    cell: ({ row }) =>
      row.original.status !== "completed" ? (
        <Badge variant="warning">실행 중</Badge>
      ) : row.original.conclusion === "success" ? (
        <Badge variant="success">성공</Badge>
      ) : (
        <Badge variant="destructive">{row.original.conclusion ?? "실패"}</Badge>
      ),
  },
  {
    accessorKey: "createdAt",
    header: sortable("시각"),
    cell: ({ row }) => (
      <a href={row.original.url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground tabular-nums hover:underline">
        {ago(row.original.createdAt)}
      </a>
    ),
  },
]

const scanColumns: ColumnDef<ScanRun>[] = [
  { accessorKey: "startedAt", header: sortable("시작"), cell: ({ row }) => <span className="tabular-nums">{row.original.startedAt.slice(5, 16).replace("T", " ")}</span> },
  { accessorKey: "ok", header: "결과", cell: ({ row }) => (row.original.ok ? <Badge variant="success">성공</Badge> : <Badge variant="destructive">실패</Badge>) },
  { accessorKey: "judged", header: "다시 본 도메인", cell: ({ row }) => <span className="font-mono text-xs">{row.original.judged.join(" ") || "—"}</span> },
  { accessorKey: "reason", header: "이유", cell: ({ row }) => <span className="whitespace-normal text-muted-foreground">{row.original.reason}</span> },
  { accessorKey: "costUsd", header: sortable("비용"), cell: ({ row }) => <span className="font-mono text-xs tabular-nums">${row.original.costUsd.toFixed(2)}</span> },
  {
    id: "evidence",
    header: "근거 경로",
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground tabular-nums">
        남김 {row.original.evidenceKept} · 버림 {row.original.evidenceDropped}
      </span>
    ),
  },
]

type Detail = { title: string; badge: ReactNode; rows: Array<[string, ReactNode]> }

export function ListTabs({ data, rows, view, setView }: { data: Data; rows: Row[]; view: View; setView: (patch: Partial<View>) => void }) {
  const { report } = data
  const [detail, setDetail] = useState<Detail | null>(null)
  const memberLogins = report.members.find((m) => m.name === view.member)?.logins ?? []

  const features = useMemo(
    () =>
      rows.filter(
        (r) =>
          (!view.group || r.group === view.group) &&
          (!view.state || r.judgment?.state === view.state) &&
          (!view.changed || changed(r.judgment) !== null)
      ),
    [rows, view.group, view.state, view.changed]
  )
  const pulls = view.member ? report.pulls.filter((p) => memberLogins.includes(p.author)) : report.pulls
  const scans = [...data.runs].reverse()

  const groupItems = [{ value: ALL, label: "모든 도메인" }, ...report.groups.map((g) => ({ value: g.id, label: `${g.id} ${g.name}` }))]
  const stateItems = [{ value: ALL, label: "모든 판정" }, ...STATES.map((s) => ({ value: s, label: STATE_LABEL[s] }))]

  const showFeature = (r: Row) => {
    const j = r.judgment
    setDetail({
      title: `${r.id} ${r.name}`,
      badge: <StateBadge state={j?.state ?? null} change={changed(j)} />,
      rows: [
        ["도메인 · 담당", `${r.group} ${r.groupName} · ${r.owner}`],
        ["주요기능", r.major],
        ...(r.does ? ([["정의 — 동작", r.does]] as Array<[string, ReactNode]>) : []),
        ...(r.rule ? ([["정의 — 규칙", r.rule]] as Array<[string, ReactNode]>) : []),
        ["판정 뜻", j ? STATE_HELP[j.state] : "아직 판정하지 않았습니다"],
        ["빠진 것", j ? (j.missing ?? "없음") : "—"],
        [
          "근거",
          j?.evidence.length ? (
            <ul className="flex flex-col gap-1">
              {j.evidence.map((e) => (
                <li key={e}>
                  <a href={githubBlob(report.repo, j.commit, e)} target="_blank" rel="noopener noreferrer" className="font-mono text-xs hover:underline">
                    {e}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            "—"
          ),
        ],
        ["판정", j ? `${ago(j.scannedAt)} · ${j.commit}${j.previous && j.previous !== j.state ? ` · 직전 ${STATE_LABEL[j.previous]}` : ""}` : "—"],
      ],
    })
  }

  return (
    <>
      <Tabs value={view.tab} onValueChange={(v) => setView({ tab: v as Tab })} className="gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <TabsList className="max-w-full overflow-x-auto">
            <TabsTrigger value="features">
              기능 <Badge variant="secondary">{features.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="pulls">
              열린 PR <Badge variant="secondary">{pulls.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="runs">
              main 실행 <Badge variant="secondary">{report.runs.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="scans">
              스캔 기록 <Badge variant="secondary">{scans.length}</Badge>
            </TabsTrigger>
          </TabsList>
          <div className="flex flex-wrap items-center gap-2">
            {view.tab === "features" && (
              <>
                <Select items={groupItems} value={view.group ?? ALL} onValueChange={(v) => setView({ group: v === ALL ? null : (v as string) })}>
                  <SelectTrigger size="sm" className="w-44" aria-label="도메인">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {groupItems.map((g) => (
                        <SelectItem key={g.value} value={g.value}>
                          {g.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <Select items={stateItems} value={view.state ?? ALL} onValueChange={(v) => setView({ state: v === ALL ? null : (v as State) })}>
                  <SelectTrigger size="sm" className="w-32" aria-label="판정">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {stateItems.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <Toggle variant="outline" size="sm" pressed={view.changed} onPressedChange={(pressed) => setView({ changed: pressed })}>
                  최근 바뀐 것
                </Toggle>
              </>
            )}
            <div className="relative w-full sm:w-52">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={view.q} onChange={(e) => setView({ q: e.target.value })} placeholder="검색" className="h-7 pl-8" aria-label="목록 검색" />
            </div>
          </div>
        </div>
        <TabsContent value="features">
          <DataTable data={features} columns={featureColumns} onRow={showFeature} query={view.q} empty="조건에 맞는 기능이 없습니다" />
        </TabsContent>
        <TabsContent value="pulls">
          <DataTable data={pulls} columns={pullColumns} query={view.q} empty={view.member && !memberLogins.length ? `${view.member}의 GitHub 계정이 설정에 없습니다` : "열린 PR이 없습니다"} />
        </TabsContent>
        <TabsContent value="runs">
          <DataTable data={report.runs} columns={runColumns} query={view.q} empty="main 실행 기록이 없습니다" />
        </TabsContent>
        <TabsContent value="scans">
          <DataTable data={scans} columns={scanColumns} query={view.q} empty="스캔 기록이 없습니다" />
        </TabsContent>
      </Tabs>

      <Sheet open={detail !== null} onOpenChange={(open) => !open && setDetail(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          {detail && (
            <>
              <SheetHeader>
                <SheetTitle>{detail.title}</SheetTitle>
                <SheetDescription render={<div />}>{detail.badge}</SheetDescription>
              </SheetHeader>
              <dl className="flex flex-col gap-4 px-4 pb-6 text-sm">
                {detail.rows.map(([k, v]) => (
                  <div key={k} className="flex flex-col gap-1">
                    <dt className="text-xs text-muted-foreground">{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}
