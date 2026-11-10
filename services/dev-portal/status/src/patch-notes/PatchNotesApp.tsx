import { useEffect, useMemo, useState } from "react"
import { CircleAlertIcon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ago } from "@/lib/data"
import { usePortalTheme } from "@/lib/theme"
import type { PatchNotes } from "../../shared/patch-notes.ts"
import { byDay, dayParts, loadPatchNotes, periodLabel, prUrl, type Day, type PatchNoteEntry } from "./data"

type Load = { notes: PatchNotes; loadedAt: number } | { error: string } | null

export function PatchNotesApp() {
  usePortalTheme()
  const [load, setLoad] = useState<Load>(null)

  const fetchNotes = () =>
    loadPatchNotes().then(
      (notes) => setLoad({ notes, loadedAt: Date.now() }),
      (e: unknown) => setLoad({ error: e instanceof Error ? e.message : String(e) })
    )
  useEffect(() => {
    void fetchNotes()
    // 생성기는 15분마다 돈다. 열어 둔 화면도 5분마다 새 결과를 받는다.
    const timer = window.setInterval(() => void fetchNotes(), 5 * 60_000)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <div className="min-h-svh">
      <header className="sticky top-0 z-20 flex h-12 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur lg:px-6">
        <h1 className="text-base font-medium">패치노트</h1>
        {load && "notes" in load && (
          <div className="ml-auto flex items-center gap-2">
            <Badge variant="outline" className="hidden sm:inline-flex">
              갱신 {ago(load.notes.generatedAt, load.loadedAt)}
            </Badge>
            <Badge variant="default">{periodLabel(load.notes.period)}</Badge>
          </div>
        )}
      </header>
      <main className="mx-auto max-w-4xl px-4 pt-6 pb-24 lg:px-6 lg:pt-10">
        {load === null ? (
          <Loading />
        ) : "error" in load ? (
          <Alert variant="destructive">
            <CircleAlertIcon />
            <AlertTitle>패치노트를 읽지 못했습니다</AlertTitle>
            <AlertDescription>
              <p>{load.error}</p>
              <p>서버의 생성 타이머(expresso-patch-notes.timer)가 한 번도 돌지 않았으면 결과 파일이 없습니다.</p>
              <Button variant="outline" size="sm" onClick={() => (setLoad(null), void fetchNotes())}>
                다시 불러오기
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <Timeline notes={load.notes} />
        )}
      </main>
    </div>
  )
}

function Loading() {
  return (
    <div className="flex flex-col gap-10">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="grid gap-4 md:grid-cols-[7.5rem_1fr]">
          <Skeleton className="h-14 w-24" />
          <div className="flex flex-col gap-3">
            <Skeleton className="h-5 w-2/5" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  )
}

function Timeline({ notes }: { notes: PatchNotes }) {
  const days = useMemo(() => byDay(notes.entries), [notes.entries])
  return (
    <ol className="flex flex-col">
      {days.map((day, i) => (
        <DaySection key={day.date} day={day} first={i === 0} />
      ))}
    </ol>
  )
}

// 날짜는 왼쪽에 세워 두고, 그날의 변경을 읽는 동안 따라 내려온다(넓은 화면).
function DaySection({ day, first }: { day: Day; first: boolean }) {
  const { month, day: d, weekday } = dayParts(day.date)
  return (
    <li className={`grid gap-x-8 gap-y-4 md:grid-cols-[7.5rem_1fr] ${first ? "" : "border-t pt-8 mt-8 md:pt-10 md:mt-10"}`}>
      <div className="md:sticky md:top-20 md:self-start">
        <time dateTime={day.date} className="flex items-baseline gap-2 md:flex-col md:gap-1">
          <span className="font-brand text-5xl leading-none font-light tracking-tight tabular-nums">{d}</span>
          <span className="text-sm text-muted-foreground">
            {month}월 {weekday}요일
          </span>
        </time>
      </div>
      <div className="flex min-w-0 flex-col gap-7">
        {day.user.length > 0 && <ChangeList entries={day.user} />}
        {day.dev.length > 0 && (
          <section className="flex flex-col gap-4 border-l-2 border-border pl-4">
            <h2 className="text-sm font-medium text-muted-foreground">개발 · 운영</h2>
            <ChangeList entries={day.dev} quiet />
          </section>
        )}
      </div>
    </li>
  )
}

function ChangeList({ entries, quiet = false }: { entries: PatchNoteEntry[]; quiet?: boolean }) {
  return (
    <ul className={`flex flex-col ${quiet ? "gap-4" : "gap-6"}`}>
      {entries.map((entry) => (
        <li key={entry.id} className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <h3 className={quiet ? "text-[0.9375rem] font-medium text-foreground/80" : "text-base font-semibold"}>{entry.title}</h3>
            <span className="flex gap-1.5 text-xs text-muted-foreground tabular-nums">
              {entry.prs.map((n) => (
                <a
                  key={n}
                  href={prUrl(n)}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-sm underline-offset-2 hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  #{n}
                </a>
              ))}
            </span>
          </div>
          <ul className={`flex list-disc flex-col gap-1 pl-5 marker:text-muted-foreground/60 ${quiet ? "text-sm text-muted-foreground" : "text-[0.9375rem] leading-relaxed text-foreground/85"}`}>
            {entry.details.map((detail, i) => (
              <li key={i} className="max-w-[68ch] break-keep">
                {detail}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  )
}
