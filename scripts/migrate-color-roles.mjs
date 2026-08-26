/*
 * 팔레트 토큰 → 역할 토큰 일괄 변환.
 *
 * 화면 CSS가 `--ex-white` 같은 **값 서술 이름**을 쓰면 다크에서 이름이
 * 거짓말을 합니다. 역할 이름(`--ex-bg`)으로 옮기고 테마는 토큰 층에서만
 * 갈립니다.
 *
 * 대부분은 1:1입니다. 쓰임이 둘 이상인 토큰(`--ex-white` · `--ex-ink-900` ·
 * `--ex-espresso` · `--ex-line-200`)은 **그 값을 받는 속성**으로 갈립니다 —
 * `color:`인지 `background:`인지 `border:`인지.
 *
 * 못 가른 자리는 고치지 않고 리포트로 남깁니다.
 *
 *   node scripts/migrate-color-roles.mjs [--write]
 */

import { readFileSync, writeFileSync } from "node:fs";
import { globSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const CSS_ROOT = join(ROOT, "services/web/src");

/** 쓰임이 하나뿐인 토큰 — 속성과 무관하게 옮긴다. */
const DIRECT = {
  "--ex-slate-700": "--ex-fg-body",
  "--ex-slate-500": "--ex-fg-muted",
  "--ex-slate-400": "--ex-fg-subtle",
  "--ex-slate-300": "--ex-fg-faint",
  "--ex-line-inner": "--ex-border-inner",
  "--ex-hairline": "--ex-border-hair",
  "--ex-border-strong": "--ex-border-firm",
  "--ex-border-quiet": "--ex-border-soft",
  "--ex-chrome-border": "--ex-border-chrome",
  "--ex-chrome-50": "--ex-bg-chrome",
  "--ex-surface-50": "--ex-bg-sunken",
  "--ex-surface-100": "--ex-bg-muted",
  "--ex-tint-50": "--ex-bg-tint",
  "--ex-tint-100": "--ex-bg-tint-strong",
  "--ex-row-hover": "--ex-bg-hover",
  "--ex-table-header": "--ex-bg-header",
  "--ex-track": "--ex-bg-track",
  "--ex-canvas": "--ex-bg-canvas",
  "--ex-form-surface": "--ex-bg-form",
  "--ex-on-dark-body": "--ex-fg-on-inverse-body",
  "--ex-on-dark-muted": "--ex-fg-on-inverse-muted",
  "--ex-bean-50": "--ex-accent-surface",
  "--ex-bean-100": "--ex-accent-surface-hover",
  "--ex-bean-ink": "--ex-accent-ink",
  "--ex-crema": "--ex-accent-soft",
  "--ex-espresso-hover": "--ex-accent-hover",
  "--ex-espresso-text": "--ex-accent-text",
  "--ex-success": "--ex-status-success",
  "--ex-success-text": "--ex-status-success-text",
  "--ex-success-surface": "--ex-status-success-surface",
  "--ex-warning-text": "--ex-status-warning-text",
  "--ex-warning-surface": "--ex-status-warning-surface",
  "--ex-danger": "--ex-status-danger",
  "--ex-danger-text": "--ex-status-danger-text",
  "--ex-danger-surface": "--ex-status-danger-surface",
  "--ex-danger-surface-deep": "--ex-status-danger-surface-deep",
};

/**
 * 쓰임이 둘 이상인 토큰 — 속성 갈래로 고른다.
 *
 * `--ex-white`의 `color`가 `on-accent`인 이유: 흰 글자가 얹히는 지면은 대개
 * 에스프레소나 상태색이고, 그 지면들은 다크에서도 중간 톤이라 흰 글자가
 * 그대로 맞습니다. 잉크 지면(다크에서 밝아짐) 위의 흰 글자만 `on-inverse`인데,
 * 그건 같은 블록에 배경이 함께 적혀 있을 때만 확신할 수 있어 아래에서 따로
 * 봅니다.
 */
const BY_PROPERTY = {
  "--ex-white": {
    color: "--ex-fg-on-accent",
    background: "--ex-bg",
    border: "--ex-bg",
  },
  "--ex-ink-900": {
    color: "--ex-fg",
    background: "--ex-bg-inverse",
    border: "--ex-fg",
  },
  "--ex-ink-900-hover": {
    color: "--ex-fg-strong",
    background: "--ex-bg-inverse-hover",
    border: "--ex-fg-strong",
  },
  "--ex-espresso": {
    color: "--ex-accent-text",
    background: "--ex-accent",
    border: "--ex-accent",
  },
  "--ex-line-200": {
    color: "--ex-fg-faint",
    background: "--ex-border",
    border: "--ex-border",
  },
};

/** 속성 이름 → 갈래. */
function propertyClass(name) {
  if (name.startsWith("--")) return null; // 지역 변수 — 무엇에 쓰일지 모른다
  if (name === "color" || name.endsWith("-text-fill-color") || name === "caret-color")
    return "color";
  if (name === "fill" || name === "stroke") return "color";
  if (name.startsWith("background")) return "background";
  if (name.startsWith("border") || name.startsWith("outline") || name === "column-rule")
    return "border";
  if (name === "accent-color") return "background";
  if (name.endsWith("shadow")) return null; // 그림자는 토큰 층에서 테마화한다
  return null;
}

/**
 * TSX의 인라인 스타일에는 선언 구분자가 없다. `color="var(--ex-x)"` ·
 * `style={{ background: "var(--ex-x)" }}` 처럼 앞쪽에 놓인 낱말로 갈래를 본다.
 */
function propertyClassJsx(text, index) {
  const head = text.slice(Math.max(0, index - 60), index);
  const word = /([A-Za-z-]+)\s*[:=]\s*(?:\{?\s*)?["'`]?[^"'`]*$/.exec(head);
  if (!word) return null;
  const name = word[1]
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .toLowerCase();
  return propertyClass(name);
}

/** `var(--ex-x)` 위치에서 뒤로 훑어 이 값을 받는 속성 이름을 찾는다. */
function propertyAt(text, index) {
  let start = index;
  while (start > 0 && !"{};".includes(text[start - 1])) start -= 1;
  const head = text.slice(start, index);
  const colon = head.indexOf(":");
  if (colon < 0) return null;
  return head.slice(0, colon).trim();
}

/** 같은 선언 블록에 어두운 지면이 함께 적혀 있는가. */
function blockHasInverseBackground(text, index) {
  const open = text.lastIndexOf("{", index);
  if (open < 0) return false;
  const close = text.indexOf("}", index);
  const block = text.slice(open, close < 0 ? text.length : close);
  return /background[^;]*var\(--ex-ink-900\)/.test(block);
}

const files = globSync("**/*.{module.css,css,tsx}", { cwd: CSS_ROOT })
  // 토큰 층과 전역 리셋은 역할 이름을 **정의하는** 자리라 건드리지 않는다.
  .filter((f) => !/^styles.(tokens|global)[.]/.test(f))
  .map((f) => join(CSS_ROOT, f));

const report = [];
let changed = 0;
let replaced = 0;

for (const file of files) {
  const original = readFileSync(file, "utf8");
  let out = "";
  let cursor = 0;
  const pattern = /var\(\s*(--ex-[\w-]+)\s*([,)])/g;
  let match;

  while ((match = pattern.exec(original)) !== null) {
    const [whole, token, tail] = match;
    const at = match.index;
    let next = null;

    if (DIRECT[token]) {
      next = DIRECT[token];
    } else if (BY_PROPERTY[token]) {
      const jsx = file.endsWith(".tsx");
      const property = jsx ? null : propertyAt(original, at);
      const klass = jsx
        ? propertyClassJsx(original, at)
        : property
          ? propertyClass(property)
          : null;
      if (!klass) {
        report.push({ file, token, property: property ?? "(불명)", why: "속성으로 못 가름" });
      } else {
        next = BY_PROPERTY[token][klass];
        // 흰 글자가 잉크 지면 위에 있으면 다크에서 함께 뒤집혀야 한다.
        if (token === "--ex-white" && klass === "color" && blockHasInverseBackground(original, at)) {
          next = "--ex-fg-on-inverse";
        }
      }
    }

    out += original.slice(cursor, at);
    out += next ? `var(${next}${tail}` : whole;
    cursor = at + whole.length;
    if (next) replaced += 1;
  }

  out += original.slice(cursor);
  if (out !== original) {
    changed += 1;
    if (process.argv.includes("--write")) writeFileSync(file, out);
  }
}

console.log(`파일 ${changed}개 · 토큰 ${replaced}자리 변환${process.argv.includes("--write") ? "" : " (미리보기 — --write 필요)"}`);

if (report.length > 0) {
  console.log(`\n손으로 봐야 하는 자리 ${report.length}곳:`);
  for (const row of report) {
    console.log(`  ${row.file.replace(CSS_ROOT, "").replace(/\\/g, "/")}  ${row.token}  ${row.property}  — ${row.why}`);
  }
}
