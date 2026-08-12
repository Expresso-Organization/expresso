import type {
  BlockStyle,
  LayoutSpec,
  PortfolioBlock,
  PortfolioDetail,
  PortfolioSection,
} from "@expresso/contracts";
import { checkClassName } from "@expresso/contracts";
import type { CSSProperties } from "react";

/**
 * 지면을 CSS로 옮긴다.
 *
 * 스펙은 **기본값**이고 `block.style`이 **덮어쓴다**. 합성 순서는 항상
 * `LayoutSpec ∘ block.style`이라, 스펙을 다시 짜도 직접 고친 값은 남는다.
 */

const FONT_STACK = {
  "sans-neutral": "var(--ex-font-ui)",
  "sans-geometric": "var(--ex-font-brand)",
  "serif-editorial": "'Noto Serif KR', Georgia, serif",
  "serif-humanist": "'Nanum Myeongjo', Palatino, serif",
  "mono-technical": "var(--ex-font-mono)",
} as const;


/**
 * 스펙의 구조화된 부분을 CSS 변수로 편다.
 *
 * `text-ink` · `text-step2` 같은 유틸리티가 이 변수를 읽는다 — 클래스 이름은
 * 고정이고 값은 지면마다 다르다. 유틸리티를 쓰면서도 지면이 매번 달라지는
 * 이유가 여기다.
 */
export function layoutVariables(spec: LayoutSpec): CSSProperties {
  const step = spec.type.scaleRatio;
  return {
    "--pf-ink": spec.palette.ink,
    "--pf-paper": spec.palette.paper,
    "--pf-accent": spec.palette.accent,
    "--pf-muted": spec.palette.muted,
    "--pf-display": FONT_STACK[spec.type.display],
    "--pf-body": FONT_STACK[spec.type.body],
    "--pf-measure": `${spec.type.measure}ch`,
    "--pf-step-1": `${(1 / step).toFixed(3)}rem`,
    "--pf-step0": "1rem",
    "--pf-step1": `${step.toFixed(3)}rem`,
    "--pf-step2": `${(step ** 2).toFixed(3)}rem`,
    "--pf-step3": `${(step ** 3).toFixed(3)}rem`,
    "--pf-step4": `${(step ** 4).toFixed(3)}rem`,
    // 표지 제목 자리. 계단 하나로는 큰 글씨가 본문과 충분히 벌어지지 않는다.
    "--pf-step5": `${(step ** 5).toFixed(3)}rem`,
    // 섹션 사이의 숨. `portfolio-utilities.css`의 `:where()` 기본 규칙이 읽는다 —
    // 특정도가 0이라 스펙이 `mt-*`로 언제든 덮어쓸 수 있다.
    "--pf-gap": `${spec.rhythm.sectionGap}px`,
  } as CSSProperties;
}

/**
 * 사용자가 고른 모양 → 지면 어휘의 클래스.
 *
 * 값은 전부 지면이 런타임에 채우는 것들이다 — `text-step2`의 실제 크기도
 * `text-accent`의 실제 색도 `LayoutSpec`이 정한다. 그래서 지면을 갈아도 이
 * 블록은 새 지면의 계단과 팔레트를 따라간다.
 */
function styleClasses(style: BlockStyle): string[] {
  const classes: string[] = [];
  if (style.size) classes.push(`text-${style.size}`);
  if (style.weight) classes.push(`font-${style.weight}`);
  if (style.italic !== undefined) classes.push(style.italic ? "italic" : "not-italic");
  if (style.strike !== undefined) classes.push(style.strike ? "line-through" : "no-underline");
  if (style.color && style.color !== "inherit") classes.push(`text-${style.color}`);
  if (style.highlight) classes.push("bg-accent/20");
  if (style.alignment) {
    classes.push(`text-${{ start: "left", center: "center", end: "right" }[style.alignment]}`);
  }
  if (style.spacing) {
    classes.push(`leading-${{ compact: "snug", normal: "normal", wide: "relaxed" }[style.spacing]}`);
  }
  return classes;
}

/**
 * 같은 것을 정하는 클래스는 함께 설 수 없다.
 *
 * CSS는 class 속성의 **순서로 이기지 않는다** — 같은 특정도면 스타일시트에
 * 늦게 정의된 쪽이 이긴다. `text-step4` 뒤에 `text-step1`을 덧붙여 봐야
 * 어느 쪽이 이길지는 우리가 정할 수 없다. 그래서 사용자가 정한 자리는
 * 지면의 것을 **걷어내고** 넣는다.
 */
const FAMILIES: { of: (style: BlockStyle) => boolean; pattern: RegExp }[] = [
  { of: (style) => style.size !== undefined, pattern: /^(?:sm:|md:|lg:)?text-step/ },
  { of: (style) => style.weight !== undefined, pattern: /^font-(?:thin|light|normal|medium|semibold|bold|black)$/ },
  { of: (style) => style.italic !== undefined, pattern: /^(?:italic|not-italic)$/ },
  { of: (style) => style.strike !== undefined, pattern: /^(?:underline|line-through|no-underline)$/ },
  { of: (style) => style.color !== undefined && style.color !== "inherit", pattern: /^text-(?:ink|paper|accent|muted|hairline)$/ },
  { of: (style) => style.highlight === true, pattern: /^bg-/ },
  { of: (style) => style.alignment !== undefined, pattern: /^(?:sm:|md:|lg:)?text-(?:left|center|right|justify)$/ },
  { of: (style) => style.spacing !== undefined, pattern: /^leading-/ },
];

