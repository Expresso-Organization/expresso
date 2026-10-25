import { execFileSync } from "node:child_process"

import type { PullRequest, WorkflowRun } from "../shared/report.ts"

// AI 를 쓰지 않는 사실 수집. 매 실행마다 돈다. GitHub 은 gh(로그인된 CLI)로 읽는다.

const run = (cmd: string, args: string[], cwd?: string) =>
  execFileSync(cmd, args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim()
const gh = <T>(args: string[]): T => JSON.parse(run("gh", args)) as T

type RollupItem = { conclusion?: string | null; status?: string | null; state?: string | null; name?: string; context?: string }
type GhPull = {
  number: number
  title: string
  author: { login: string }
  url: string
  isDraft: boolean
  createdAt: string
  updatedAt: string
  additions: number
  deletions: number
  changedFiles: number
  mergeable: string
  reviewDecision: string | null
  statusCheckRollup: RollupItem[] | null
}

const FAILED = new Set(["FAILURE", "TIMED_OUT", "CANCELLED", "ACTION_REQUIRED", "ERROR"])

function checks(rollup: RollupItem[]): Pick<PullRequest, "checks" | "failedChecks"> {
  if (!rollup.length) return { checks: "none", failedChecks: [] }
  const failed = rollup.filter((r) => FAILED.has(String(r.conclusion ?? r.state ?? "").toUpperCase()))
  if (failed.length) return { checks: "failure", failedChecks: failed.map((r) => r.name ?? r.context ?? "?") }
  const pending = rollup.some((r) => (r.status && r.status !== "COMPLETED") || r.state === "PENDING")
  return { checks: pending ? "pending" : "success", failedChecks: [] }
}

export function openPulls(repo: string): PullRequest[] {
  const fields = "number,title,author,url,isDraft,createdAt,updatedAt,additions,deletions,changedFiles,mergeable,reviewDecision,statusCheckRollup"
  return gh<GhPull[]>(["pr", "list", "--repo", repo, "--state", "open", "--limit", "200", "--json", fields]).map((p) => ({
    number: p.number,
    title: p.title,
    author: p.author.login,
    url: p.url,
    draft: p.isDraft,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    additions: p.additions,
    deletions: p.deletions,
    changedFiles: p.changedFiles,
    ...checks(p.statusCheckRollup ?? []),
    mergeable: p.mergeable === "MERGEABLE" || p.mergeable === "CONFLICTING" ? p.mergeable : "UNKNOWN",
    review:
      p.reviewDecision === "APPROVED" || p.reviewDecision === "CHANGES_REQUESTED" || p.reviewDecision === "REVIEW_REQUIRED"
        ? p.reviewDecision
        : "NONE",
  }))
}

type GhRun = { workflowName: string; event: string; headBranch: string; status: string; conclusion: string; createdAt: string; url: string }

export function mainRuns(repo: string): WorkflowRun[] {
  return gh<GhRun[]>([
    "run", "list", "--repo", repo, "--branch", "main", "--limit", "40",
    "--json", "workflowName,event,headBranch,status,conclusion,createdAt,url",
  ]).map((r) => ({
    workflow: r.workflowName,
    event: r.event,
    branch: r.headBranch,
    status: r.status,
    conclusion: r.conclusion || null,
    createdAt: r.createdAt,
    url: r.url,
  }))
}

const monday = (iso: string) => {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

// 주별 활동 — main 에 머지된 PR(작성 계정별)과 main 커밋 수. 활동이 없던 주도 0 으로 채운다.
export function weeklyActivity(repo: string, clone: string, today: Date) {
  const merged = gh<Array<{ mergedAt: string; author: { login: string } }>>([
    "pr", "list", "--repo", repo, "--state", "merged", "--limit", "1000", "--json", "mergedAt,author",
  ])
  const commits = run("git", ["log", "origin/main", "--no-merges", "--format=%cs"], clone).split("\n").filter(Boolean)
  const weeks = new Map<string, { week: string; merged: Record<string, number>; commits: number }>()
  const at = (key: string) => {
    let w = weeks.get(key)
    if (!w) weeks.set(key, (w = { week: key, merged: {}, commits: 0 }))
    return w
  }
  for (const p of merged) {
    const w = at(monday(p.mergedAt))
    w.merged[p.author.login] = (w.merged[p.author.login] ?? 0) + 1
  }
  for (const c of commits) at(monday(c)).commits += 1
  const keys = [...weeks.keys()].sort()
  if (!keys.length) return []
  const out = []
  const last = monday(today.toISOString())
  for (let d = new Date(`${keys[0]}T00:00:00Z`); d.toISOString().slice(0, 10) <= last; d.setUTCDate(d.getUTCDate() + 7)) {
    const key = d.toISOString().slice(0, 10)
    out.push(weeks.get(key) ?? { week: key, merged: {}, commits: 0 })
  }
  return out
}

// 판정한 코드의 커밋. 서버의 클론은 실행 전에 origin/main 으로 맞춰 두므로 HEAD 가 곧 main 이다.
export function mainHead(clone: string) {
  const [commit, committedAt, subject] = run("git", ["log", "-1", "HEAD", "--format=%h%x1f%cI%x1f%s"], clone).split("\x1f")
  return { commit, committedAt: new Date(committedAt).toISOString(), subject }
}

export function changedFiles(clone: string, from: string, to: string): string[] | null {
  try {
    return run("git", ["diff", "--name-only", from, to], clone).split("\n").filter(Boolean)
  } catch {
    // 이전 커밋을 이 클론이 모르면(얕은 클론 · 강제 푸시) 바뀐 범위를 알 수 없다 — 전체를 다시 본다.
    return null
  }
}
