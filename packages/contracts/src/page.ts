import { z } from "zod";

import { TimestampSchema, UuidSchema } from "./common.js";
import { PAGE_KIT_CSS, pageKitVariables } from "./page-kit.js";

/**
 * 자유 생성 지면.
 *
 * 블록과 `LayoutSpec`으로 짜는 길과 달리, 여기서는 **모델이 마크업과 CSS를 직접
 * 쓴다.** 우리가 고른 어휘 안에서 노는 것이 아니라 CSS 전부를 쓴다.
 *
 * 대신 세 가지를 우리가 쥔다:
 *
 * 1. **소독.** 모델이 낸 것을 그대로 방문자에게 보내지 않는다. 근거에는 사용자가
 *    쓴 기록과 **바깥에서 긁어 온 공고문**이 섞여 있고, 모델은 그걸 성실히 옮긴다 —
 *    거기 스크립트가 있으면 지면에 실린다. 아래 허용 목록만 살아남는다.
 * 2. **폰트.** 바깥 스타일시트를 부르지 않는다. 껍데기가 미리 실어 둔 것만 쓴다.
 *    허용 목록을 여는 대신 **아는 목록을 준다** — 어휘를 다룰 때와 같은 판단이다.
 * 3. **조각으로 받는다.** 문서 통째가 아니라 `css`와 `html` 둘이다. `<head>`는
 *    우리가 쥐고 있어야 배포 페이지에 관제와 메타 태그를 붙일 수 있다.
 *
 * **이 파일의 목록이 소독기와 프롬프트 양쪽의 원본이다.** 둘이 갈라지면 모델이
 * 열심히 쓴 것이 조용히 지워지고, 아무도 왜인지 모른다.
 */

/**
 * 프롬프트를 고치면 올린다. 낡은 지면을 가려내는 값이다.
 *
 * 2 — 첫 판이 **슬라이드 덱처럼** 나왔다(섹션마다 전폭 배경 띠, 안쪽은 전부 같은
 * 폭의 가운데 한 칸). 옛 `LayoutSpec` 프롬프트의 세계관을 그대로 옮겨 온 탓이다.
 * 구조 지침을 다시 썼다 — 띠 금지 · 폭 변주 · 정보 축 둘 · 밀도 하한.
 *
 * 3 — 그 판에서 막대 그래프가 통째로 사라졌다. `<span>`에 `height`를 줬는데
 * `display`가 없어 inline 그대로였다. 규칙을 프롬프트에 넣고, 같은 모양을
 * 정적으로 잡는 검사(`platform/html/unstyled.ts`)를 재시도 고리에 걸었다.
 *
 * 4 — 2·3에서 지침을 90줄까지 늘렸는데, 아무 지침 없이 20줄짜리 브리프만 준
 * 대조군이 **더 나았다.** 좋은 지면이 뭔지 받아쓰게 하는 것이 모델이 디자인할
 * 여지를 뺏고 있었다. 브리프로 되돌리고, 대신 막고 있던 자유 하나를 풀었다 —
 * 서체 스타일시트를 직접 부를 수 있다.
 *
 * 5 — 실행마다 결과가 크게 흔들리는데 여러 장 뽑아 고르는 것은 비용이 든다.
 * 이 플랫폼의 기획은 원래 **뽑기 전에 스타일 문법을 고르는 것**이었고(03),
 * 그 값이 `template.style`에 이미 있는데 생성기가 안 읽고 있었다. 문법을
 * 제약으로 넘긴다 — 흔들리던 축을 사용자가 쥔다.
 */
export const PAGE_PROMPT_VERSION = 6;

/**
 * 한 지면의 상한.
 *
 * 자유 HTML은 길어질 수 있고, 실측한 한 장이 16KB였다. 여유를 크게 두되
 * 무한은 아니다 — 모델이 폭주하면 여기서 끊긴다.
 */
export const PAGE_MAX_BYTES = 512 * 1024;

