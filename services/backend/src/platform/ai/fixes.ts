import { z } from "zod";

import { AiError, parseToolOutput, type AiCallOptions, type AiContract, type AiFix, type AiResult, type AiUsage, type AiViolation } from "./client.js";

/**
 * 검사에 걸린 칸을 쓴 에이전트가 고치게 하는 데 쓰는 도구입니다.
 *
 * 출력을 거절하고 처음부터 다시 쓰게 하지 않습니다. 걸린 자리를 같은 대화에 보내고, 고친 조각만 받아 그 자리에
 * 넣습니다(`claude-code.ts`). 걸린 자리는 둘입니다.
 *
 * - JSON 문법: 모델은 JSON을 글로 쓰고 서버가 읽습니다(`readJsonText`). 문법이 깨진 자리는 바꿀 원문 조각과 고친
 *   조각(`edits`)으로, 중간에 끊긴 글은 이어지는 글로 받습니다.
 * - 계약(Zod)과 업무 규칙(`check`): 걸린 칸의 경로와 이유를 보내고 그 칸의 새 값(`fixes`)을 받습니다.
 *
 * 고치기는 진전이 있는 동안 계속합니다(intent `ai-output-no-cli-rewrite`, 2026-10-27 수락). 문법은 오류 위치가
 * 앞으로 가야, 칸은 걸린 경로 수가 줄어야 진전입니다. 둘 다 유한한 값이 줄기만 하므로 고치기는 반드시 끝납니다.
 */

/** 경로 배열을 JSON 포인터로 바꿉니다(RFC 6901의 `~0` · `~1` 이스케이프). */
export function jsonPointer(path: readonly PropertyKey[]): string {
  return path.map((part) => `/${String(part).replace(/~/g, "~0").replace(/\//g, "~1")}`).join("");
}

/** JSON 포인터를 경로 배열로 바꿉니다. */
export function pointerParts(pointer: string): string[] {
  return pointer === "" ? [] : pointer.slice(1).split("/").map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"));
}

/** Zod 이슈를 칸 단위 위반으로 바꿉니다. 메시지는 Zod 기본 문장이고, 기준 값이 함께 들어 있습니다. */
export function zodViolations(error: z.ZodError): AiViolation[] {
  return error.issues.map((issue) => ({ path: jsonPointer(issue.path), problem: issue.message }));
}

export function valueAt(root: unknown, pointer: string): unknown {
  let node = root;
  for (const part of pointerParts(pointer)) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

/**
 * 고친 칸을 출력에 넣은 사본을 돌려줍니다. 원본은 건드리지 않습니다. 배열 경로는 번호 자리에 넣고, 중간 자리가
 * 없으면 객체로 만듭니다(빠진 필수 칸을 채우는 고치기).
 */
export function applyFixes(root: unknown, fixes: readonly AiFix[]): unknown {
  let result = structuredClone(root);
  for (const fix of fixes) {
    const parts = pointerParts(fix.path);
    if (!parts.length) {
      result = structuredClone(fix.value);
      continue;
    }
    let node = result as Record<string, unknown>;
    for (const part of parts.slice(0, -1)) {
      if (node[part] === null || typeof node[part] !== "object") node[part] = {};
      node = node[part] as Record<string, unknown>;
    }
    node[parts.at(-1)!] = structuredClone(fix.value);
  }
  return result;
}

/**
 * 같은 칸의 위반을 묶습니다. 다른 위반 칸 안에 있는 칸은 바깥 칸을 통째로 고쳐 받으므로 따로 묻지 않고, 그 이유를
 * 안쪽 경로와 함께 바깥 칸의 이유에 붙입니다 — 안쪽 이유가 빠지면 바깥 칸을 고치면서 같은 위반을 다시 낸다.
 */
export function groupViolations(violations: readonly AiViolation[]): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const violation of violations) grouped.set(violation.path, [...(grouped.get(violation.path) ?? []), violation.problem]);
  const paths = [...grouped.keys()];
  const outer = (path: string) => paths.filter((other) => other !== path && (other === "" || path.startsWith(`${other}/`))).sort((a, b) => a.length - b.length)[0];
  for (const path of paths) {
    const parent = outer(path);
    if (parent === undefined) continue;
    grouped.set(parent, [...grouped.get(parent)!, ...grouped.get(path)!.map((problem) => `${path.slice(parent.length) || "/"}: ${problem}`)]);
    grouped.delete(path);
  }
  return grouped;
}

