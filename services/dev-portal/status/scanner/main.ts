// 개발 현황 스캔 — 사실 수집(매번) · 바뀐 도메인 판정(최대 시간당 1회) · 팀원별 할 일.
//
//   node scanner/main.ts --out <폴더> [--repo <클론>] [--full] [--facts-only] [--groups D1,D7] [--no-fetch]
//
// 서버에서는 infra/server/expresso-status-scan.sh 가 클론을 origin/main 으로 맞춘 뒤 부른다.
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { parseArgs } from "node:util"

import {
  History,
  Report,
  ScanRuns,
  type Feature,
  type HistoryPoint,
  type Judgment,
  type Member,
  type ScanRun,
} from "../shared/report.ts"
import { changedFiles, mainHead, mainRuns, openPulls, weeklyActivity } from "./facts.ts"
import { judgeGroup } from "./judge.ts"
import { readSpec } from "./spec.ts"
import { candidatesFor, rankTodos } from "./todos.ts"

type Config = {
  repo: string
  semester: { week2Start: string; weeks: number }
  members: Array<{ name: string; logins: string[] }>
  plan: Array<{ name: string; from: number; to: number; owners: string[] }>
  paths: Record<string, string[]>
  judge: { model: string; maxBudgetUsdPerGroup: number; timeoutMinutes: number; minIntervalMinutes: number; fullEveryDays: number }
  todos: { model: string; perMember: number; staleDays: number; maxBudgetUsdPerMember: number }
}

const { values: args } = parseArgs({
  options: {
    out: { type: "string" },
    repo: { type: "string" },
    full: { type: "boolean", default: false },
    "facts-only": { type: "boolean", default: false },
    groups: { type: "string" },
    "no-fetch": { type: "boolean", default: false },
  },
})
if (!args.out) throw new Error("--out <폴더> 가 필요합니다")

const here = import.meta.dirname
const clone = resolve(args.repo ?? join(here, "../../../.."))
const out = resolve(args.out)
const cli = process.env.CLAUDE_CLI_PATH || "claude"
const config = JSON.parse(readFileSync(join(here, "config.json"), "utf8")) as Config
const now = new Date()
const iso = (d: Date) => d.toISOString()

mkdirSync(out, { recursive: true })
const read = <T>(name: string, parse: (v: unknown) => T, fallback: T): T => {
  const file = join(out, name)
  if (!existsSync(file)) return fallback
  try {
    return parse(JSON.parse(readFileSync(file, "utf8")))
  } catch (e) {
    console.warn(`${name} 를 읽지 못해 새로 시작합니다: ${(e as Error).message}`)
    return fallback
  }
}
// 임시 파일에 쓰고 이름을 바꾼다 — 화면이 반쯤 쓴 파일을 읽지 않게.
const write = (name: string, value: unknown) => {
  const tmp = join(out, `.${name}.tmp`)
  writeFileSync(tmp, JSON.stringify(value, null, 1) + "\n")
  renameSync(tmp, join(out, name))
}

// 겹쳐 돌지 않게 잠근다. 잠금을 쥔 프로세스가 죽었으면 넘겨받는다.
const lock = join(out, ".scan.lock")
if (existsSync(lock)) {
  const pid = Number(readFileSync(lock, "utf8"))
  let alive = true
  try {
    process.kill(pid, 0)
  } catch {
    alive = false
  }
  if (alive) {
    console.log(`이미 실행 중입니다 (pid ${pid})`)
    process.exit(0)
  }
}
writeFileSync(lock, String(process.pid))

const semesterWeek = () => {
  const start = new Date(`${config.semester.week2Start}T00:00:00Z`).getTime()
  return 2 + Math.floor((now.getTime() - start) / (7 * 86_400_000))
}

const hashFeatures = (features: Feature[]) => createHash("sha1").update(JSON.stringify(features)).digest("hex").slice(0, 12)

