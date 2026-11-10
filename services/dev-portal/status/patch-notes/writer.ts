import { spawn } from "node:child_process"

import { Draft } from "../shared/patch-notes.ts"
import type { Pull } from "./notes.ts"

// PR 하나를 읽고 패치노트 항목(Draft)을 받는다.
//
// 출력 검증을 CLI 에 맡기지 않는다(--json-schema 를 쓰지 않는다). --json-schema 는 모양이 틀리면
// 모델이 출력 전체를 다시 쓰게 하고, 그 재시도는 끌 수 없다. 모델은 JSON 을 글로 쓰고, 여기서 읽는다.
// 문법이 깨졌으면 같은 대화(--resume)에 고쳐 달라고 하고, 칸이 틀렸으면 그 칸만 다시 받는다.
// 고칠 때마다 남은 오류가 줄어드는 동안만 계속한다.

const FIELDS = ["kind", "title", "details"] as const
type Field = (typeof FIELDS)[number]

export const SYSTEM = `당신은 Expresso 의 패치노트를 씁니다. Expresso 는 커리어 기록을 모아 채용 공고에 맞는 포트폴리오를 만들고 배포하는 웹 서비스입니다.
PR 하나를 받으면 그 변경을 패치노트 항목 하나로 씁니다. 읽는 사람은 제품을 쓰는 사람과 팀원이고, 코드를 보지 않습니다.

답은 JSON 객체 하나만 씁니다. 앞뒤에 다른 글을 쓰지 않습니다.
{"kind": "user" 또는 "dev", "title": "변경 이름", "details": ["문장", ...]}

- kind: 제품 화면이나 동작에서 사람이 겪는 변화면 "user". CI · 테스트 · 문서 · 서버 운영 · 실험 · 로그처럼 화면에 드러나지 않으면 "dev".
- title: 그 변경의 이름을 명사구로 씁니다. 짧게(20자 안팎). 결론이나 문장을 쓰지 않습니다. 예: "포트폴리오 휴지통", "생성 대기 화면 개선", "자동 검사 속도 개선".
- details: 1~4개. 한 줄에 한 가지만, 존댓말 완결형 문장으로 씁니다. 사람이 화면에서 보거나 할 수 있게 된 것을 씁니다.
  - 결함 수정은 "~하던 문제가 해결되었습니다", 새 기능은 "~할 수 있습니다", 바뀐 동작은 "~합니다"로 씁니다.
  - 화면에 보이는 버튼 · 탭 이름은 「」로 감쌉니다. 예: 「이 공고로 만들기」.
  - 함수 · 컴포넌트 · 파일 경로 · 테이블 이름 · 영어 내부 용어를 쓰지 않습니다. 화면 이름과 동작으로 풀어 씁니다.
  - 비유와 관용구를 쓰지 않습니다. 일어나는 일을 그대로 씁니다.
  - 측정 수치(ms · px · 건수)는 사람이 체감하는 결과를 보여 줄 때만 씁니다.
- dev 항목도 개발자가 아닌 사람이 이해하도록 씁니다. 예: "코드 변경을 자동으로 검사하는 시간을 줄였습니다."

예시
{"kind":"user","title":"포트폴리오 휴지통","details":["홈 「내 포트폴리오」 카드나 편집기의 「…」 메뉴에서 포트폴리오와 만들던 포트폴리오를 휴지통으로 옮길 수 있습니다.","휴지통으로 옮긴 포트폴리오는 30일 안에 「휴지통」 창에서 복원합니다."]}
{"kind":"user","title":"좁은 화면 공고 목록 개선","details":["휴대폰이나 오른쪽 패널이 열린 화면에서 공고 행이 두 줄로 배치되어 공고 제목이 온전히 보입니다."]}
{"kind":"dev","title":"서버 저장 공간 확보","details":["서버 데이터베이스의 기록 파일이 11GB 넘게 쌓여 저장 공간을 차지하던 문제를 고쳤습니다.","기록 파일은 정해진 용량까지만 보관합니다."]}`

const BODY_LIMIT = 12_000
const FILE_LIMIT = 80

export function promptFor(pull: Pull): string {
  const body = pull.body.length > BODY_LIMIT ? pull.body.slice(0, BODY_LIMIT) + "\n…(이하 생략)" : pull.body
  const files = pull.files.slice(0, FILE_LIMIT).join("\n")
  return `PR #${pull.number}: ${pull.title}\n\n## 본문\n${body || "(본문 없음)"}\n\n## 바뀐 파일\n${files || "(없음)"}`
}

export type Extracted = { syntax: string | null; value: Record<string, unknown>; errors: Partial<Record<Field, string>> }

// 답에서 JSON 객체를 꺼낸다. 코드 울타리나 앞뒤 글이 붙어 있어도 첫 { 부터 마지막 } 까지를 읽는다.
export function parseObject(text: string): { value: Record<string, unknown> | null; error: string | null } {
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start < 0 || end <= start) return { value: null, error: "JSON 객체를 찾지 못했습니다" }
  try {
    const value: unknown = JSON.parse(text.slice(start, end + 1))
    if (!value || typeof value !== "object" || Array.isArray(value)) return { value: null, error: "JSON 객체가 아닙니다" }
    return { value: value as Record<string, unknown>, error: null }
  } catch (e) {
    return { value: null, error: (e as Error).message }
  }
}