/**
 * 모델에게 보이는 경로입니다. JSON 포인터에서 출력 전체는 `""`이지만 모델은 빈 문자열을 경로로 적지 않으므로 `/`로
 * 보이고, 받은 고치기에서 다시 `""`로 돌립니다. 우리 출력에는 빈 이름의 키가 없어 `/`가 다른 칸과 겹치지 않습니다.
 */
const shownPath = (path: string) => path || "/";
const realPath = (path: string) => (path === "/" ? "" : path);

/** 고치기 요청의 출력 형식입니다. 경로는 걸린 칸의 열거형이라 다른 칸을 고칠 수 없습니다. */
export function fixSchema(paths: readonly string[]) {
  return z.object({
    fixes: z.array(z.object({ path: z.enum(paths.map(shownPath) as [string, ...string[]]), value: z.unknown() })),
  });
}

/** 고치기 요청 문장입니다. 지금 값을 함께 보여 줘 앞선 고치기 뒤의 상태를 모델이 알게 합니다. */
export function fixPrompt(grouped: Map<string, string[]>, current: unknown): string {
  const lines = [...grouped].map(([path, problems]) =>
    `- ${shownPath(path)}: ${problems.join("; ")}\n  지금 값: ${JSON.stringify(valueAt(current, path)) ?? "(없음)"}`);
  return `직전에 낸 출력에서 아래 칸이 검사를 통과하지 못했습니다. 각 칸의 고친 값만 {"fixes":[{"path":"경로","value":값}]} 모양의 JSON 하나로 내세요. path는 아래 경로를 그대로 쓰고, value는 그 칸에 들어갈 값 전체입니다. 나머지 칸은 그대로 쓰므로 다시 내지 않습니다.\n${lines.join("\n")}`;
}

/** 공급자가 돌려준 한 번의 답. 글(`text`)이면 서버가 JSON으로 읽고, 이미 읽은 값(`output`)이면 그대로 씁니다. */
export type AiTurn = { usage: AiUsage } & ({ text: string } | { output: unknown });

export type JsonRead =
  | { ok: true; value: unknown }
  | {
      ok: false;
      /** 글 전체에서 문법이 깨진 위치(0부터). 끊긴 글이면 글의 끝입니다. */
      at: number;
      /** 글이 중간에 끊겼는가. 그러면 고칠 조각이 아니라 이어지는 글을 받습니다. */
      truncated: boolean;
      message: string;
    };

/**
 * 모델이 글로 쓴 JSON을 읽습니다.
 *
 * 첫 `{` · `[`부터 마지막 `}` · `]`까지가 JSON입니다. 앞뒤의 코드 블록 표시와 설명 글은 읽지 않습니다 — 내용을
 * 바꾸는 일이 아니라 JSON이 어디서 시작하고 끝나는지 정하는 일입니다.
 *
 * 문법 오류의 위치는 `JSON.parse`가 알려 줍니다(Node 26 V8: `… in JSON at position N`). 위치가 읽은 글의 끝이면
 * 글이 중간에 끊긴 것입니다. "after JSON at position N"이면 JSON 뒤에 글이 더 붙은 것이라 그 앞까지만 읽습니다.
 */