/**
 * 실을 수 있는 태그.
 *
 * `script` · `iframe` · `object` · `embed` · `form` · `link` · `meta` · `base`가
 * 없는 것이 핵심이다. 바깥을 부르거나 코드를 실행하는 길을 전부 닫는다.
 */
export const PAGE_ALLOWED_TAGS = [
  // 뼈대
  "div", "section", "article", "aside", "header", "footer", "main", "nav",
  "figure", "figcaption", "hr", "br",
  // 글
  "h1", "h2", "h3", "h4", "h5", "h6", "p", "span", "strong", "em", "b", "i",
  "u", "s", "mark", "small", "sub", "sup", "code", "pre", "kbd", "samp",
  "blockquote", "cite", "q", "abbr", "time", "address",
  // 목록
  "ul", "ol", "li", "dl", "dt", "dd",
  // 표
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
  // 그림
  "img", "picture", "source",
  // 링크
  "a",
  // 웹폰트 스타일시트만. 아래 호스트 목록을 지나야 살아남는다.
  "link",
  /*
   * 스크립트 없는 상호작용.
   *
   * `details`는 브라우저가 만들어 주는 아코디언이고, `input type=checkbox|radio`는
   * `:has(:checked)`와 짝지으면 탭 · 필터 · 라이트박스 · 테마 토글이 된다. **코드가
   * 아니라 상태**라 실행되는 것이 없다.
   *
   * `form`은 여전히 없다. 그래서 이 입력들은 어디로도 전송되지 않는다 — 값을
   * 받는 척하는 화면(가짜 로그인)을 만들 수 없다. `type`도 아래에서 두 가지로 묶는다.
   */
  "details", "summary", "label", "input",
] as const;
// `style` 태그는 없다. CSS는 `css` 필드로 따로 받아 따로 검사한다 — 마크업
// 소독기에게 `<style>` 안은 그냥 글자 덩어리라 그대로 지나간다.

/**
 * 실을 수 있는 SVG 태그.
 *
 * 그래프와 아이콘이 여기서 나온다 — 자유 생성의 값이 큰 부분이라 닫을 수 없다.
 * 다만 `script` · `foreignObject` · `use` · `animate`류는 뺀다. `use`는 바깥
 * 문서를 끌어오고, `foreignObject`는 SVG 안에 HTML을 다시 열어 준다.
 */
export const PAGE_ALLOWED_SVG_TAGS = [
  "svg", "g", "defs", "title", "desc",
  "path", "circle", "ellipse", "rect", "line", "polyline", "polygon",
  "text", "tspan", "textPath",
  "linearGradient", "radialGradient", "stop",
  "clipPath", "mask", "pattern", "filter",
  "feGaussianBlur", "feOffset", "feBlend", "feColorMatrix", "feMerge", "feMergeNode",
  "marker", "symbol",
] as const;

/** 태그를 가리지 않고 붙을 수 있는 속성. */
export const PAGE_GLOBAL_ATTRIBUTES = [
  "class", "id", "style", "title", "role", "lang", "dir",
  // 키트의 API가 여기 달린다 — 모델은 코드가 아니라 속성을 쓴다.
  // 스크립트가 없으면 그냥 붙어만 있는 값이라 그 자체로는 아무 일도 안 한다.
  "data-*",
  "aria-label", "aria-labelledby", "aria-describedby", "aria-hidden",
  "aria-level", "aria-current", "aria-live",
] as const;

/**
 * 태그별로 더 붙는 속성.
 *
 * `on*`은 어디에도 없다 — 목록에 없는 속성은 전부 떨어지므로 `onclick`이
 * 실릴 길이 없다.
 */
