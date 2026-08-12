import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { isCompiledClassName } from "@expresso/contracts";
import { describe, expect, it } from "vitest";

/**
 * 렌더러가 쓰는 클래스도 어휘 안에 있어야 한다.
 *
 * `portfolio-utilities.css`는 **허용 목록으로만** 컴파일된다. 모델이 낸 클래스는
 * `checkClassName`이 걸러 주지만, **우리가 컴포넌트에 직접 적은 클래스는 아무도
 * 확인하지 않는다** — 어휘에 없는 것을 적으면 조용히 안 그려지고, 그건 지난번에
 * 우리를 물었던 바로 그 실패다(`w-24`가 통과한 뒤 사라지던 것).
 *
 * 그래서 여기서 소스를 읽어 대조한다. 어휘를 넓히거나 클래스를 고치면 된다.
 */

const HERE = dirname(fileURLToPath(import.meta.url));

/** `className="…"`과 `className={\`…\`}`에서 고정 토큰만 뽑는다. */
function classTokensIn(source: string): string[] {
  const tokens: string[] = [];
  for (const match of source.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
    const literal = match[1] ?? match[2] ?? "";
    // 템플릿 안의 `${…}`는 실행 시점에 정해진다 — 그 자리는 건너뛴다.
    for (const piece of literal.split(/\$\{[^}]*\}/)) {
      tokens.push(...piece.split(/\s+/).filter(Boolean));
    }
  }
  return tokens;
}

describe("지면 컴포넌트의 클래스", () => {
  it("전부 컴파일되는 어휘 안에 있다", () => {
    const files = readdirSync(HERE).filter((name) => name.endsWith(".tsx"));
    expect(files.length).toBeGreaterThan(0);

    const unknown = new Map<string, string[]>();
    for (const file of files) {
      const source = readFileSync(join(HERE, file), "utf8");
      for (const token of new Set(classTokensIn(source))) {
        // 렌더러의 표식은 유틸리티가 아니다 — 섹션 간격 기본 규칙이 여기 걸린다.
        if (token === "pf-page") continue;
        if (isCompiledClassName(token)) continue;
        unknown.set(token, [...(unknown.get(token) ?? []), file]);
      }
    }
    expect(Object.fromEntries(unknown)).toEqual({});
  });
});