export function readJsonText(text: string): JsonRead {
  const start = text.search(/[{[]/);
  if (start < 0) return { ok: false, at: text.length, truncated: true, message: "JSON이 시작되지 않았습니다" };
  const close = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  let candidate = close > start ? text.slice(start, close + 1) : text.slice(start);
  for (;;) {
    try {
      return { ok: true, value: JSON.parse(candidate) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const after = /after JSON at position (\d+)/.exec(message);
      if (after) {
        candidate = candidate.slice(0, Number(after[1]));
        continue;
      }
      const position = /position (\d+)/.exec(message);
      const at = position ? Number(position[1]) : candidate.length;
      // 읽은 글의 끝에서 막혔으면 뒤가 없는 것이다. 마지막 괄호 뒤에 남은 글이 있어도, 그 글은 끊긴 출력의 일부다.
      if (at >= candidate.length) return { ok: false, at: text.length, truncated: true, message };
      return { ok: false, at: start + at, truncated: false, message };
    }
  }
}

/** 문법 고치기 응답의 모양. `find`는 원문에 정확히 한 번 있는 조각이어야 바뀝니다. */
export const SYNTAX_EDITS_SCHEMA = z.object({
  edits: z.array(z.object({ find: z.string().min(1), replace: z.string() })),
});

/** 문법이 깨진 자리 앞뒤로 보여 줄 글자 수. 깨진 따옴표 · 쉼표가 있는 문장 하나가 들어가는 폭이다. */
const SYNTAX_CONTEXT_CHARS = 160;

/** 문법 고치기 요청 문장입니다. 같은 대화라 모델은 자기 출력 전체를 알고 있으므로, 깨진 자리 앞뒤만 보입니다. */
export function syntaxFixPrompt(text: string, at: number, message: string): string {
  const from = Math.max(0, at - SYNTAX_CONTEXT_CHARS);
  const to = Math.min(text.length, at + SYNTAX_CONTEXT_CHARS);
  return [
    `직전에 낸 JSON이 ${at}번째 글자 근처에서 문법이 깨져 읽히지 않습니다(${message}).`,
    `그 앞뒤 글: «${text.slice(from, at)}⟪여기⟫${text.slice(at, to)}»`,
    `깨진 곳만 고쳐 {"edits":[{"find":"원문에 정확히 한 번 있는 조각","replace":"고친 조각"}]} 모양의 JSON 하나로 내세요. 문자열 안의 큰따옴표는 \\" 로, 줄바꿈은 \\n 으로 씁니다. 출력 전체를 다시 쓰지 않습니다.`,
  ].join("\n");
}

/** 끊긴 출력을 이어 쓰게 하는 문장입니다. 받은 글은 끊긴 자리 뒤에 그대로 붙습니다. */
export function continuePrompt(text: string): string {
  return [
    "직전에 낸 JSON이 끝까지 오지 않고 끊겼습니다. 끝부분:",
    `«${text.slice(-SYNTAX_CONTEXT_CHARS)}»`,
    "끊긴 바로 다음 글자부터 JSON 끝까지 이어서 쓰세요. 앞부분을 되풀이하지 말고, 코드 블록 표시나 설명 없이 이어지는 글만 씁니다.",
  ].join("\n");
}

/** `find`가 원문에 정확히 한 번 있는 고치기만 적용합니다. 몇 개를 적용했는지 함께 돌려줍니다. */
export function applySyntaxEdits(text: string, edits: readonly { find: string; replace: string }[]): { text: string; applied: number } {
  let result = text;
  let applied = 0;
  for (const edit of edits) {
    const first = result.indexOf(edit.find);
    if (first < 0 || result.indexOf(edit.find, first + 1) >= 0) continue;
    result = result.slice(0, first) + edit.replace + result.slice(first + edit.find.length);
    applied += 1;
  }
  return { text: result, applied };
}

/**
 * 받은 출력을 검사하고, 걸린 자리만 같은 대화에서 고쳐 받습니다. 공급자 어댑터가 첫 호출(`first`)과 같은 대화를
 * 이어 쓰는 호출(`fix`)을 넘깁니다. 테스트의 가짜 공급자도 이 함수를 써서 실제 어댑터와 같은 순서로 돕니다.
 *
 * `fix`의 두 번째 인자는 그 답의 모양입니다. 어댑터는 그 모양을 프롬프트의 출력 형식으로 싣습니다. `null`이면
 * 모양이 없는 글(끊긴 출력의 이어지는 글)을 받습니다.
 *
 * 1. 글로 온 답을 JSON으로 읽습니다. 문법이 깨졌으면 그 자리만, 끊겼으면 이어지는 글만 받습니다.
 * 2. 계약(Zod)에 걸리면 고칩니다. 계약을 지나면 화면에 먼저 보여 주고(`onDraft`) 업무 규칙(`check`)을 봅니다.
 * 3. 진전이 없으면 멈춥니다. 업무 규칙 위반만 남으면 출력을 그대로 돌려주고 기록합니다. 계약 위반이 남으면 저장할
 *    수 없는 모양이라 `AI_INVALID_OUTPUT`입니다.
 */
export async function runWithFixes<T>(input: {
  contract: AiContract;
  schema: z.ZodType<T>;
  options: AiCallOptions<T>;
  first: () => Promise<AiTurn>;
  fix: (prompt: string, shape: z.ZodType | null) => Promise<AiTurn>;
}): Promise<AiResult<T>> {
  const { contract, schema, options } = input;
  const usages: AiUsage[] = [];

  /** 한 번의 답을 JSON 값으로 읽습니다. 문법 고치기 · 이어 쓰기도 같은 대화에서 합니다. */
  const read = async (turn: AiTurn): Promise<unknown> => {
    usages.push(turn.usage);
    if (!("text" in turn)) return turn.output;
    let text = turn.text;
    let lastAt = -1;
    for (;;) {
      const result = readJsonText(text);
      if (result.ok) return result.value;
      // 앞선 고치기 뒤에도 같은 자리(또는 더 앞)에서 막혔으면 진전이 없다.
      if (result.at <= lastAt) {
        throw new AiError("AI_INVALID_OUTPUT", contract, `output is not JSON after syntax fixes: ${result.message}`, { retryable: false });
      }
      lastAt = result.at;
      if (result.truncated) {
        const more = await input.fix(continuePrompt(text), null);
        usages.push(more.usage);
        const added = "text" in more ? more.text : JSON.stringify(more.output ?? "");
        console.error(JSON.stringify({ level: "info", event: "ai.continuation", contract, at: result.at, added: added.length, durationMs: more.usage.durationMs }));
        text += added;
        continue;
      }
      const reply = await input.fix(syntaxFixPrompt(text, result.at, result.message), SYNTAX_EDITS_SCHEMA);
      usages.push(reply.usage);
      const replyValue = "text" in reply ? readJsonText(reply.text) : { ok: true as const, value: reply.output };
      const edits = replyValue.ok ? SYNTAX_EDITS_SCHEMA.safeParse(replyValue.value) : null;
      const applied = edits?.success ? applySyntaxEdits(text, edits.data.edits) : { text, applied: 0 };
      console.error(JSON.stringify({ level: "info", event: "ai.syntax_fix", contract, at: result.at, message: result.message.slice(0, 200), applied: applied.applied, durationMs: reply.usage.durationMs }));
      text = applied.text;
    }
  };

  let output = await read(await input.first());
  let drafted = false;
  /** 앞선 고치기 전에 걸린 경로 수. 이보다 줄지 않으면 멈춥니다. */
  let previous = Number.POSITIVE_INFINITY;
  for (let round = 0; ; round += 1) {
    const parsed = parseToolOutput(schema, output);
    if (parsed.success && !drafted) {
      drafted = true;
      options.onDraft?.(parsed.data);
    }
    const violations = parsed.success ? (options.check?.(parsed.data) ?? []) : zodViolations(parsed.error);
    const grouped = groupViolations(violations);
    if (!violations.length || grouped.size >= previous) {
      if (parsed.success) {
        if (violations.length)
          console.error(JSON.stringify({ level: "warn", event: "ai.violations_kept", contract, violations: violations.slice(0, 20) }));
        return { data: parsed.data, usage: sumUsage(usages) };
      }
      throw new AiError(
        "AI_INVALID_OUTPUT",
        contract,
        `structured output did not match the schema after ${round} fix rounds: ${parsed.error.message}`,
        // 같은 대화에서 고쳐도 계약을 못 맞춘 출력이다. 같은 호출을 다시 돌려도 같은 자리에서 멈춘다.
        { retryable: false },
      );
    }
    previous = grouped.size;
    // 거절하지 않고, 걸린 칸만 같은 대화에서 고쳐 받는다.
    const shape = fixSchema([...grouped.keys()]);
    const reply = await input.fix(fixPrompt(grouped, output), shape);
    const received = shape.safeParse(await read(reply));
    console.error(JSON.stringify({ level: "info", event: "ai.fix_round", contract, round: round + 1, paths: [...grouped.keys()].slice(0, 20), fixed: received.success ? received.data.fixes.length : 0, durationMs: reply.usage.durationMs }));
    if (!received.success) continue;
    const fixes = received.data.fixes.map((fix) => ({ path: realPath(fix.path), value: fix.value }));
    output = applyFixes(output, fixes);
    const revised = parseToolOutput(schema, output);
    if (revised.success) options.onRevision?.(fixes, revised.data);
  }
}

/** 첫 호출과 고치기 호출의 사용량을 합칩니다. 모델 이름은 첫 호출(출력을 쓴 호출)의 것입니다. */
export function sumUsage(usages: readonly AiUsage[]): AiUsage {
  const [first] = usages;
  return {
    model: first!.model,
    inputTokens: usages.reduce((sum, usage) => sum + usage.inputTokens, 0),
    outputTokens: usages.reduce((sum, usage) => sum + usage.outputTokens, 0),
    cacheReadTokens: usages.reduce((sum, usage) => sum + usage.cacheReadTokens, 0),
    cacheCreationTokens: usages.reduce((sum, usage) => sum + usage.cacheCreationTokens, 0),
    costUsd: usages.some((usage) => usage.costUsd === null) ? null : usages.reduce((sum, usage) => sum + (usage.costUsd ?? 0), 0),
    durationMs: usages.reduce((sum, usage) => sum + usage.durationMs, 0),
  };
}
