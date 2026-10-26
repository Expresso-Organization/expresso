import { z } from "zod";

import type { AiFix, AiViolation } from "./client.js";

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

function pointerParts(pointer: string): string[] {
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

/** 같은 칸의 위반을 묶고, 다른 위반 칸 안에 있는 칸은 바깥 칸에 맡깁니다(바깥 칸을 통째로 고쳐 받으므로). */
export function groupViolations(violations: readonly AiViolation[]): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const violation of violations) grouped.set(violation.path, [...(grouped.get(violation.path) ?? []), violation.problem]);
  for (const path of [...grouped.keys()])
    if ([...grouped.keys()].some((other) => other !== path && (other === "" || path.startsWith(`${other}/`)))) grouped.delete(path);
  return grouped;
}

/** 고치기 요청의 출력 형식입니다. 경로는 걸린 칸의 열거형이라 다른 칸을 고칠 수 없습니다. */
export function fixSchema(paths: readonly string[]) {
  return z.object({
    fixes: z.array(z.object({ path: z.enum(paths as [string, ...string[]]), value: z.unknown() })),
  });
}

/** 고치기 요청 문장입니다. 지금 값을 함께 보여 줘 앞선 고치기 뒤의 상태를 모델이 알게 합니다. */
export function fixPrompt(grouped: Map<string, string[]>, current: unknown): string {
  const lines = [...grouped].map(([path, problems]) =>
    `- ${path || "/"}: ${problems.join("; ")}\n  지금 값: ${JSON.stringify(valueAt(current, path)) ?? "(없음)"}`);
  return `직전에 낸 출력에서 아래 칸이 검사를 통과하지 못했습니다. 각 칸의 고친 값만 fixes로 내세요. path는 아래 경로를 그대로 쓰고, value는 그 칸에 들어갈 값 전체입니다. 나머지 칸은 그대로 쓰므로 다시 내지 않습니다.\n${lines.join("\n")}`;
}
