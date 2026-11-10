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

/*
 * 검색 칸은 화면마다 따로 그려진다 — 홈 · 공고 탐색 · 공고로 시작하기의 큰
 * 검색바부터 커리어 표 툴바 · 에이전트 채팅 · 지표 라이브러리의 작은 칸까지.
 * 곡률이 칸마다 6 · 8 · 9 · 10 · 11px로 갈려 같은 기능이 다른 물건처럼 보였다.
 * 검색 칸은 모두 pill이고 그 값은 `--ex-radius-pill` 하나에서 온다.
 */
describe("검색 칸 곡률", () => {
  it("pill 토큰이 있다", () => {
    expect(read(TOKENS)).toContain("--ex-radius-pill: 999px");
  });

  it("이름에 search가 든 규칙의 곡률은 pill 토큰이다", () => {
    const found: string[] = [];
    for (const file of cssFiles) {
      for (const [, selectors = "", body = ""] of stripComments(read(file)).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const radius = body.match(/border-radius\s*:\s*([^;]+)/)?.[1]?.trim();
        if (!radius || radius === "var(--ex-radius-pill)") continue;
        for (const selector of selectors.split(",")) {
          // 마지막 복합 선택자만 본다. `.searchField button`은 칸이 아니라 칸 안의 버튼이다.
          const last = selector.trim().split(/[\s>+~]+/).pop() ?? "";
          if (/\.[\w-]*search/i.test(last)) found.push(`${label(file)}: ${selector.trim()} → ${radius}`);
        }
      }
    }
    expect(found).toEqual([]);
  });
});

/*
 * 역할마다 곡률이 하나다 — 버튼 · 입력 칸 8px, 칩 · 배지 pill, 카드 14px(2026-11-10 결정).
 * 예전에는 같은 주 버튼이 7 · 8 · 9 · 10px · pill, 같은 카드가 10~16px로 화면마다 달랐다.
 *
 * 역할은 클래스 이름의 단어로 정한다(`statusPill` → pill, `creditCard` → card).
 * 이름만으로는 역할이 틀리는 자리는 아래 예외에 이유와 함께 둔다.
 * 랜딩 · 공개 포트폴리오는 별도 지면이라 보지 않는다.
 */
const RADIUS = {
  pill: "var(--ex-radius-pill)",
  control: "var(--ex-radius-control)",
  card: "var(--ex-radius-card)",
} as const;

const RADIUS_ROLE_EXCEPTIONS: Record<string, string> = {
  "app/(app)/brew/[brewId]/counter/page.module.css .recordChip": "칩이 아니라 카드처럼 쓰는 기록 칸",
  "app/(app)/jobs/[jobId]/page.module.css .swatchChip": "색 견본 — 모양이 곧 내용",
  "features/career-editor/views/views.module.css .projectSelect": "칩 모양으로 그린 선택 칸 — 칩 곡률",
  "features/agent-chat/AgentChat.module.css .attachButton": "참조 칩 줄의 첨부 자리 — 옆 참조 칩과 같은 pill",
  "features/career-editor/views/views.module.css .rowAddButton": "표 행에 올렸을 때만 보이는 24px 손잡이(.rowDragHandle과 한 규칙)",
  "app/(app)/edit/[portfolioId]/page.module.css .railButton": "편집기 레일 탐색 항목",
  "app/(app)/edit/[portfolioId]/page.module.css .toolButton": "떠 있는 도구 막대 항목",
  "app/(app)/edit/[portfolioId]/page.module.css .viewportButton": "세그먼트 항목(데스크톱 · 모바일)",
  "app/(app)/edit/[portfolioId]/page.module.css .alignButton": "세그먼트 항목(정렬)",
  "app/(app)/edit/[portfolioId]/page.module.css .sectionMoveButton": "13px 높이 화살표 — 8px이면 원이 된다",
  "app/(app)/brew/[brewId]/design/DesignCatalog.module.css .cardCheck": "카드 위 선택 표시 원",
};

function radiusRole(className: string): keyof typeof RADIUS | "search" | null {
  const words = className.split(/(?=[A-Z])|[-_]/).map((word) => word.toLowerCase());
  if (words.includes("search")) return "search";
  // 팝오버 · 메뉴와 그 항목은 아직 곡률 단계가 없다.
  if (words.some((word) => ["pop", "popover", "menu", "option", "item"].includes(word))) return null;
  if (words.some((word) => ["chip", "badge", "tag", "pill"].includes(word))) return "pill";
  if (words.includes("card")) return "card";
  if (words.some((word) => ["button", "btn", "cta"].includes(word))) return "control";
  if (words.some((word) => ["input", "select", "textarea", "field", "composer"].includes(word))) return "control";
  return null;
}

describe("역할별 곡률", () => {
  it("곡률 토큰이 결정한 값이다", () => {
    const css = read(TOKENS);
    expect(css).toContain("--ex-radius-control: 8px");
    expect(css).toContain("--ex-radius-card: 14px");
  });

  it("칩 · 배지 · 카드 · 버튼 · 입력 칸 이름의 규칙은 역할 토큰을 쓴다", () => {
    const found: string[] = [];
    const appFiles = cssFiles.filter((f) => !/^app\/(\(landing\)|site)\//.test(label(f)));
    for (const file of appFiles) {
      for (const [, selectors = "", body = ""] of stripComments(read(file)).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const radius = body.match(/border-radius\s*:\s*([^;!]+)/)?.[1]?.trim();
        if (!radius) continue;
        for (const selector of selectors.split(",")) {
          const last = selector.trim().split(/[\s>+~]+/).pop() ?? "";
          // `:not(.iconButton)` 안의 클래스는 이 요소가 아니다.
          const classes = [...last.replace(/:not\([^)]*\)/g, "").matchAll(/\.([\w-]+)/g)].map((match) => match[1] ?? "");
          const roles = new Set(classes.map(radiusRole).filter((role) => role !== null));
          if (roles.size !== 1) continue;
          const [role] = roles;
          if (!role || role === "search") continue;
          const key = `${label(file)} ${selector.trim()}`;
          if (key in RADIUS_ROLE_EXCEPTIONS) continue;
          // 한쪽 모서리만 둥근 값은 0이 아닌 칸이 모두 그 역할의 토큰이면 된다. 원형(50%)은 버튼과 칩에서 허용한다.
          const parts = radius.split(/\s+(?![^(]*\))/).filter((part) => part !== "0");
          const allowed = role === "card" ? [RADIUS.card] : [RADIUS[role], "50%"];
          if (!parts.every((part) => allowed.includes(part))) found.push(`${key} → ${radius} (${role})`);
        }
      }
    }
    expect(found).toEqual([]);
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
