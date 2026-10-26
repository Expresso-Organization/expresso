import { CalendarClockIcon, GitPullRequestIcon, PuzzleIcon, type LucideIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { ago, type Data } from "@/lib/data"
import type { Todo } from "../../../shared/report.ts"

const KIND: Record<Todo["kind"], { icon: LucideIcon; label: string }> = {
  pr: { icon: GitPullRequestIcon, label: "PR" },
  plan: { icon: CalendarClockIcon, label: "일정" },
  feature: { icon: PuzzleIcon, label: "기능" },
}

function TodoList({ todos, limit }: { todos: Todo[]; limit?: number }) {
  return (
    <ol className="flex flex-col divide-y">
      {todos.slice(0, limit).map((t, i) => {
        const Icon = KIND[t.kind].icon
        const body = (
          <>
            <span className="mt-0.5 w-4 shrink-0 text-right font-mono text-xs text-muted-foreground tabular-nums">{i + 1}</span>
            <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-sm font-medium">{t.title}</span>
              <span className="text-xs text-muted-foreground">{t.reason}</span>
            </span>
            {t.ref && (
              <Badge variant="outline" className="shrink-0 font-mono">
                {t.ref}
              </Badge>
            )}
          </>
        )
        return (
          <li key={t.id}>
            {t.href ? (
              <a href={t.href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="flex items-start gap-2.5 py-2.5 hover:bg-muted/50">
                {body}
              </a>
            ) : (
              <div className="flex items-start gap-2.5 py-2.5">{body}</div>
            )}
          </li>
        )
      })}
    </ol>
  )
}

export function TeamTodos({ data, member, onMember }: { data: Data; member: string | null; onMember: (m: string) => void }) {
  const members = data.report.members
  const selected = members.find((m) => m.name === member)

  if (selected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{selected.name}의 할 일</CardTitle>
          <CardDescription>
            담당 {selected.groups.join(" · ") || "없음"} · 순위 {ago(selected.todosAt)} · 항목을 누르면 근거로 갑니다
          </CardDescription>
          <CardAction>
            <Badge variant="secondary">{selected.todos.length}</Badge>
          </CardAction>
        </CardHeader>
        <CardContent>
          {selected.todos.length ? (
            <TodoList todos={selected.todos} />
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>고를 할 일이 없습니다</EmptyTitle>
                <EmptyDescription>담당 기능이 모두 완료이고 손봐야 할 PR · 이번 주 일정이 없습니다.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 @3xl/main:grid-cols-2 @6xl/main:grid-cols-3">
      {members.map((m) => (
        <Card key={m.name} size="sm" className="cursor-pointer transition-colors hover:border-ring" onClick={() => onMember(m.name)}>
          <CardHeader>
            <CardTitle>{m.name}</CardTitle>
            <CardDescription>{m.groups.join(" · ") || "담당 도메인 없음"}</CardDescription>
            <CardAction>
              <Badge variant="secondary" className="tabular-nums">
                {m.todos.length}
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent>
            {m.todos.length ? <TodoList todos={m.todos} limit={3} /> : <span className="text-sm text-muted-foreground">할 일 없음</span>}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
