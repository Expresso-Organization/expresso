/**
 * 지면 유틸리티 CSS를 어휘에서 만든다.
 *
 * 어휘의 소스는 `packages/contracts/src/layout-vocabulary.ts` 하나다. 이 스크립트는
 * 거기서 `@source inline(...)` 블록을 만들어 `portfolio-utilities.css`의 표시된
 * 구간에 써 넣고, **정말로 컴파일되는지 Tailwind를 돌려 확인한다.**
 *
 * 확인이 핵심이다. Tailwind는 해석하지 못하는 후보를 조용히 버린다 — 그러면
 * 어휘에는 있는데 CSS에는 없는 클래스가 생기고, 검증기가 통과시킨 지면이 또
 * 그려지지 않는다. 여기서 걸러 두면 그 일이 일어나지 않는다.
 *
 *   node scripts/build-portfolio-css.mjs           # 쓰고 확인
 *   node scripts/build-portfolio-css.mjs --check   # 어긋났으면 실패(CI)
 */
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WEB = resolve(ROOT, "services/web");
const CSS_PATH = resolve(WEB, "src/styles/portfolio-utilities.css");
const VOCAB_PATH = resolve(ROOT, "packages/contracts/src/layout-vocabulary.ts");

const BEGIN = "/* @generated:vocabulary-begin — scripts/build-portfolio-css.mjs */";
const END = "/* @generated:vocabulary-end */";

/** 계약 패키지를 빌드 없이 읽는다. Node가 타입을 걷어내고 그대로 실행한다. */
async function loadVocabulary() {
  return import(pathToFileURL(VOCAB_PATH).href);
}

const { PORTFOLIO_UTILITY_PATTERNS, expandPattern } = await loadVocabulary();
const candidates = [...new Set(PORTFOLIO_UTILITY_PATTERNS.flatMap(expandPattern))];

const block = [
  BEGIN,
  "/*",
  " * 이 구간은 생성됩니다. 손으로 고치지 마세요 —",
  " * 어휘는 packages/contracts/src/layout-vocabulary.ts 하나에서 나옵니다.",
  " */",
  ...PORTFOLIO_UTILITY_PATTERNS.map((pattern) => `@source inline(${JSON.stringify(pattern)});`),
  END,
].join("\n");

const current = readFileSync(CSS_PATH, "utf8");
const start = current.indexOf(BEGIN);
const finish = current.indexOf(END);
if (start === -1 || finish === -1) {
  throw new Error(`${CSS_PATH}에 ${BEGIN} / ${END} 표시가 없습니다`);
}
const next = `${current.slice(0, start)}${block}${current.slice(finish + END.length)}`;

const check = process.argv.includes("--check");
if (check && next !== current) {
  console.error("portfolio-utilities.css가 어휘와 어긋납니다. node scripts/build-portfolio-css.mjs를 돌리세요.");
  process.exit(1);
}
if (!check) writeFileSync(CSS_PATH, next);

// ── 정말로 컴파일되는지 확인한다 ────────────────────────────────────
const tailwindEntry = require.resolve("tailwindcss", { paths: [WEB] });
const tailwindRoot = dirname(dirname(tailwindEntry));
const { compile } = require(tailwindEntry);

const css = await compile(next, {
  base: dirname(CSS_PATH),
  loadStylesheet: async (id, base) => {
    const path = id.startsWith(".")
      ? resolve(base, id)
      : resolve(tailwindRoot, id.replace(/^tailwindcss\/?/, "") || "index.css");
    return { path, base: dirname(path), content: readFileSync(path, "utf8") };
  },
  loadModule: async () => { throw new Error("이 스타일시트는 JS 설정을 쓰지 않습니다"); },
  onDependency: () => {},
});
const out = css.build([]);

const escape = (value) => value.replaceAll(/[.:/[\]()!#]/g, "\\$&");
const missing = candidates.filter((candidate) => !out.includes(`.${escape(candidate)}`));

console.log(`패턴 ${PORTFOLIO_UTILITY_PATTERNS.length}개 → 클래스 ${candidates.length}개 · CSS ${(out.length / 1024).toFixed(0)}KB`);
if (missing.length > 0) {
  console.error(`\n컴파일되지 않는 클래스 ${missing.length}개 — 어휘에서 빼거나 표기를 고치세요:`);
  for (const item of missing) console.error(`  ${item}`);
  process.exit(1);
}
console.log("어휘의 모든 클래스가 CSS에 있습니다.");
