import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// 웹이 이 패키지를 브라우저 번들에 넣는다. 번들러는 `node:*`를 polyfill로 바꾸는데,
// 그 polyfill에는 없는 API가 있다(예: crypto-browserify에는 randomUUID가 없다).
// 그래서 런타임 소스는 Node 내장 모듈 대신 서버와 브라우저 양쪽의 전역 API만 쓴다.
const SOURCE_ROOT = fileURLToPath(new URL(".", import.meta.url));
const NODE_IMPORT = /(?:from\s+|import\s*\(\s*|import\s+)["']node:[^"']+["']/;

function runtimeSources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "__fixtures__" ? [] : runtimeSources(path);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [path] : [];
  });
}

describe("runtime imports", () => {
  it("keeps Node built-in modules out of browser-bundled sources", () => {
    const offenders = runtimeSources(SOURCE_ROOT)
      .filter((path) => NODE_IMPORT.test(readFileSync(path, "utf8")))
      .map((path) => relative(SOURCE_ROOT, path));
    expect(offenders).toEqual([]);
  });
});
