import { Fragment, useMemo, useState } from "react"
import { cn } from "cn"
import { ChevronRightIcon, SearchIcon } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { StateBadge } from "@/components/status/state-badge"
import { STATE_LABEL, STATES, countStates, type State, type Status, type Task } from "@/lib/status"
import type { View } from "@/lib/route"

const ALL = "__all"

export function TaskTable({
  status,
  tasks,
  view,
  setView,
}: {
  status: Status
  tasks: Task[]
  view: View
  setView: (patch: Partial<View>) => void
}) {
  const [open, setOpen] = useState<string | null>(null)

  const inDomain = useMemo(
    () => tasks.filter((t) => !view.domain || t.domain === view.domain),
    [tasks, view.domain]
  )
  const counts = countStates(inDomain)
  const rows = useMemo(() => {
    const q = view.q.trim().toLocaleLowerCase()
    return inDomain.filter(
      (t) =>
        (!view.state || t.state === view.state) &&
        (!q || [t.id, t.name, t.missing, t.evidence].some((v) => v?.toLocaleLowerCase().includes(q)))
    )
  }, [inDomain, view.state, view.q])

  const domains = status.domains.filter((d) => !view.owner || d.owner === view.owner)
  const domainItems = [
    { value: ALL, label: "모든 도메인" },
    ...domains.map((d) => ({ value: d.id, label: `${d.id} ${d.name}` })),
  ]
  const domainNote = view.domain ? status.domains.find((d) => d.id === view.domain)?.note : null

  return (
    <Card>
      <CardHeader>
        <CardTitle>상세기능별 판정</CardTitle>
        <CardDescription>설계서 2.5 · 기능 명세서 T번호. 행을 누르면 빠진 것과 근거 파일이 보입니다.</CardDescription>
        <CardAction>
          <Badge variant="outline" className="tabular-nums">
            {rows.length} / {inDomain.length}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            items={domainItems}
            value={view.domain ?? ALL}
            onValueChange={(value) => setView({ domain: value === ALL ? null : (value as string) })}
          >
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {domainItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <ToggleGroup
            variant="outline"
            size="sm"
            className="flex-wrap"
            value={[view.state ?? ALL]}
            onValueChange={(value: string[]) => {
              const next = value[0]
              setView({ state: !next || next === ALL ? null : (next as State) })
            }}
          >
            <ToggleGroupItem value={ALL}>전체 {inDomain.length}</ToggleGroupItem>
            {STATES.map((s) => (
              <ToggleGroupItem key={s} value={s}>
                {STATE_LABEL[s]} {counts[s]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <div className="relative ml-auto w-full sm:w-64">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={view.q}
              onChange={(e) => setView({ q: e.target.value })}
              placeholder="번호 · 기능 · 파일 검색"
              className="pl-8"
              aria-label="상세기능 검색"
            />
          </div>
        </div>

        {domainNote && (
          <Alert>
            <AlertDescription>{domainNote}</AlertDescription>
          </Alert>
        )}

        {rows.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>조건에 맞는 기능이 없습니다</EmptyTitle>
              <EmptyDescription>도메인 · 판정 · 검색어를 바꿔 보십시오.</EmptyDescription>
            </EmptyHeader>
            <Button variant="outline" onClick={() => setView({ domain: null, state: null, q: "" })}>
              조건 지우기
            </Button>
          </Empty>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader className="bg-muted">
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead className="w-24">번호</TableHead>
                  <TableHead>상세기능</TableHead>
                  <TableHead className="hidden md:table-cell">도메인</TableHead>
                  <TableHead className="hidden sm:table-cell">담당</TableHead>
                  <TableHead className="w-24">판정</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((t) => {
                  const expanded = open === t.id
                  return (
                    <Fragment key={t.id}>
                      <TableRow
                        className="cursor-pointer"
                        aria-expanded={expanded}
                        onClick={() => setOpen(expanded ? null : t.id)}
                      >
                        <TableCell>
                          <ChevronRightIcon
                            className={cn("size-4 text-muted-foreground transition-transform", expanded && "rotate-90")}
                          />
                        </TableCell>
                        <TableCell className="font-mono text-xs">{t.id}</TableCell>
                        <TableCell className="font-medium">{t.name}</TableCell>
                        <TableCell className="hidden text-muted-foreground md:table-cell">
                          {t.domain} {t.domainName}
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground sm:table-cell">{t.owner}</TableCell>
                        <TableCell>
                          <StateBadge state={t.state} />
                        </TableCell>
                      </TableRow>
                      {expanded && (
                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                          <TableCell />
                          <TableCell colSpan={5} className="whitespace-normal">
                            <div className="flex flex-col gap-1.5 py-1">
                              <span>{t.missing ?? (t.state === "todo" ? "이 기능의 구현 코드를 찾지 못했습니다." : "빠진 것 없음")}</span>
                              {t.evidence && (
                                <code className="font-mono text-xs text-muted-foreground">{t.evidence}</code>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
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