export const PAGE_TAG_ATTRIBUTES: Readonly<Record<string, readonly string[]>> = {
  a: ["href", "target", "rel"],
  img: ["src", "srcset", "sizes", "alt", "width", "height", "loading", "decoding"],
  source: ["srcset", "sizes", "media", "type", "width", "height"],
  time: ["datetime"],
  th: ["colspan", "rowspan", "scope", "headers"],
  td: ["colspan", "rowspan", "headers"],
  col: ["span"],
  colgroup: ["span"],
  ol: ["start", "reversed", "type"],
  li: ["value"],
  blockquote: ["cite"],
  q: ["cite"],
  abbr: ["title"],
  link: ["rel", "href", "crossorigin"],
  details: ["open", "name"],
  label: ["for"],
  // `value`·`placeholder`가 없다 — 글자를 받는 칸으로 쓸 수 없게 한다.
  input: ["type", "id", "name", "checked", "disabled"],
  // SVG는 표현 속성이 곧 그림이라 넓게 연다. 스크립트가 들어갈 속성은 없다.
  svg: [
    "viewBox", "width", "height", "xmlns", "fill", "stroke", "stroke-width",
    "preserveAspectRatio", "overflow",
  ],
  "*svg": [
    "d", "cx", "cy", "r", "rx", "ry", "x", "y", "x1", "y1", "x2", "y2",
    "width", "height", "points", "transform", "fill", "fill-opacity", "fill-rule",
    "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-dasharray",
    "stroke-dashoffset", "stroke-opacity", "opacity", "offset", "stop-color",
    "stop-opacity", "gradientUnits", "gradientTransform", "spreadMethod",
    "clip-path", "clip-rule", "mask", "filter", "patternUnits", "markerWidth",
    "markerHeight", "refX", "refY", "orient", "text-anchor", "dominant-baseline",
    "font-size", "font-family", "font-weight", "letter-spacing", "dx", "dy",
    "in", "in2", "result", "stdDeviation", "mode", "type", "values",
  ],
};

/**
 * 링크가 갈 수 있는 곳.
 *
 * `javascript:`와 `data:`가 없는 것이 요점이다. 앵커(`#`)는 같은 지면 안이라
 * 허용한다 — 섹션 인덱스가 이걸로 움직인다.
 */
export const PAGE_ALLOWED_LINK_SCHEMES = ["http", "https", "mailto"] as const;

/**
 * 그림이 올 수 있는 곳.
 *
 * 우리가 내보내는 자산만이다. 바깥 주소를 허용하면 지면을 여는 것만으로
 * 방문자의 IP가 그 서버에 남는다 — 남의 포트폴리오를 보는 일이 추적당하는
 * 일이 되어서는 안 된다.
 */
export const PAGE_IMAGE_SRC_PREFIX = "/v1/media/";

/**
 * 바깥 스타일시트를 부를 수 있는 곳.
 *
 * 서체는 지면 인상의 절반이라 목록을 네 개로 묶어 두면 만들 수 있는 것이 좁아진다.
 * 그래서 **폰트 CDN만** 연다 — 스타일시트는 스크립트를 실행하지 못하고, 껍데기가
 * 이미 같은 호스트를 부르고 있어 방문자에게 새로 드러나는 것도 없다.
 */
export const PAGE_ALLOWED_STYLESHEET_HOSTS = [
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "cdn.jsdelivr.net",
] as const;

/** `<link>`에 허용하는 rel. 이 둘 말고는 전부 떨어진다. */
export const PAGE_ALLOWED_LINK_RELS = ["stylesheet", "preconnect"] as const;

/**
 * 실을 수 있는 입력 종류.
 *
 * **켜고 끄는 것만이다.** `text`·`password`·`email`을 열면 그 순간 지면이 값을
 * 받는 화면이 될 수 있고, 우리 도메인에 걸린 가짜 입력창은 방문자가 우리를
 * 믿기 때문에 더 잘 통한다. 전송할 곳이 없다는 것과 입력칸이 없다는 것은 다르다.
 */
export const PAGE_ALLOWED_INPUT_TYPES = ["checkbox", "radio"] as const;

/**
 * 지면이 쓸 수 있는 서체.
 *
 * 바깥 스타일시트를 못 부르므로 껍데기가 미리 싣는다. 모델에게는 이 목록을
 * 그대로 보여 주고, 없는 것을 `font-family`에 적으면 폴백으로 떨어진다.
 */