async function main(): Promise<ScanRun> {
  const startedAt = iso(now)
  const previous = read("report.json", (v) => Report.parse(v), null)
  const history = read("history.json", (v) => History.parse(v), [] as HistoryPoint[])

  if (!args["no-fetch"]) execFileSync("git", ["fetch", "--quiet", "origin", "main"], { cwd: clone })
  const head = mainHead(clone)
  const headSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: clone, encoding: "utf8" }).trim()
  const { features, groups } = readSpec(clone)
  const pulls = openPulls(config.repo)
  const runs = mainRuns(config.repo)
  const activity = weeklyActivity(config.repo, clone, now)

  // 다시 판정할 도메인 고르기
  const specHash = Object.fromEntries(groups.map((g) => [g.id, hashFeatures(features.filter((f) => f.group === g.id))]))
  let targets: string[] = []
  let reason: string
  const minutesSince = (at: string | null | undefined) => (at ? (now.getTime() - new Date(at).getTime()) / 60_000 : Infinity)
  if (args["facts-only"]) {
    reason = "사실만 수집(--facts-only)"
  } else if (args.groups) {
    targets = args.groups.split(",").filter((id) => specHash[id])
    reason = `지정한 도메인(--groups ${args.groups})`
  } else if (args.full || !previous?.scan.judgedCommit || minutesSince(previous.scan.fullAt) > config.judge.fullEveryDays * 1440) {
    targets = groups.map((g) => g.id)
    reason = args.full ? "전체 판정(--full)" : previous?.scan.judgedCommit ? `마지막 전체 판정 후 ${config.judge.fullEveryDays}일 지남` : "첫 판정"
  } else if (minutesSince(previous.scan.judgedAt) < config.judge.minIntervalMinutes) {
    reason = `직전 판정 후 ${config.judge.minIntervalMinutes}분이 지나지 않음`
  } else {
    const specChanged = groups.filter((g) => previous.scan.specHash[g.id] !== specHash[g.id]).map((g) => g.id)
    const files = previous.scan.judgedCommit === headSha ? [] : changedFiles(clone, previous.scan.judgedCommit, headSha)
    const codeChanged =
      files === null
        ? groups.map((g) => g.id)
        : groups.filter((g) => (config.paths[g.id] ?? []).some((p) => files.some((f) => f.startsWith(p)))).map((g) => g.id)
    targets = [...new Set([...specChanged, ...codeChanged])]
    reason = targets.length
      ? `바뀐 곳 — 코드 ${codeChanged.join(" ") || "없음"} · 설계서 ${specChanged.join(" ") || "없음"}`
      : previous.scan.judgedCommit === headSha
        ? "판정한 커밋 그대로"
        : "바뀐 파일이 어느 도메인 경로에도 걸리지 않음"
  }

  // 판정
  const prevJudgments = new Map((previous?.judgments ?? []).map((j) => [j.id, j]))
  const judgments = new Map<string, Judgment>()
  for (const f of features) {
    const j = prevJudgments.get(f.id)
    if (j && !targets.includes(f.group)) judgments.set(f.id, j)
  }
  let costUsd = 0
  let evidenceKept = 0
  let evidenceDropped = 0
  const errors: string[] = []
  const judged: string[] = []
  const groupScans = new Map((previous?.groups ?? []).map((g) => [g.id, { scannedAt: g.scannedAt, commit: g.commit }]))
  for (const id of targets) {
    const group = groups.find((g) => g.id === id)!
    const mine = features.filter((f) => f.group === id)
    console.log(`판정 ${id} ${group.name} · 기능 ${mine.length}개`)
    try {
      const verdict = await judgeGroup({
        cli,
        clone,
        model: config.judge.model,
        budgetUsd: config.judge.maxBudgetUsdPerGroup,
        timeoutMs: config.judge.timeoutMinutes * 60_000,
        group,
        features: mine,
        paths: config.paths[id] ?? [],
      })
      costUsd += verdict.costUsd
      evidenceKept += verdict.evidenceKept
      evidenceDropped += verdict.evidenceDropped
      for (const v of verdict.judgments) {
        judgments.set(v.id, {
          ...v,
          scannedAt: iso(new Date()),
          commit: head.commit,
          previous: prevJudgments.get(v.id)?.state ?? null,
        })
      }
      groupScans.set(id, { scannedAt: iso(new Date()), commit: head.commit })
      judged.push(id)
    } catch (e) {
      // 한 도메인이 실패해도 나머지는 계속한다. 그 도메인은 직전 판정을 그대로 둔다.
      errors.push(`${id}: ${(e as Error).message}`)
      for (const f of mine) {
        const j = prevJudgments.get(f.id)
        if (j) judgments.set(f.id, j)
      }
    }
  }

  // 팀원별 할 일 — 판정이나 PR 상태가 바뀌었을 때, 또는 하루가 지났을 때 다시 고른다.
  const week = semesterWeek()
  const members: Member[] = []
  for (const m of config.members) {
    const candidates = candidatesFor({
      member: m.name,
      logins: m.logins,
      features,
      judgments,
      pulls,
      plan: config.plan,
      week,
      staleDays: config.todos.staleDays,
      now,
      repo: config.repo,
    })
    const before = previous?.members.find((p) => p.name === m.name)
    const stillValid = before && before.todos.every((t) => candidates.some((c) => c.id === t.id))
    const fresh = minutesSince(before?.todosAt) < 1440 && judged.length === 0 && stillValid
    let todos = before?.todos ?? []
    let todosAt = before?.todosAt ?? null
    if (!fresh && !args["facts-only"]) {
      try {
        const ranked = await rankTodos({
          cli,
          cwd: clone,
          model: config.todos.model,
          member: m.name,
          week,
          candidates,
          limit: config.todos.perMember,
          budgetUsd: config.todos.maxBudgetUsdPerMember,
        })
        costUsd += ranked.costUsd
        todos = ranked.todos
        todosAt = iso(new Date())
      } catch (e) {
        errors.push(`할 일 ${m.name}: ${(e as Error).message}`)
      }
    }
    members.push({
      name: m.name,
      logins: m.logins,
      groups: groups.filter((g) => features.some((f) => f.group === g.id && f.owner === m.name)).map((g) => g.id),
      todos,
      todosAt,
    })
  }

  const report = Report.parse({
    schemaVersion: 1,
    generatedAt: iso(new Date()),
    repo: config.repo,
    main: head,
    scan: {
      judgedCommit: judged.length ? headSha : (previous?.scan.judgedCommit ?? null),
      judgedAt: judged.length ? iso(new Date()) : (previous?.scan.judgedAt ?? null),
      fullAt: judged.length === groups.length ? iso(new Date()) : (previous?.scan.fullAt ?? null),
      specHash: judged.length ? { ...(previous?.scan.specHash ?? {}), ...Object.fromEntries(judged.map((id) => [id, specHash[id]])) } : (previous?.scan.specHash ?? {}),
    },
    semester: config.semester,
    plan: config.plan,
    groups: groups.map((g) => ({ ...g, scannedAt: groupScans.get(g.id)?.scannedAt ?? null, commit: groupScans.get(g.id)?.commit ?? null })),
    features,
    judgments: features.map((f) => judgments.get(f.id)).filter((j): j is Judgment => Boolean(j)),
    members,
    pulls,
    runs,
    activity,
  })
  write("report.json", report)

  if (judged.length) {
    const counts: HistoryPoint["groups"] = {}
    for (const g of groups) {
      const c = { done: 0, partial: 0, api: 0, todo: 0 }
      for (const j of report.judgments) if (features.find((f) => f.id === j.id)?.group === g.id) c[j.state] += 1
      counts[g.id] = c
    }
    write("history.json", [...history, { at: report.generatedAt, commit: head.commit, groups: counts }])
  }

  return {
    startedAt,
    finishedAt: iso(new Date()),
    ok: errors.length === 0,
    commit: head.commit,
    judged,
    reason,
    evidenceKept,
    evidenceDropped,
    costUsd: Math.round(costUsd * 10_000) / 10_000,
    error: errors.length ? errors.join("\n") : null,
  }
}

let result: ScanRun
try {
  result = await main()
} catch (e) {
  result = {
    startedAt: iso(now),
    finishedAt: iso(new Date()),
    ok: false,
    commit: null,
    judged: [],
    reason: "실행 실패",
    evidenceKept: 0,
    evidenceDropped: 0,
    costUsd: 0,
    error: (e as Error).stack ?? String(e),
  }
} finally {
  rmSync(lock, { force: true })
}
const past = read("runs.json", (v) => ScanRuns.parse(v), [] as ScanRun[])
write("runs.json", [...past, result].slice(-50))
console.log(JSON.stringify(result, null, 1))
process.exit(result.ok ? 0 : 1)