export function checkFields(value: Record<string, unknown>, fields: readonly Field[] = FIELDS): Partial<Record<Field, string>> {
  const errors: Partial<Record<Field, string>> = {}
  for (const field of fields) {
    const result = Draft.shape[field].safeParse(value[field])
    if (!result.success) errors[field] = result.error.issues.map((i) => i.message).join("; ")
  }
  return errors
}

export function fixRequest(extracted: Extracted): string {
  if (extracted.syntax) {
    return `직전 답을 JSON 으로 읽지 못했습니다(${extracted.syntax}). 같은 내용을 JSON 객체 하나로만 다시 적어 주세요.`
  }
  const lines = Object.entries(extracted.errors).map(([k, v]) => `- ${k}: ${v} — ${Draft.shape[k as Field].description}`)
  return `직전 답에서 다음 칸만 형식이 맞지 않습니다. 이 칸들만 담은 JSON 객체 하나로 답해 주세요. 다른 칸은 그대로 둡니다.\n${lines.join("\n")}`
}

const errorCount = (x: Extracted) => (x.syntax ? Number.POSITIVE_INFINITY : Object.keys(x.errors).length)

export type Ask = (input: { prompt: string; resume: string | null }) => Promise<{ text: string; sessionId: string; costUsd: number }>

export async function writeDraft(pull: Pull, ask: Ask, maxRounds: number): Promise<{ draft: Draft; costUsd: number; rounds: number }> {
  let reply = await ask({ prompt: promptFor(pull), resume: null })
  let cost = reply.costUsd
  const first = parseObject(reply.text)
  let current: Extracted = first.value
    ? { syntax: null, value: first.value, errors: checkFields(first.value) }
    : { syntax: first.error, value: {}, errors: {} }

  let rounds = 0
  while (errorCount(current) > 0) {
    if (rounds >= maxRounds) throw new Error(`고침 ${rounds}번 뒤에도 형식이 맞지 않습니다: ${fixRequest(current)}`)
    rounds += 1
    const session = reply.sessionId
    reply = await ask({ prompt: fixRequest(current), resume: session })
    cost += reply.costUsd
    const parsed = parseObject(reply.text)
    let next: Extracted
    if (!parsed.value) {
      next = { syntax: parsed.error, value: current.value, errors: current.errors }
    } else if (current.syntax) {
      next = { syntax: null, value: parsed.value, errors: checkFields(parsed.value) }
    } else {
      // 틀린 칸만 받아 덮는다.
      const asked = Object.keys(current.errors) as Field[]
      const value = { ...current.value }
      for (const field of asked) if (field in parsed.value) value[field] = parsed.value[field]
      next = { syntax: null, value, errors: checkFields(value) }
    }
    if (errorCount(next) >= errorCount(current) && !current.syntax) {
      throw new Error(`고쳐도 나아지지 않습니다: ${fixRequest(next)}`)
    }
    current = next
  }
  return { draft: Draft.parse(current.value), costUsd: cost, rounds }
}

// 서버에 로그인된 Claude Code 를 부른다. 프롬프트는 stdin, 결과는 json 봉투의 result 글.
// MCP 서버와 도구는 싣지 않는다 — PR 본문만 읽고 답한다.
export function claudeAsk(opts: { cli: string; model: string; budgetUsd: number; timeoutMs: number; cwd: string }): Ask {
  return ({ prompt, resume }) =>
    new Promise((resolve, reject) => {
      const args = [
        "-p",
        "--model", opts.model,
        "--output-format", "json",
        "--append-system-prompt", SYSTEM,
        "--strict-mcp-config",
        "--mcp-config", '{"mcpServers":{}}',
        "--max-budget-usd", String(opts.budgetUsd),
        "--tools", "",
        ...(resume ? ["--resume", resume] : []),
      ]
      const child = spawn(opts.cli, args, { cwd: opts.cwd, stdio: ["pipe", "pipe", "pipe"] })
      let stdout = ""
      let stderr = ""
      const timer = setTimeout(() => child.kill("SIGTERM"), opts.timeoutMs)
      child.stdout.on("data", (d: Buffer) => (stdout += d.toString()))
      child.stderr.on("data", (d: Buffer) => (stderr += d.toString()))
      child.on("error", (e) => {
        clearTimeout(timer)
        reject(e)
      })
      child.on("close", (code) => {
        clearTimeout(timer)
        let envelope: { is_error?: boolean; result?: string; session_id?: string; total_cost_usd?: number } | null
        try {
          envelope = JSON.parse(stdout)
        } catch {
          envelope = null
        }
        if (!envelope || envelope.is_error || typeof envelope.result !== "string" || !envelope.session_id) {
          reject(new Error(`claude 호출 실패(종료 코드 ${code}): ${(envelope?.result ?? stderr ?? stdout).slice(0, 400)}`))
          return
        }
        resolve({ text: envelope.result, sessionId: envelope.session_id, costUsd: envelope.total_cost_usd ?? 0 })
      })
      child.stdin.end(prompt)
    })
}