export const PAGE_FONTS = [
  { stack: "var(--page-sans)", label: "본문 산세리프 (Pretendard)", use: "기본 본문과 UI" },
  { stack: "var(--page-serif)", label: "세리프 (Nanum Myeongjo)", use: "에디토리얼한 제목" },
  { stack: "var(--page-mono)", label: "고정폭 (JetBrains Mono)", use: "코드 · 라벨 · 수치" },
  { stack: "var(--page-display)", label: "라틴 디스플레이 (Outfit)", use: "영문 큰 제목" },
] as const;

/**
 * CSS에서 막는 것.
 *
 * 소독기는 마크업을 보지만 `<style>` 안은 글자 덩어리라 그냥 지난다. 여기서
 * 다시 본다 — 바깥을 부르거나(`@import` · 외부 `url()`) 코드를 실행하는
 * (`expression()` · `-moz-binding`) 길을 닫는다.
 */
export const PAGE_CSS_FORBIDDEN = [
  { pattern: /@import\b/i, reason: "@import — 바깥 스타일시트를 부른다" },
  { pattern: /expression\s*\(/i, reason: "expression() — 옛 IE에서 코드가 된다" },
  { pattern: /-moz-binding/i, reason: "-moz-binding — 바깥 문서를 실행한다" },
  { pattern: /\bbehavior\s*:/i, reason: "behavior — 바깥 문서를 실행한다" },
  { pattern: /javascript\s*:/i, reason: "javascript: 주소" },
  { pattern: /<\/?\s*script/i, reason: "style 안에서 태그를 닫고 나가려는 시도" },
] as const;

/**
 * `url()`이 가리켜도 되는 곳.
 *
 * 우리 자산과 인라인 데이터만이다. 데이터 URI는 SVG를 담을 수 있어 이미지
 * 타입만 받는다 — `data:image/svg+xml`은 스크립트를 담으므로 뺀다.
 */
export const PAGE_CSS_URL_ALLOWED = [
  new RegExp(`^${PAGE_IMAGE_SRC_PREFIX.replaceAll("/", "\\/")}`),
  /^data:image\/(png|jpeg|webp|gif);base64,/,
  /^#/,
] as const;

export const PageStyleGrammarSchema = z.strictObject({
  name: z.string().min(1).max(200),
  description: z.string().max(1_000),
  toneTags: z.array(z.string().min(1).max(100)).max(20),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  text: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  font: z.enum(["sans", "serif"]),
  density: z.enum(["compact", "comfortable", "spacious"]),
  structure: z.enum(["single-column", "dense-grid", "wide-margin"]),
  composition: z.enum(["linear-story", "asymmetric-editorial", "evidence-grid"]),
  typography: z.enum(["display-led", "editorial", "technical"]),
  geometry: z.enum(["open-planes", "ruled-sections", "contained-cards"]),
  motion: z.enum(["calm-responsive", "precise-technical", "minimal"]),
  interaction: z.enum(["evidence-exploration", "linear-reading", "comparison"]),
  imagery: z.enum(["project-artifacts-first", "data-visual-first", "typography-first"]),
  antiPatterns: z.array(z.string().min(1).max(200)).max(20),
});
export type PageStyleGrammar = z.infer<typeof PageStyleGrammarSchema>;

export const PageQaCheckSchema = z.strictObject({
  name: z.enum([
    "grounded-numbers",
    "sanitized-output",
    "styled-elements",
    "sized-elements",
    "responsive-css",
    "reduced-motion",
    "portfolio-plan",
  ]),
  status: z.enum(["pass", "fail"]),
  severity: z.enum(["error", "warning"]),
  detail: z.string().max(2_000),
});

export const PageQaReportSchema = z.strictObject({
  status: z.enum(["ready", "failed_qa"]),
  checks: z.array(PageQaCheckSchema),
});
export type PageQaReport = z.infer<typeof PageQaReportSchema>;

export const PageGenerationManifestSchema = z.strictObject({
  methodologyVersion: z.literal(1),
  model: z.string().min(1).max(200),
  promptHash: z.string().regex(/^[0-9a-f]{64}$/),
  promptVersions: z.strictObject({
    page: z.number().int().positive(),
    designPrinciples: z.number().int().positive(),
  }),
  tools: z.array(z.enum(["web-search", "product-design", "imagegen", "external-reference"])),
  sourceUrls: z.array(z.string().url().max(2_000)).max(100),
  attempts: z.number().int().min(1).max(2),
  repairCount: z.number().int().min(0).max(1),
  usage: z.strictObject({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    cacheReadTokens: z.number().int().nonnegative(),
    cacheCreationTokens: z.number().int().nonnegative(),
    durationMs: z.number().int().nonnegative(),
    costUsd: z.number().nonnegative().nullable(),
  }),
});
export type PageGenerationManifest = z.infer<typeof PageGenerationManifestSchema>;

export const GeneratedPageSchema = z.strictObject({
  id: UuidSchema,
  portfolioId: UuidSchema,
  /** 지면의 몸통. 소독을 지난 것만 여기 들어온다. */
  html: z.string().min(1).max(PAGE_MAX_BYTES),
  /** `<style>`에 실릴 CSS. 역시 소독을 지난 것이다. */
  css: z.string().max(PAGE_MAX_BYTES),
  /** 무엇을 왜 이렇게 만들었는지 한 문장. 사용자가 이걸 읽고 다시 뽑을지 정한다. */
  rationale: z.string().max(400),
  promptVersion: z.number().int().nonnegative(),
  /** 같은 포트폴리오에서 몇 번째로 뽑은 것인가. 되돌아갈 수 있게 남긴다. */
  revision: z.number().int().nonnegative(),
  qualityStatus: z.enum(["ready", "failed_qa"]).default("ready"),
  qaReport: PageQaReportSchema.default({ status: "ready", checks: [] }),
  generationManifest: PageGenerationManifestSchema.nullable().default(null),
  styleSpec: PageStyleGrammarSchema.nullable().default(null),
  createdAt: TimestampSchema,
});
export type GeneratedPage = z.infer<typeof GeneratedPageSchema>;

/** 모델이 내는 모양. 저장본과 달리 식별자와 시각이 없다. */
export const PageDraftSchema = z.strictObject({
  html: z.string().min(1).max(PAGE_MAX_BYTES),
  css: z.string().min(1).max(PAGE_MAX_BYTES),
  rationale: z.string().min(1).max(400),
});
export type PageDraft = z.infer<typeof PageDraftSchema>;

/** 지면을 한 문장으로 고칠 때. "더 차분하게" · "첫 화면을 크게". */
export const RegeneratePageSchema = z.strictObject({
  instruction: z.string().trim().min(1).max(300).optional(),
});
export type RegeneratePage = z.infer<typeof RegeneratePageSchema>;

/**
 * 지면을 감싸는 껍데기.
 *
 * **배포되는 문서와 앱 안의 미리보기가 같은 함수를 쓴다.** 미리보기가 실제와
 * 달라지면 보고 고르는 의미가 없다 — 블록 시절에 렌더러를 하나로 묶어 둔 것과
 * 같은 이유다.
 *
 * 여기가 `<head>`를 쥐고 있어서 서체 · 리셋 · 메타 태그가 모델 손을 타지 않는다.
 * 모델은 몸통과 CSS만 쓴다.
 */
export function pageDocument(input: {
  html: string;
  css: string;
  title: string;
  /** 검색 결과와 공유 카드에 뜨는 한 줄. */
  description?: string;
  /**
   * 이 지면의 문법. 주면 **키트와 그 변수를 함께 싣는다.**
   *
   * 안 주면 모델이 CSS를 통째로 쓴 옛 판이다 — 그때 만든 지면에 지금 키트를
   * 끼우면 우리 규칙이 그쪽 규칙과 싸운다. 그래서 판마다 갈린다.
   */
  grammar?: PageStyleGrammar;
}): string {
  const escape = (value: string) => value
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(input.title)}</title>
${input.description ? `<meta name="description" content="${escape(input.description)}">` : ""}
<link rel="preconnect" href="https://cdn.jsdelivr.net">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.css">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600&family=Nanum+Myeongjo:wght@400;700&family=JetBrains+Mono:wght@400;500&display=swap">
<style>
${PAGE_SHELL_CSS}
</style>
${input.grammar ? `<style>\n${pageKitVariables(input.grammar)}\n${PAGE_KIT_CSS}\n</style>` : ""}
<style>
${input.css}
</style>
</head>
<body>
${input.html}
</body>
</html>`;
}

/**
 * 껍데기가 까는 것.
 *
 * 서체 변수와 최소 리셋뿐이다. **모양은 하나도 정하지 않는다** — 여기서 색이나
 * 여백을 정해 두면 모델이 쓴 CSS와 매번 싸우게 되고, 어느 쪽이 이겼는지
 * 아무도 모르는 지면이 나온다.
 */
export const PAGE_SHELL_CSS = `
:root{
  --page-sans:"Pretendard Variable",Pretendard,-apple-system,system-ui,sans-serif;
  --page-serif:"Nanum Myeongjo","Noto Serif KR",serif;
  --page-mono:"JetBrains Mono",ui-monospace,Menlo,monospace;
  --page-display:"Outfit",var(--page-sans);
}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;font-family:var(--page-sans);word-break:keep-all;-webkit-font-smoothing:antialiased}
img{max-width:100%;height:auto;display:block}
svg{max-width:100%}
/* 가로 스크롤은 폰에서 지면을 무너뜨린다. 여기서 한 번 더 막는다. */
body{overflow-x:hidden}
`.trim();

/**
 * 프롬프트에 그대로 붙일 허용 목록.
 *
 * 소독기와 **같은 상수를 읽는다.** 목록을 늘리면 모델이 그날부터 쓸 수 있고,
 * 줄이면 그날부터 안 쓴다 — 둘이 어긋날 자리가 없다.
 */
export function pagePolicyPrompt(): string {
  return [
    "## 못 쓰는 것 — 이것 말고는 HTML도 CSS도 전부 자유다",
    "- `<script>` · `<iframe>` · `<form>`, 그리고 `onclick` 같은 모든 이벤트 속성.",
    "  **지면은 움직이지 않는다.** 동작이 필요하면 CSS 애니메이션과 `:hover`로 낸다.",
    `- 바깥 이미지 주소. 그림은 \`${PAGE_IMAGE_SRC_PREFIX}…\`만 쓸 수 있다.`,
    "",
    "## 서체는 직접 불러라",
    `\`<link rel="stylesheet">\`로 ${PAGE_ALLOWED_STYLESHEET_HOSTS.join(" · ")}에서 가져올 수 있다.`,
    "따로 안 부르면 아래가 이미 실려 있다 —",
    ...PAGE_FONTS.map((font) => `\`${font.stack}\` ${font.label}`),
  ].join("\n");
}