/**
 * 이 블록에 붙일 클래스.
 *
 * 네 겹이 순서대로 쌓인다:
 *
 * 1. 지면의 **종류별 기본값**(`blockClasses`) — 이 지면에서 문단은 어떻게 생겼나.
 * 2. 배치 나무가 **이 블록에만** 준 것 — 같은 문단이라도 표지의 첫 줄은 다르다.
 * 3. 옛 블록이 들고 있던 `style.className`.
 * 4. 사용자가 04b에서 고른 모양.
 *
 * 사용자가 정한 자리는 앞의 것을 **걷어내고** 들어간다(P3) — 같은 것을 정하는
 * 클래스는 함께 설 수 없기 때문이다.
 */
export function classesFor(
  block: PortfolioBlock,
  spec: LayoutSpec,
  /** 배치 나무가 이 블록에만 준 클래스. 종류 기본값을 덮어쓴다. */
  placement?: string | undefined,
): string {
  const style = block.style as BlockStyle & { className?: unknown };
  const chosen = styleClasses(style);
  const taken = FAMILIES.filter((family) => family.of(style)).map(({ pattern }) => pattern);
  const keep = (value: string) => value
    .split(/\s+/)
    .filter((token) => token && !taken.some((pattern) => pattern.test(token)));

  const base = keep(spec.blockClasses[block.kind] ?? "");
  const fromPlacement = placement ? keep(checkClassName(placement).accepted) : [];
  const override = typeof style.className === "string"
    ? keep(checkClassName(style.className).accepted)
    : [];

  // 뒤에 오는 것이 같은 자리를 다시 정하면 앞의 것을 뺀다 — class 속성의 순서로는
  // 이기지 못하고, 같은 특정도면 스타일시트에 늦게 정의된 쪽이 이긴다.
  const later = [...fromPlacement, ...override, ...chosen];
  return [...base.filter((token) => !collides(token, later)), ...later].join(" ").trim();
}

/** 같은 것을 정하는 클래스인가. 접두사(`text-` · `p-` · `md:grid-cols-`)로 본다. */
function collides(token: string, others: readonly string[]): boolean {
  const family = utilityFamily(token);
  return others.some((other) => utilityFamily(other) === family);
}

function utilityFamily(token: string): string {
  const separator = token.lastIndexOf(":");
  const variant = token.slice(0, separator + 1);
  const bare = token.slice(separator + 1);
  // 값 자리만 떼어낸다. `text-step2` → `text-step`, `gap-x-4` → `gap-x`.
  const stem = bare.replace(/-?[\d.]+(?:\/\d+)?$/, "").replace(/-(?:full|auto|fit|min|max|none)$/, "");
  return `${variant}${stem}`;
}

/** 스펙이 정한 배치 순서대로 섹션을 세운다. 숨긴 섹션과 빈 섹션은 뺀다. */
export function orderedSections(
  portfolio: PortfolioDetail,
  spec: LayoutSpec,
): { section: PortfolioSection; placement: LayoutSpec["sections"][number] }[] {
  const byId = new Map(portfolio.sections.map((section) => [section.id, section]));
  return spec.sections.flatMap((placement) => {
    const section = byId.get(placement.portfolioSectionId);
    // 빈 섹션은 채우지 않고 뺀다 — 채움 문구보다 없는 편이 낫다.
    if (!section || !section.visible || section.blocks.length === 0) return [];
    return [{ section, placement }];
  });
}

/**
 * 스펙이 없는 포트폴리오도 그릴 수 있어야 한다. 생성 전이거나 옛 데이터인
 * 경우이며, 이때는 섹션 순서 그대로 가장 단순한 지면으로 눕힌다.
 */
export function fallbackSpec(portfolio: PortfolioDetail): LayoutSpec {
  const style = portfolio.templateStyle as Record<string, string | undefined>;
  return {
    type: {
      display: style["font"] === "serif" ? "serif-editorial" : "sans-neutral",
      body: "sans-neutral",
      scaleRatio: 1.25,
      measure: 62,
    },
    palette: {
      ink: style["text"] ?? "#16223A",
      paper: style["background"] ?? "#FFFFFF",
      accent: style["accent"] ?? "#9A4030",
      // muted는 면이 아니라 **한 단 낮춘 글자색**이다. 옛 템플릿 style에는 그
      // 자리가 없어서 본문 위에서 읽히는 회색을 쓴다.
      muted: "#5A6473",
    },
    rhythm: { density: "comfortable", sectionGap: 72 },
    pageClassName: "font-body text-ink bg-paper break-keep",
    sectionLabelClassName: "text-step-1 font-mono tracking-widest text-accent",
    sections: portfolio.sections
      .filter((section) => section.visible && section.blocks.length > 0)
      .map((section, index) => ({
        portfolioSectionId: section.id,
        className: index === 0 ? "px-8 pt-20 pb-12" : "px-8 py-12",
        innerClassName: "grid gap-5 max-w-measure mx-auto",
        // 배치를 비우면 블록이 순서대로 눕는다. 기본 지면이 원하는 것이 그거다.
        items: [],
      })),
    blockClasses: {
      heading: "text-step3 font-display font-semibold leading-tight text-balance",
      paragraph: "text-step0 leading-relaxed text-pretty",
      list: "text-step0 leading-relaxed list-disc pl-5 grid gap-2",
      metric: "text-step3 font-display font-light leading-none text-accent",
      chart: "grid gap-3 text-accent",
      media: "rounded-xl overflow-hidden",
    },
    rationale: "아직 지면을 만들지 않아 가장 단순한 배치로 그립니다.",
  };
}
