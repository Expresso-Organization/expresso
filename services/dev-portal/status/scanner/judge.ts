import { existsSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

import { z } from "zod"

import { State, type Feature } from "../shared/report.ts"
import { callAgent, AgentError } from "./agent.ts"

// 도메인 하나의 기능들을 에이전트가 main 코드를 읽어 판정한다.

const Output = z.object({
  judgments: z.array(
    z.object({
      id: z.string(),
      state: State,
      missing: z.string().nullable(),
      evidence: z.array(z.string()),
    })
  ),
})
type Output = z.infer<typeof Output>

const SYSTEM = `너는 Expresso 저장소의 구현 현황 감사자다. 설계서가 정한 기능마다 main 코드에 실제로 구현되어 있는지 판정한다.
코드를 읽기만 한다. 추측으로 완료를 주지 않는다. 근거를 찾지 못하면 미구현으로 둔다.

판정 값:
- done: 정의(동작 · 규칙)를 모두 충족하고, 백엔드 동작과 웹 화면 연결이 모두 있다.
- partial: 동작하는 경로가 있으나 규칙 일부가 빠졌거나 화면 일부만 연결되었다.
- api: 백엔드 경로 · 로직은 있으나 웹 화면에서 호출하지 않는다.
- todo: 근거 코드를 찾지 못했다.

규칙:
- 웹 화면이 예시 데이터(lib/sample 등)를 그리거나 버튼에 동작이 없으면 화면 연결로 보지 않는다.
- 기능 플래그 뒤에 있는 화면은 플래그가 켜졌다고 보고 판정하되 missing 에 그 사실을 적는다.
- missing 은 정의 대비 빠진 것을 한국어 한 줄로 적는다(80자 이내). done 이면 null.
- evidence 는 판정의 근거가 된 저장소 상대 경로 1~3개다. 가능하면 "경로:줄"로 적는다. 실제로 연 파일만 적는다.
- 요청받은 기능 id 를 빠짐없이, 한 번씩만 답한다.`

function prompt(group: { id: string; name: string }, features: Feature[], paths: string[]) {
  const list = features
    .map((f) =>
      [
        `### ${f.id} ${f.name}`,
        `- 주요기능: ${f.major} · 담당: ${f.owner}`,
        f.does ? `- 동작: ${f.does}` : null,
        f.rule ? `- 규칙: ${f.rule}` : null,
      ]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n\n")
  return `도메인 ${group.id} ${group.name}의 기능 ${features.length}개를 판정하라.
먼저 볼 곳(여기에 없을 수도 있다 — 필요하면 저장소 전체를 찾아라):
${paths.map((p) => `- ${p}`).join("\n")}

판정할 기능:

${list}`
}

// 경로가 클론에 실제로 있는 파일인지 본다. 줄 번호가 파일 길이를 넘으면 줄 번호만 뗀다.
export function checkEvidence(clone: string, evidence: string[]): { kept: string[]; dropped: number } {
  const kept: string[] = []
  let dropped = 0
  for (const raw of evidence) {
    const m = /^(.+?)(?::(\d+)(?:-\d+)?)?$/.exec(raw.trim().replace(/^\.?\//, ""))
    const file = m?.[1]
    if (!file || file.includes("..") || !existsSync(join(clone, file)) || !statSync(join(clone, file)).isFile()) {
      dropped += 1
      continue
    }
    const line = m?.[2] ? Number(m[2]) : null
    const lines = line ? readFileSync(join(clone, file), "utf8").split("\n").length : 0
    kept.push(line && line <= lines ? `${file}:${line}` : file)
  }
  return { kept: [...new Set(kept)], dropped }
}

export type GroupVerdict = {
  judgments: Array<{ id: string; state: z.infer<typeof State>; missing: string | null; evidence: string[] }>
  costUsd: number
  evidenceKept: number
  evidenceDropped: number
}

export async function judgeGroup(options: {
  cli: string
  clone: string
  model: string
  budgetUsd: number
  timeoutMs: number
  group: { id: string; name: string }
  features: Feature[]
  paths: string[]
}): Promise<GroupVerdict> {
  const want = new Set(options.features.map((f) => f.id))
  let costUsd = 0
  let lastError = ""
  // 요청한 id 와 답한 id 가 어긋나면 한 번 더 묻는다.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const text =
      prompt(options.group, options.features, options.paths) +
      (lastError ? `\n\n지난 답이 거절된 이유: ${lastError}\n요청한 id 를 정확히 한 번씩 답하라.` : "")
    const result = await callAgent<Output>({
      cli: options.cli,
      cwd: options.clone,
      model: options.model,
      system: SYSTEM,
      prompt: text,
      schema: Output,
      tools: ["Read", "Grep", "Glob"],
      budgetUsd: options.budgetUsd,
      timeoutMs: options.timeoutMs,
    })
    costUsd += result.costUsd
    const got = result.data.judgments.map((j) => j.id)
    const missing = [...want].filter((id) => !got.includes(id))
    const extra = got.filter((id) => !want.has(id))
    const duplicated = got.length !== new Set(got).size
    if (!missing.length && !extra.length && !duplicated) {
      let kept = 0
      let dropped = 0
      const judgments = result.data.judgments.map((j) => {
        const checked = checkEvidence(options.clone, j.evidence)
        kept += checked.kept.length
        dropped += checked.dropped
        return { ...j, evidence: checked.kept }
      })
      return { judgments, costUsd, evidenceKept: kept, evidenceDropped: dropped }
    }
    lastError = [
      missing.length ? `빠진 id ${missing.join(", ")}` : "",
      extra.length ? `요청하지 않은 id ${extra.join(", ")}` : "",
      duplicated ? "같은 id 를 두 번 답함" : "",
    ]
      .filter(Boolean)
      .join(" · ")
  }
  throw new AgentError(`${options.group.id} 판정 실패 — ${lastError}`)
}