/**
 * 스타일 문법을 생성기에게 넘기는 모양.
 *
 * **이 플랫폼의 기획이 여기 걸려 있다** — 지면을 뽑고 나서 고르는 것이 아니라,
 * 뽑기 전에 문법을 정하고 그 문법대로 뽑는다. 여러 장 뽑아 고르는 방식과 값이
 * 같아 보이지만 비용이 다르다. 한 장만 뽑아도 사용자가 정한 성격이 나온다.
 *
 * 그래서 이 값들은 제안이 아니라 **제약**이다. 프롬프트도 그렇게 말한다.
 */
const DENSITY_RULE: Record<PageStyleGrammar["density"], string> = {
  compact: "빽빽하게. 섹션 사이 여백을 좁히고 한 화면에 정보를 많이 담는다."
    + " 본문 15px 안팎, 줄간 1.5.",
  comfortable: "읽기 편하게. 섹션 사이를 넉넉히 두되 비어 보이지 않게 한다."
    + " 본문 16px 안팎, 줄간 1.7.",
  spacious: "넓게. 여백이 지면의 일부다. 문단 폭을 좁히고 줄간을 넓힌다."
    + " 본문 17px 안팎, 줄간 1.9.",
};

const STRUCTURE_RULE: Record<PageStyleGrammar["structure"], string> = {
  "single-column": "**단일 칼럼 서사.** 하나의 읽는 흐름으로 위에서 아래로 내려간다."
    + " 폭은 한 줄에 45–75자가 들어오게 잡고, 수치와 표만 그보다 넓게 뺀다."
    + " 좌우로 쪼개지 않는다 — 읽는 순서가 하나여야 한다.",
  "dense-grid": "**밀도 높은 격자.** 정보를 테두리로 나뉜 칸에 담아 견주게 한다."
    + " 섹션 이름·번호·메타를 왼쪽 좁은 칸에, 내용을 오른쪽 넓은 칸에 두는 2단을"
    + " 기본으로 쓴다. 수치는 문단이 아니라 칸이다. 한 화면에 정보 덩어리 둘 이상.",
  "wide-margin": "**넓은 여백의 읽는 지면.** 문단을 좁게 세우고 둘레를 비운다."
    + " 제목과 본문의 크기 차이를 크게 두어 리듬을 만든다. 격자를 쓰더라도 칸을"
    + " 테두리로 가르지 말고 여백으로 가른다.",
};

