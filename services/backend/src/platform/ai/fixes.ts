import { z } from "zod";

import { AiError, parseToolOutput, type AiCallOptions, type AiContract, type AiFix, type AiResult, type AiUsage, type AiViolation } from "./client.js";

/**
 * 검사에 걸린 칸을 쓴 에이전트가 고치게 하는 데 쓰는 도구입니다.
 *
 * 출력을 거절하고 처음부터 다시 쓰게 하지 않습니다. 걸린 칸의 경로와 이유를 같은 대화에 보내고, 고친 칸만 받아
 * 그 자리에 넣습니다(`claude-code.ts`).
 */

/** 같은 대화에서 고치기를 몇 번까지 하는가(intent `ai-output-no-rewrite`, 2026-10-27 수락). 그 뒤 남은 업무 규칙 위반은 쓴 그대로 둡니다. */
export const AI_FIX_ROUNDS = 2;

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
  return `직전에 낸 출력에서 아래 칸이 검사를 통과하지 못했습니다. 각 칸의 고친 값만 fixes로 내세요. path는 아래 경로를 그대로 쓰고, value는 그 칸에 들어갈 값 전체입니다. 나머지 칸은 그대로 쓰므로 다시 내지 않습니다.\n${lines.join("\n")}`;
}

/**
 * 받은 출력을 검사하고, 걸린 칸만 같은 대화에서 고쳐 받습니다. 공급자 어댑터가 첫 호출(`first`)과 같은 대화를
 * 이어 쓰는 호출(`fix`)을 넘깁니다 — 테스트의 가짜 공급자도 이 함수를 써서 실제 어댑터와 같은 순서로 돕니다.
 *
 * 계약(Zod)에 걸리면 고칩니다. 계약을 지나면 화면에 먼저 보여 주고(`onDraft`) 업무 규칙(`check`)을 봅니다.
 * `AI_FIX_ROUNDS`번 고친 뒤에도 업무 규칙 위반만 남으면 출력을 그대로 돌려주고 기록합니다. 계약 위반이 남으면
 * 저장할 수 없는 모양이라 `AI_INVALID_OUTPUT`입니다.
 */
export async function runWithFixes<T>(input: {
  contract: AiContract;
  schema: z.ZodType<T>;
  options: AiCallOptions<T>;
  first: () => Promise<{ output: unknown; usage: AiUsage }>;
  fix: (prompt: string, schema: z.ZodType) => Promise<{ output: unknown; usage: AiUsage }>;
}): Promise<AiResult<T>> {
  const { contract, schema, options } = input;
  const first = await input.first();
  const usages = [first.usage];
  let output = first.output;
  let drafted = false;
  for (let round = 0; ; round += 1) {
    const parsed = parseToolOutput(schema, output);
    if (parsed.success && !drafted) {
      drafted = true;
      options.onDraft?.(parsed.data);
    }
    const violations = parsed.success ? (options.check?.(parsed.data) ?? []) : zodViolations(parsed.error);
    if (!violations.length || round >= AI_FIX_ROUNDS) {
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
    // 거절하지 않고, 걸린 칸만 같은 대화에서 고쳐 받는다.
    const grouped = groupViolations(violations);
    const shape = fixSchema([...grouped.keys()]);
    const fixed = await input.fix(fixPrompt(grouped, output), shape);
    usages.push(fixed.usage);
    const received = shape.safeParse(fixed.output);
    console.error(JSON.stringify({ level: "info", event: "ai.fix_round", contract, round: round + 1, paths: [...grouped.keys()].slice(0, 20), fixed: received.success ? received.data.fixes.length : 0, durationMs: fixed.usage.durationMs }));
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
