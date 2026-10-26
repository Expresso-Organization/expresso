import { readFileSync } from "node:fs"
import { join } from "node:path"

import type { Feature } from "../shared/report.ts"

// 스캔 대상은 설계서가 정한다. 실행할 때마다 원문을 다시 읽어, 설계서를 고치면 대상도 따라 바뀐다.
const DESIGN = "docs/design-doc/02-요구사항-정의.md"
const TASK_SPEC = "docs/task-spec.js"

export type GroupDef = { id: string; name: string; owner: string }

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim().replace(/^`|`$/g, ""))

// 「## 2.3.」부터 다음 「## 」 전까지의 표 줄만 꺼냅니다.
function section(markdown: string, heading: string): string[] {
  const lines = markdown.split("\n")
  const start = lines.findIndex((l) => l.startsWith(`## ${heading}`))
  if (start < 0) throw new Error(`설계서에 「${heading}」 절이 없습니다 (${DESIGN})`)
  const end = lines.findIndex((l, i) => i > start && l.startsWith("## "))
  return lines.slice(start + 1, end < 0 ? undefined : end).filter((l) => l.startsWith("|") && !/^\|\s*-/.test(l))
}

function readTaskSpec(repo: string): Record<string, { does?: string; rule?: string }> {
  const source = readFileSync(join(repo, TASK_SPEC), "utf8")
  const body = source.slice(source.indexOf("{"), source.lastIndexOf("}") + 1)
  return JSON.parse(body) as Record<string, { does?: string; rule?: string }>
}

export function readSpec(repo: string): { features: Feature[]; groups: GroupDef[] } {
  const markdown = readFileSync(join(repo, DESIGN), "utf8")
  const spec = readTaskSpec(repo)
  const features: Feature[] = []
  const groupNames = new Map<string, string>()

  // 2.5 — | 번호 | D1 커리어 기록 | F1.1 카테고리 관리 | T1.1.1 기본 카테고리 제공 | 오시건 |
  for (const line of section(markdown, "2.5.")) {
    const [, domain, major, detail, owner] = cells(line)
    const d = /^(D\d+)\s+(.+)$/.exec(domain ?? "")
    const t = /^(T\d+\.\d+\.\d+)\s+(.+)$/.exec(detail ?? "")
    if (!d || !t || !owner) continue
    groupNames.set(d[1], d[2])
    features.push({
      id: t[1],
      group: d[1],
      name: t[2],
      major: major,
      owner,
      does: spec[t[1]]?.does ?? null,
      rule: spec[t[1]]?.rule ?? null,
    })
  }

  // 2.3 — | 번호 | 주요모듈 | 상세기능 | 개발담당 |
  for (const line of section(markdown, "2.3.")) {
    const [no, module, detail, owner] = cells(line)
    if (!/^\d+$/.test(no ?? "") || !detail || !owner) continue
    features.push({ id: `AI-${no}`, group: "AI", name: detail, major: module, owner, does: null, rule: null })
  }
  groupNames.set("AI", "AI학습서버")

  // 2.6 — | 번호) | 주요기능 | 상세기능 | 현재 엔드포인트 또는 상태 | 개발담당 |
  for (const line of section(markdown, "2.6.")) {
    const [no, major, detail, hint, owner] = cells(line)
    const n = /^(\d+)\)$/.exec(no ?? "")
    if (!n || !detail || !owner) continue
    features.push({
      id: `ADM-${n[1]}`,
      group: "ADM",
      name: detail,
      major,
      owner,
      // 표의 셋째 칸은 설계서를 쓸 때의 엔드포인트나 상태다. 판정이 아니라 찾아볼 단서로만 넘긴다.
      does: hint ? `설계서 작성 시점의 단서: ${hint}` : null,
      rule: null,
    })
  }
  groupNames.set("ADM", "관리자 기능")

  const groups = [...groupNames.entries()].map(([id, name]) => {
    const owners = [...new Set(features.filter((f) => f.group === id).map((f) => f.owner))]
    return { id, name, owner: owners.join(" · ") }
  })
  return { features, groups }
}
