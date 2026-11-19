// 패치노트 생성 — 기간 안에 머지된 PR 중 패치노트에 없는 것을 Claude Code 로 한 항목씩 쓴다.
//
//   node patch-notes/main.ts --out <폴더> [--dry-run] [--limit N]
//
// 서버에서는 infra/server/expresso-patch-notes.sh 가 클론을 origin/main 으로 맞춘 뒤 부른다.
// 결과는 <폴더>/patch-notes.json 하나다. 정리본(seed.json)은 매번 다시 읽어 맨 위에 덮는다.
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { parseArgs } from "node:util"

import { z } from "zod"

import { PatchNoteEntry, PatchNotes } from "../shared/patch-notes.ts"
import { buildNotes, coveredPrs, entryFor, generatedOf, selectTodo, type Pending, type Pull } from "./notes.ts"
import { claudeAsk, writeDraft } from "./writer.ts"

type Config = {
  repo: string
  period: { from: string; to: string }
  model: string
  maxBudgetUsdPerPr: number
  timeoutMinutes: number
  maxPerRun: number
  maxFixRounds: number
}

const { values: args } = parseArgs({
  options: {
    out: { type: "string" },
    "dry-run": { type: "boolean", default: false },
    limit: { type: "string" },
  },
})
if (!args.out) throw new Error("--out <폴더> 가 필요합니다")

const here = import.meta.dirname
const out = resolve(args.out)
const config = JSON.parse(readFileSync(join(here, "config.json"), "utf8")) as Config
const limit = args.limit ? Number(args.limit) : config.maxPerRun
const FILE = "patch-notes.json"

const seed = z
  .object({ entries: z.array(PatchNoteEntry) })
  .parse(JSON.parse(readFileSync(join(here, "seed.json"), "utf8"))).entries

mkdirSync(out, { recursive: true })

function readPrevious(): PatchNotes | null {
  const file = join(out, FILE)
  if (!existsSync(file)) return null
  const parsed = PatchNotes.safeParse(JSON.parse(readFileSync(file, "utf8")))
  if (!parsed.success) {
    console.warn(`${FILE} 형식이 맞지 않아 정리본부터 다시 시작합니다: ${z.prettifyError(parsed.error)}`)
    return null
  }
  return parsed.data
}

// 임시 파일에 쓰고 이름을 바꾼다 — 화면이 반쯤 쓴 파일을 읽지 않게.
function write(notes: PatchNotes) {
  const tmp = join(out, `.${FILE}.tmp`)
  writeFileSync(tmp, JSON.stringify(notes, null, 1) + "\n")
  renameSync(tmp, join(out, FILE))
}

// gh 의 merged: 검색은 UTC 날짜라, 하루 앞에서부터 받아 KST 로 다시 거른다.
function mergedPulls(): Pull[] {
  const since = new Date(Date.parse(`${config.period.from}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
  const raw = execFileSync(
    "gh",
    ["pr", "list", "--repo", config.repo, "--state", "merged", "--base", "main", "--search", `merged:>=${since}`, "--limit", "500",
      "--json", "number,title,body,mergedAt,url,files"],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  )
  const list = JSON.parse(raw) as Array<Omit<Pull, "files"> & { files: Array<{ path: string }> | null }>
  return list.map((p) => ({ ...p, body: p.body ?? "", files: (p.files ?? []).map((f) => f.path) }))
}

// 겹쳐 돌지 않게 잠근다. 잠금을 쥔 프로세스가 죽었으면 넘겨받는다.
const lock = join(out, ".patch-notes.lock")
if (existsSync(lock)) {
  const pid = Number(readFileSync(lock, "utf8"))
  let alive = true
  try {
    process.kill(pid, 0)
  } catch {
    alive = false
  }
  if (alive) {
    console.log(`이미 실행 중입니다(pid ${pid}).`)
    process.exit(0)
  }
}
writeFileSync(lock, String(process.pid))

try {
  const previous = readPrevious()
  const generated = generatedOf(previous, seed)
  const covered = coveredPrs([...seed, ...generated])
  const todo = selectTodo(mergedPulls(), covered, config.period)
  const attempts = new Map((previous?.pending ?? []).map((p) => [p.pr, p.attempts]))

  console.log(`기간 ${config.period.from} ~ ${config.period.to} · 정리본 ${seed.length} · 생성 ${generated.length} · 새로 쓸 PR ${todo.length}`)
  if (args["dry-run"]) {
    for (const p of todo) console.log(`  #${p.number} ${p.mergedAt} ${p.title}`)
    process.exit(0)
  }

  const pending: Pending[] = []
  const ask = claudeAsk({
    cli: process.env.CLAUDE_CLI_PATH || "claude",
    model: config.model,
    budgetUsd: config.maxBudgetUsdPerPr,
    timeoutMs: config.timeoutMinutes * 60_000,
    cwd: out,
  })
  const save = () => write(buildNotes({ now: new Date(), period: config.period, seed, generated, pending }))

  const batch = todo.slice(0, limit)
  for (const pull of batch) {
    try {
      const { draft, costUsd, rounds } = await writeDraft(pull, ask, config.maxFixRounds)
      generated.push(entryFor(pull, draft))
      console.log(`#${pull.number} ${draft.kind} 「${draft.title}」 · 고침 ${rounds}번 · $${costUsd.toFixed(3)}`)
    } catch (e) {
      const reason = (e as Error).message.slice(0, 400)
      pending.push({ pr: pull.number, title: pull.title, reason, attempts: (attempts.get(pull.number) ?? 0) + 1 })
      console.warn(`#${pull.number} 문구를 받지 못했습니다: ${reason}`)
    }
    save()
  }
  // 이번에 손대지 못한 PR 도 다음 실행 대상으로 남는다(selectTodo 가 다시 고른다). 화면에는 쓰지 않는다.
  save()
} finally {
  rmSync(lock, { force: true })
}
