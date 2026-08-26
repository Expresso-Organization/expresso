/*
 * 하드코딩 `font-size` → 타입 스케일 토큰.
 *
 * 화면들이 쓰던 37종의 제각각인 px를 13단계로 모으고 단위를 `rem`으로 옮깁니다.
 * 루트가 16px이라 브라우저 글꼴 크기 설정을 따라갑니다 — 전에는 루트에 13px이
 * 박혀 있고 화면은 절대 px이라 그 설정이 아무 일도 하지 않았습니다.
 *
 * 작은 쪽을 많이 올리고 큰 쪽은 거의 두는 **압축** 스케일입니다. 제목까지 같은
 * 비율로 키우면 화면 밀도가 무너집니다.
 *
 *   node scripts/migrate-type-scale.mjs [--write]
 */

import { readFileSync, writeFileSync, globSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const CSS_ROOT = join(ROOT, "services/web/src");

/** 현재 px → 스케일 토큰. 스펙 §3.1의 표와 같아야 합니다. */
const SCALE = [
  [9.5, "--ex-text-3xs"], //  6 · 6.5 · 7.5 · 8 · 8.5 · 9 · 9.5  → 11px
  [10.5, "--ex-text-2xs"], // 10 · 10.5                          → 12px
  [11.5, "--ex-text-xs"], //  11 · 11.5                          → 13px
  [12.5, "--ex-text-sm"], //  12 · 12.5                          → 14px
  [13.5, "--ex-text-md"], //  13 · 13.5                          → 15px
  [15.5, "--ex-text-lg"], //  14 · 14.5 · 15 · 15.5              → 16px
  [18, "--ex-text-xl"], //    16 · 17 · 18                       → 18px
  [21, "--ex-text-2xl"], //   19 · 21                            → 20px
  [24, "--ex-text-3xl"], //   22 · 23 · 24                       → 24px
  [30, "--ex-text-4xl"], //   26 · 27 · 28 · 30                  → 30px
  [36, "--ex-text-display-sm"], // 34                            → 36px
  [44, "--ex-text-display-md"], // 40 · 44                       → 44px
  [66, "--ex-text-display-lg"], // 66                            → 66px
];

function tokenFor(px) {
  for (const [ceiling, token] of SCALE) if (px <= ceiling) return token;
  return null;
}

const files = globSync("**/*.{module.css,css}", { cwd: CSS_ROOT })
  .filter((f) => !/^styles.(tokens|global)[.]/.test(f))
  .map((f) => join(CSS_ROOT, f));

const skipped = [];
let replaced = 0;
let changedFiles = 0;

for (const file of files) {
  const original = readFileSync(file, "utf8");
  let count = 0;

  const out = original.replace(
    /(font-size\s*:\s*)([0-9]*\.?[0-9]+)px/g,
    (whole, head, value) => {
      const token = tokenFor(Number(value));
      if (!token) {
        skipped.push({ file, value });
        return whole;
      }
      count += 1;
      return `${head}var(${token})`;
    },
  );

  if (out !== original) {
    replaced += count;
    changedFiles += 1;
    if (process.argv.includes("--write")) writeFileSync(file, out);
  }
}

const dry = process.argv.includes("--write") ? "" : " (미리보기 — --write 필요)";
console.log(`파일 ${changedFiles}개 · font-size ${replaced}자리 → 스케일 토큰${dry}`);

if (skipped.length > 0) {
  console.log(`\n스케일 밖의 값 ${skipped.length}곳:`);
  for (const row of skipped) {
    console.log(`  ${row.file.replace(CSS_ROOT, "").replace(/\\/g, "/")}  ${row.value}px`);
  }
}