/**
 * 문법을 프롬프트 조각으로 편다.
 *
 * 값을 나열만 하지 않고 **그 값이 지면에서 무슨 뜻인지**까지 적는다. `compact`
 * 한 단어는 모델마다 다르게 읽히지만 "본문 15px, 줄간 1.5"는 그렇지 않다.
 */
export function pageStyleGrammarPrompt(style: PageStyleGrammar): string {
  return [
    "## 스타일 문법 — 사용자가 **생성 전에 이미 골랐다.** 지키는 것이 네 일이다",
    `고른 것: **${style.name}** — ${style.description}`,
    style.toneTags.length > 0 ? `성격: ${style.toneTags.join(" · ")}` : "",
    "",
    `- 바탕 \`${style.background}\` · 본문 글자 \`${style.text}\` · 강조 \`${style.accent}\`.`,
    "  **이 세 색이 지면의 뼈대다.** 명도를 조절한 변주(옅은 면, 테두리, 보조 글자색)는",
    "  만들어 써도 되지만 계열 밖의 새 색을 들이지 마라.",
    `- 서체: ${style.font === "serif" ? "세리프를 제목과 본문의 중심에 둔다" : "산세리프를 중심에 둔다"}.`,
    `  고정폭은 수치와 라벨에만 쓴다.`,
    `- 밀도: ${DENSITY_RULE[style.density]}`,
    `- 골격: ${STRUCTURE_RULE[style.structure]}`,
    `- 구성: ${style.composition} · 타이포그래피: ${style.typography} · 면 구성: ${style.geometry}.`,
    `- 모션: ${style.motion} · 인터랙션: ${style.interaction} · 이미지: ${style.imagery}.`,
    style.antiPatterns.length > 0
      ? `- 금지 패턴: ${style.antiPatterns.join(" · ")}.`
      : "",
    "",
    "이 넷을 바꾸고 싶어도 바꾸지 마라. 사용자가 다음 지면에서 다른 문법을 고를 것이다.",
    "**문법이 정하지 않은 것은 전부 네 몫이다** — 섹션 구성, 그래프, 강조할 수치,",
    "여백의 리듬, 크롬(내비 · 푸터)의 모양.",
  ].filter(Boolean).join("\n");
}
