import { spawn } from "node:child_process"

import { z } from "zod"

// 서버에 로그인된 Claude Code 를 부른다. 호출 방식은 백엔드 어댑터
// (services/backend/src/platform/ai/claude-code.ts)가 실측해 고른 것을 따른다 —
// 프롬프트는 stdin, 결과는 --json-schema 의 structured_output, MCP 서버는 싣지 않는다.
// 다른 점은 코드를 읽어야 하므로 클론을 cwd 로 두고 읽기 도구 셋만 연다는 것이다.

const Envelope = z.object({
  type: z.literal("result"),
  subtype: z.string().optional(),
  is_error: z.boolean(),
  result: z.string().optional(),
  total_cost_usd: z.number().optional(),
  structured_output: z.unknown().optional(),
})

export type AgentCall = {
  cli: string
  cwd: string
  model: string
  system: string
  prompt: string
  schema: z.ZodType
  tools: string[] // 빈 배열이면 도구 없이 답만 한다
  budgetUsd: number
  timeoutMs: number
}

export type AgentResult<T> = { data: T; costUsd: number }

export class AgentError extends Error {}

// 구조화 출력은 모든 속성이 required 여야 한다 — 선택 필드는 nullable 로 표현한다.
function jsonSchema(schema: z.ZodType) {
  const json = z.toJSONSchema(schema, { target: "draft-2020-12" }) as Record<string, unknown>
  delete json.$schema
  return json
}

export async function callAgent<T>(call: AgentCall): Promise<AgentResult<T>> {
  const args = [
    "-p",
    "--model", call.model,
    "--output-format", "stream-json",
    "--verbose",
    "--json-schema", JSON.stringify(jsonSchema(call.schema)),
    "--append-system-prompt", call.system,
    "--strict-mcp-config",
    "--mcp-config", '{"mcpServers":{}}',
    "--no-session-persistence",
    "--max-budget-usd", String(call.budgetUsd),
    // 쓸 수 있는 도구 자체를 읽기 셋으로 제한한다. 쓰기 · 셸 도구는 목록에 없다.
    "--tools", call.tools.join(","),
    ...(call.tools.length ? ["--allowedTools", call.tools.join(",")] : []),
  ]
  const { stdout, stderr, code } = await new Promise<{ stdout: string; stderr: string; code: number }>((resolve, reject) => {
    const child = spawn(call.cli, args, {
      cwd: call.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      // 헤드리스 실행에 필요 없는 보조 호출을 끈다. 켜 두면 Claude Code 가 주 모델과 별개로
      // claude-fable-5-1 을 불러, 작은 호출에서 비용이 열 배($0.024 → $0.23)로 뛰었다(2026-10-25 실측).
      // 변수 출처: https://code.claude.com/docs/en/env-vars.md
      env: {
        ...process.env,
        CLAUDE_CODE_DISABLE_TERMINAL_TITLE: "1",
        CLAUDE_CODE_ENABLE_AWAY_SUMMARY: "0",
        CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION: "false",
      },
    })
    let out = ""
    let err = ""
    const timer = setTimeout(() => child.kill("SIGTERM"), call.timeoutMs)
    child.stdout.on("data", (d) => (out += d))
    child.stderr.on("data", (d) => (err += d))
    child.on("error", reject)
    child.on("close", (c) => {
      clearTimeout(timer)
      resolve({ stdout: out, stderr: err, code: c ?? 1 })
    })
    child.stdin.end(call.prompt)
  })

  // 경고 줄이 섞일 수 있어 result 봉투로 읽히는 마지막 줄을 쓴다.
  const envelope = stdout
    .split("\n")
    .reverse()
    .map((line) => {
      try {
        return Envelope.parse(JSON.parse(line))
      } catch {
        return null
      }
    })
    .find((e) => e !== null)
  if (!envelope) throw new AgentError(`claude 결과 봉투가 없습니다 (종료 코드 ${code}) ${stderr.trim().slice(0, 400)}`)
  // 예산 상한(error_max_budget_usd) · 턴 상한 같은 종료는 result 문구가 비어 있다 — 종료 유형을 함께 남긴다.
  if (envelope.is_error || (envelope.subtype && envelope.subtype !== "success")) {
    throw new AgentError(`claude 오류(${envelope.subtype ?? "?"}): ${envelope.result || stderr.trim().slice(0, 400) || "문구 없음"}`)
  }
  const parsed = call.schema.safeParse(envelope.structured_output)
  if (!parsed.success) throw new AgentError(`구조화 결과가 스키마와 다릅니다: ${z.prettifyError(parsed.error)}`)
  return { data: parsed.data as T, costUsd: envelope.total_cost_usd ?? 0 }
}
