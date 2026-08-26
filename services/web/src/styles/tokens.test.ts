import { readFileSync, globSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * 토큰 규칙을 지키는 그물.
 *
 * 26개 라우트 × 3개 폭 × 2개 테마 = 156가지 화면 상태입니다. 사람 눈으로는
 * 지킬 수 없어서 규칙 쪽을 검사합니다. 값 하나가 토큰 밖으로 새면 그 자리는
 * 다크에서 안 뒤집히거나 브라우저 글꼴 설정을 안 따라갑니다 — 화면을 열어야만
 * 보이는 고장입니다.
 */

const SRC = join(import.meta.dirname, "..");
const TOKENS = join(SRC, "styles", "tokens.css");

function label(path: string) {
  return path.slice(SRC.length + 1).replace(/\\/g, "/");
}

const cssFiles = globSync("**/*.module.css", { cwd: SRC }).map((f) => join(SRC, f));

/*
 * 공개 포트폴리오(`/site/[slug]`)는 계통이 다릅니다 — Tailwind 유틸리티와
 * 모델이 짜는 지면이고, 반응형은 앱 화면과 따로 손봅니다. 그때까지 중단점
 * 검사에서 뺍니다. 색과 글자 크기 규칙은 그대로 적용됩니다.
 */
const appCssFiles = cssFiles.filter((f) => !label(f).startsWith("app/site/"));
const tsxFiles = globSync("**/*.tsx", { cwd: SRC }).map((f) => join(SRC, f));

function read(path: string) {
  return readFileSync(path, "utf8");
}

/** 주석 안의 값은 설명이지 규칙이 아니다. */
function stripComments(css: string) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("글자 크기", () => {
  it("모듈 CSS에 리터럴 px가 없다 — 스케일 토큰만 쓴다", () => {
    const found: string[] = [];
    for (const file of cssFiles) {
      for (const match of stripComments(read(file)).matchAll(
        /font-size\s*:\s*([0-9.]+)px/g,
      )) {
        found.push(`${label(file)}: font-size: ${match[1]}px`);
      }
    }
    expect(found).toEqual([]);
  });
});

/*
 * 테마마다 값이 달라지는 팔레트 토큰.
 *
 * 화면이 이걸 직접 쓰면 다크에서 이름이 거짓말을 하거나(`--ex-white`가 검정)
 * 뒤집혀야 할 자리가 안 뒤집힌다. 역할 토큰만 쓴다.
 */
const PALETTE_ONLY = [
  "ink-900", "ink-900-hover", "slate-700", "slate-500", "slate-400", "slate-300",
  "line-200", "line-inner", "tint-50", "tint-100", "surface-100", "surface-50",
  "chrome-50", "chrome-border", "white", "hairline", "table-header", "row-hover",
  "track", "border-strong", "border-quiet", "canvas", "form-surface",
  "on-dark-body", "on-dark-muted", "espresso", "espresso-hover", "espresso-text",
  "crema", "bean-50", "bean-100", "bean-ink", "success", "success-text",
  "success-surface", "warning-text", "warning-surface", "danger", "danger-text",
  "danger-surface", "danger-surface-deep",
];

describe("색", () => {
  it("화면이 팔레트 토큰을 직접 쓰지 않는다 — 역할 토큰만 쓴다", () => {
    const pattern = new RegExp(`var\\(\\s*--ex-(${PALETTE_ONLY.join("|")})\\s*[,)]`, "g");
    const found: string[] = [];
    for (const file of [...cssFiles, ...tsxFiles]) {
      for (const match of read(file).matchAll(pattern)) {
        found.push(`${label(file)}: --ex-${match[1]}`);
      }
    }
    expect(found).toEqual([]);
  });

  /*
   * 그대로 두기로 한 색과 그 이유.
   *
   * 앱 테마를 타면 안 되는 것들이다 — 포트폴리오 지면과 그 색 견본은 방문자가
   * 볼 화면을 그대로 보여주는 자리이고, 에디터의 파랑은 어두운 지면에서도
   * 읽히며, 마스크의 흑백은 색이 아니라 알파다.
   */
  const KEEP = new Set([
    // 에디터 선택 · 대화 파랑
    "#4562ce", "#354da8", "#2a48b8", "#eef1fc", "#eef2fc", "#e5eafb", "#dfe5f9", "#dbe2f8",
    // 포트폴리오 지면과 색 견본
    "#ff6f0f", "#fff0e8", "#fff1e4", "#f5f2ec", "#efeae0", "#d8d0bf", "#e2dacb",
    "#5c574c", "#6b6558", "#8a8377", "#a39b8c", "#3e382d", "#8a94a6", "#9a4030",
    // 늘 어두운 로그인 패널의 그러데이션
    "#16223a", "#241c21", "#3a2a22", "#a9793f",
    // 마스크의 알파
    "#000", "#fff",
  ]);

  it("모듈 CSS에 허용 목록 밖의 hex가 없다", () => {
    const found: string[] = [];
    for (const file of cssFiles) {
      for (const match of stripComments(read(file)).matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
        if (!KEEP.has(match[0].toLowerCase())) found.push(`${label(file)}: ${match[0]}`);
      }
    }
    expect(found).toEqual([]);
  });
});

/*
 * 중단점 — `tokens.css`의 `--ex-bp-*`와 같은 경계만 쓴다.
 *
 * `min-width`는 경계 그대로, `max-width`는 그 바로 아래 값이다. 새 숫자가
 * 끼어들면 화면마다 접히는 자리가 달라진다.
 */
const BREAKPOINTS = [480, 768, 1024, 1280];
const ALLOWED_WIDTHS = new Set([
  ...BREAKPOINTS,
  ...BREAKPOINTS.map((value) => value - 1),
]);

describe("반응형", () => {
  it("미디어 쿼리의 폭이 중단점 표 안에 있다", () => {
    const found: string[] = [];
    for (const file of appCssFiles) {
      for (const match of read(file).matchAll(/\((?:min|max)-width\s*:\s*(\d+)px\)/g)) {
        if (!ALLOWED_WIDTHS.has(Number(match[1]))) {
          found.push(`${label(file)}: ${match[0]}`);
        }
      }
    }
    expect(found).toEqual([]);
  });

  it("데스크톱 하한이 없다 — 좁은 화면에서 가로 스크롤이 나던 원인", () => {
    const found: string[] = [];
    for (const file of appCssFiles) {
      /*
       * 선언으로서의 `min-width`만 본다. `@media (min-width: 1024px)`의
       * 괄호 안은 하한이 아니라 **위로 넓어질 때** 적용할 규칙의 조건이다.
       */
      for (const match of stripComments(read(file)).matchAll(
        /(^|[{;])\s*min-width\s*:\s*(\d+)px/gm,
      )) {
        if (Number(match[2]) >= 1024) {
          found.push(`${label(file)}: min-width: ${match[2]}px`);
        }
      }
    }
    expect(found).toEqual([]);
  });

  it("중단점 토큰이 표와 같다", () => {
    const css = read(TOKENS);
    for (const [name, value] of [
      ["sm", 480],
      ["md", 768],
      ["lg", 1024],
      ["xl", 1280],
    ] as const) {
      expect(css).toContain(`--ex-bp-${name}: ${value}px`);
    }
  });
});

/**
 * 어두운 지면의 값은 두 곳에 적혀 있다 — OS 설정을 따르는 자리와 손으로 고른
 * 자리. 둘이 갈리면 시스템 다크와 수동 다크가 다르게 보인다.
 */
function declarationsIn(css: string, from: number): Record<string, string> {
  const open = css.indexOf("{", from);
  let depth = 0;
  let end = open;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const body = stripComments(css.slice(open + 1, end));
  const out: Record<string, string> = {};
  for (const line of body.split(";")) {
    const [name, ...rest] = line.split(":");
    if (!name || rest.length === 0) continue;
    const key = name.trim();
    if (!key.startsWith("--") && key !== "color-scheme") continue;
    out[key] = rest.join(":").trim();
  }
  return out;
}

describe("다크 팔레트", () => {
  it("OS 설정을 따르는 값과 손으로 고른 값이 같다", () => {
    const css = read(TOKENS);
    const media = declarationsIn(css, css.indexOf(':root:not([data-theme="light"])'));
    const manual = declarationsIn(css, css.indexOf('[data-theme="dark"] {'));
    expect(Object.keys(media).length).toBeGreaterThan(30);
    expect(manual).toEqual(media);
  });

  it("역할 토큰이 두 테마에 모두 있다", () => {
    const css = read(TOKENS);
    const light = declarationsIn(css, css.indexOf('[data-theme="light"] {'));
    const dark = declarationsIn(css, css.indexOf('[data-theme="dark"] {'));
    const missing = Object.keys(light).filter((key) => !(key in dark));
    expect(missing).toEqual([]);
  });
});
