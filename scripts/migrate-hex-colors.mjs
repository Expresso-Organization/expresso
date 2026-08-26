/*
 * 앱 크롬에 남은 하드코딩 hex → 역할 토큰.
 *
 * 전부 옮기지 않습니다. 세 갈래는 **앱 테마를 타면 안 됩니다.**
 *
 * - 포트폴리오 미리보기 지면과 그 색 견본 — 방문자가 볼 지면을 그대로
 *   보여주는 자리라, 앱이 어두워졌다고 함께 어두워지면 거짓말이 됩니다.
 * - 에디터의 선택·대화 파랑 — 어두운 지면에서도 그대로 읽힙니다.
 * - 마스크·그러데이션의 `#000`/`#fff` — 색이 아니라 알파 채널입니다.
 *
 * 남기는 자리에는 이유를 주석으로 답니다. 정적 가드가 그 주석을 근거로
 * 통과시킵니다.
 *
 *   node scripts/migrate-hex-colors.mjs [--write]
 */

import { readFileSync, writeFileSync, globSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const CSS_ROOT = join(ROOT, "services/web/src");

/** hex → 역할 토큰. 속성 갈래가 필요한 것은 객체로 준다. */
const MAP = {
  // 무채색 지면
  "#fff": { background: "--ex-bg", color: "--ex-fg-on-accent", border: "--ex-bg" },
  "#ffffff": { background: "--ex-bg", color: "--ex-fg-on-accent", border: "--ex-bg" },
  "#f2f5f9": { background: "--ex-bg-tint", border: "--ex-border-hair" },
  "#f4f6fa": "--ex-bg-sunken",
  "#f5f8fc": "--ex-bg-sunken",
  "#f4f7fb": { background: "--ex-bg-sunken", border: "--ex-border-hair" },
  "#f2f5fa": "--ex-bg-sunken",
  "#ebeff5": "--ex-bg-muted",
  "#e9edf4": "--ex-bg-muted",
  "#eef1f6": "--ex-border-inner",

  // 무채색 선
  "#e6ebf4": "--ex-border",
  "#edf1f8": "--ex-border",
  "#d7deea": "--ex-border-firm",

  // 무채색 글자
  "#a8b4c8": "--ex-fg-subtle",
  "#8fa0bf": "--ex-fg-subtle",
  "#7c8aa0": "--ex-fg-muted",
  "#6b7a93": "--ex-fg-muted",

  // 상태
  "#e8f5ec": "--ex-status-success-surface",
  "#287a42": "--ex-status-success-text",
  "#fbf3df": "--ex-status-warning-surface",
  "#fff2d8": "--ex-status-warning-surface",
  "#8b5b0a": "--ex-status-warning-text",
  "#fceeea": "--ex-status-danger-surface-deep",

  // 시그니처 계열 — bean 지면과 그 위의 글자 · 선
  "#fdf8f5": "--ex-accent-surface",
  "#fdf6f1": "--ex-accent-surface",
  "#dcc5b8": "--ex-accent-surface-hover",
  "#d8c3b8": "--ex-accent-surface-hover",
  "#e8d6cd": "--ex-accent-surface-hover",
  "#f1e7e1": "--ex-accent-surface-hover",
  "#f0e2d2": "--ex-accent-surface-hover",
  "#a88170": "--ex-accent-text",
  "#a34823": "--ex-accent-text",
  "#4a2e22": "--ex-accent-ink",
};

/**
 * 그대로 두는 색과 그 이유. 정적 가드의 허용 목록과 같은 표입니다.
 */
const KEEP = {
  "#4562ce": "에디터 선택·대화 파랑 — 어두운 지면에서도 그대로 읽힌다",
  "#354da8": "에디터 선택·대화 파랑 — 어두운 지면에서도 그대로 읽힌다",
  "#2a48b8": "에디터 선택·대화 파랑 — 어두운 지면에서도 그대로 읽힌다",
  "#eef1fc": "에디터 선택·대화 파랑의 지면",
  "#eef2fc": "에디터 선택·대화 파랑의 지면",
  "#e5eafb": "에디터 선택·대화 파랑의 지면",
  "#dfe5f9": "에디터 선택·대화 파랑의 지면",
  "#dbe2f8": "에디터 선택·대화 파랑의 지면",
  "#ff6f0f": "포트폴리오 지면의 강조색 견본 — 앱 테마를 타지 않는다",
  "#fff0e8": "포트폴리오 지면의 강조색 견본 — 앱 테마를 타지 않는다",
  "#fff1e4": "포트폴리오 지면의 강조색 견본 — 앱 테마를 타지 않는다",
  "#f5f2ec": "포트폴리오 미리보기 지면 — 앱 테마를 타지 않는다",
  "#efeae0": "포트폴리오 미리보기 지면 — 앱 테마를 타지 않는다",
  "#d8d0bf": "포트폴리오 미리보기 지면 — 앱 테마를 타지 않는다",
  "#e2dacb": "포트폴리오 미리보기 지면 — 앱 테마를 타지 않는다",
  "#5c574c": "포트폴리오 미리보기 지면 — 앱 테마를 타지 않는다",
  "#6b6558": "포트폴리오 미리보기 지면 — 앱 테마를 타지 않는다",
  "#8a8377": "포트폴리오 미리보기 지면 — 앱 테마를 타지 않는다",
  "#a39b8c": "포트폴리오 미리보기 지면 — 앱 테마를 타지 않는다",
  "#3e382d": "포트폴리오 미리보기 지면 — 앱 테마를 타지 않는다",
  "#16223a": "로그인 좌측 패널의 그러데이션 — 늘 어두운 지면",
  "#241c21": "로그인 좌측 패널의 그러데이션 — 늘 어두운 지면",
  "#3a2a22": "로그인 좌측 패널의 그러데이션 — 늘 어두운 지면",
  "#000": "마스크의 알파 — 색이 아니다",
};

function propertyClass(name) {
  if (!name || name.startsWith("--")) return null;
  if (name === "color" || name === "fill" || name === "stroke") return "color";
  if (name.startsWith("background")) return "background";
  if (name.startsWith("border") || name.startsWith("outline")) return "border";
  return null;
}

function propertyAt(text, index) {
  let start = index;
  while (start > 0 && !"{};".includes(text[start - 1])) start -= 1;
  const head = text.slice(start, index);
  const colon = head.indexOf(":");
  return colon < 0 ? null : head.slice(0, colon).trim();
}

/** 주석 구간인가 — 주석 안의 hex는 설명이지 값이 아니다. */
function insideComment(text, index) {
  const open = text.lastIndexOf("/*", index);
  if (open < 0) return false;
  return text.lastIndexOf("*/", index) < open;
}

const files = globSync("**/*.module.css", { cwd: CSS_ROOT }).map((f) => join(CSS_ROOT, f));
const skipped = [];
let replaced = 0;
let changedFiles = 0;

for (const file of files) {
  const original = readFileSync(file, "utf8");
  let out = "";
  let cursor = 0;
  const pattern = /#[0-9a-fA-F]{3,8}\b/g;
  let match;

  while ((match = pattern.exec(original)) !== null) {
    const at = match.index;
    const hex = match[0].toLowerCase();
    let next = null;

    if (!insideComment(original, at)) {
      const entry = MAP[hex];
      if (typeof entry === "string") {
        next = entry;
      } else if (entry) {
        const klass = propertyClass(propertyAt(original, at));
        next = klass ? (entry[klass] ?? null) : null;
      }
      if (!next && !KEEP[hex]) {
        skipped.push({ file, hex, property: propertyAt(original, at) ?? "(불명)" });
      }
    }

    out += original.slice(cursor, at);
    out += next ? `var(${next})` : match[0];
    cursor = at + match[0].length;
    if (next) replaced += 1;
  }

  out += original.slice(cursor);
  if (out !== original) {
    changedFiles += 1;
    if (process.argv.includes("--write")) writeFileSync(file, out);
  }
}

const dry = process.argv.includes("--write") ? "" : " (미리보기 — --write 필요)";
console.log(`파일 ${changedFiles}개 · hex ${replaced}자리 → 역할 토큰${dry}`);

if (skipped.length > 0) {
  console.log(`\n표에도 허용 목록에도 없는 색 ${skipped.length}곳:`);
  for (const row of skipped) {
    console.log(`  ${row.file.replace(CSS_ROOT, "").replace(/\\/g, "/")}  ${row.hex}  ${row.property}`);
  }
}
