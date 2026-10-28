import type { DesignSystemSpecV2, PageQaCheck } from "@expresso/contracts";

/**
 * 디자인 시스템 토큰을 CSS로 옮기는 단일 출처입니다.
 *
 * 설계 문서(`DESIGN.html`) 컴파일러와 포트폴리오 키트가 같은 함수를 씁니다. 카탈로그에서
 * 본 디자인과 생성된 지면이 같은 변수에서 나오게 하기 위해서입니다.
 */

export const COLOR_NAMES = [
  "canvas",
  "surface",
  "elevated",
  "text",
  "muted",
  "border",
  "accent",
  "action",
  "actionText",
] as const;

/**
 * WCAG 2.1 상대 휘도. 문서가 적는 명암비를 주장이 아니라 계산으로 만들기 위해 쓴다.
 * 임계값 0.03928은 WCAG 2.1 「relative luminance」 정의를 그대로 따른다.
 */
export function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((index) => {
    const channel = Number.parseInt(hex.slice(index, index + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

/** 두 색 토큰의 명암비. 계약이 6자리 16진값만 허용하므로 언제나 계산할 수 있다. */
export function contrastRatio(foreground: string, background: string): number {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

const BARE_FAMILIES = new Set(["ui-monospace", "ui-sans-serif", "ui-serif", "system-ui", "serif", "sans-serif", "monospace", "cursive"]);

/**
 * 서체 이름을 CSS 값으로. 갈래말이 아니면 따옴표로 묶는다 — `Source Serif 4`
 * 처럼 숫자로 시작하는 낱말이 섞이면 따옴표 없이는 선언 전체가 무효가 된다.
 * 계약의 서체 이름은 자유 문자열이므로 큰따옴표는 미리 걷어낸다.
 */
export function cssFamily(family: string): string {
  if (BARE_FAMILIES.has(family)) return family;
  return `"${family.replaceAll('"', "")}"`;
}

export function cssVariables(spec: DesignSystemSpecV2): string {
  const colors = COLOR_NAMES.map(
    (name) => `--${name}:${spec.colors[name].value};`,
  ).join("");
  const fonts = ["display", "body", "mono"].map((name) => {
    const font = spec.typography[name as keyof Pick<typeof spec.typography, "display" | "body" | "mono">];
    return `--font-${name}:${cssFamily(font.family)},${font.fallback};`;
  }).join("");
  const steps = spec.typography.scale.map(
    (step) => `--type-${step.name}:${step.size};--line-${step.name}:${step.lineHeight};`,
  ).join("");
  const bodyStep = spec.typography.scale[0]!;
  const headingStep = spec.typography.scale[Math.max(0, spec.typography.scale.length - 2)]!;
  const displayStep = spec.typography.scale.at(-1)!;
  const exampleSteps = `--type-example-body:${bodyStep.size};--line-example-body:${bodyStep.lineHeight};--type-example-heading:${headingStep.size};--line-example-heading:${headingStep.lineHeight};--type-example-display:${displayStep.size};--line-example-display:${displayStep.lineHeight};`;
  // 지면 색에서 계산하므로 밝은 지면과 어두운 지면이 같은 규칙으로 자기 깊이를 얻는다.
  const shadow = {
    none: "none",
    hairline: "0 1px 0 var(--border)",
    soft: "0 12px 30px color-mix(in srgb,var(--text) 10%,transparent)",
    layered: "0 2px 4px color-mix(in srgb,var(--text) 8%,transparent),0 18px 40px color-mix(in srgb,var(--text) 12%,transparent)",
    offset: "6px 6px 0 var(--text)",
    inset: "inset 0 2px 6px color-mix(in srgb,var(--text) 22%,transparent),inset 0 -1px 0 color-mix(in srgb,var(--canvas) 60%,transparent)",
    relief: "8px 8px 20px color-mix(in srgb,var(--text) 16%,transparent),-8px -8px 20px color-mix(in srgb,var(--canvas) 90%,white)",
    bevel: "inset 2px 2px 0 color-mix(in srgb,var(--canvas) 55%,white),inset -2px -2px 0 color-mix(in srgb,var(--text) 45%,transparent),3px 3px 0 color-mix(in srgb,var(--text) 35%,transparent)",
  }[spec.shape.shadowStyle];
  return `${colors}${fonts}${steps}${exampleSteps}--measure:${spec.typography.measure};--base-unit:${spec.spacing.baseUnit}px;--element-gap:${spec.spacing.elementGap}px;--component-gap:${spec.spacing.componentGap}px;--section-gap:${spec.spacing.sectionGap}px;--content-width:${spec.spacing.contentWidth}px;--card-radius:${spec.shape.cardRadius}px;--control-radius:${spec.shape.controlRadius}px;--border-width:${spec.shape.borderWidth}px;--motion-duration:${spec.motion.duration};--motion-easing:${spec.motion.easing};--shadow:${shadow};`;
}

export const WEB_FONTS: Record<string, string> = {
  "Abril Fatface": "Abril+Fatface",
  Anton: "Anton",
  Archivo: "Archivo:wght@400;500;600;700",
  "Archivo Black": "Archivo+Black",
  Caveat: "Caveat:wght@400;500;600;700",
  Chivo: "Chivo:wght@400;500;600;700",
  "Cormorant Garamond": "Cormorant+Garamond:wght@400;500;600;700",
  "EB Garamond": "EB+Garamond:wght@400;500;600;700",
  Fraunces: "Fraunces:wght@400;500;600;700",
  "IBM Plex Sans": "IBM+Plex+Sans:wght@400;500;600;700",
  Inter: "Inter:wght@400;500;600;700",
  "JetBrains Mono": "JetBrains+Mono:wght@400;500;600;700",
  Lora: "Lora:wght@400;500;600;700",
  Manrope: "Manrope:wght@400;500;600;700",
  Newsreader: "Newsreader:wght@400;500;600;700",
  Nunito: "Nunito:wght@400;500;600;700",
  Orbitron: "Orbitron:wght@400;500;600;700",
  Oswald: "Oswald:wght@400;500;600;700",
  "Playfair Display": "Playfair+Display:wght@400;500;600;700",
  "Poiret One": "Poiret+One",
  Poppins: "Poppins:wght@400;500;600;700",
  Quicksand: "Quicksand:wght@400;500;600;700",
  Rajdhani: "Rajdhani:wght@400;500;600;700",
  Roboto: "Roboto:wght@400;500;600;700",
  Silkscreen: "Silkscreen:wght@400;700",
  "Source Serif 4": "Source+Serif+4:wght@400;500;600;700",
  "Space Grotesk": "Space+Grotesk:wght@400;500;600;700",
  "Work Sans": "Work+Sans:wght@400;500;600;700",

  // 한글. 라틴 가족에 없는 글자를 받는다. Google Fonts 는 한글을 `unicode-range`
  // 로 백여 조각으로 갈라 내주므로, 문서에 실제로 쓰인 음절 조각만 내려온다.
  "Black Han Sans": "Black+Han+Sans",
  Diphylleia: "Diphylleia",
  "Do Hyeon": "Do+Hyeon",
  Gaegu: "Gaegu:wght@400;700",
  "Gasoek One": "Gasoek+One",
  "Gothic A1": "Gothic+A1:wght@400;500;600;700",
  "Gowun Batang": "Gowun+Batang:wght@400;700",
  "Gowun Dodum": "Gowun+Dodum",
  Hahmlet: "Hahmlet:wght@400;500;600;700",
  "IBM Plex Sans KR": "IBM+Plex+Sans+KR:wght@400;500;600;700",
  Jua: "Jua",
  "Nanum Gothic Coding": "Nanum+Gothic+Coding:wght@400;700",
  "Nanum Myeongjo": "Nanum+Myeongjo:wght@400;700",
  "Noto Sans KR": "Noto+Sans+KR:wght@400;500;600;700",
  "Noto Serif KR": "Noto+Serif+KR:wght@400;500;600;700",
  Orbit: "Orbit",
  "Song Myung": "Song+Myung",
};

/** 한글 글자를 맡는 웹폰트입니다. 라틴 서체 뒤 대체 사슬에 와야 합니다. */
const KOREAN_WEB_FONTS = new Set([
  "Black Han Sans", "Diphylleia", "Do Hyeon", "Gaegu", "Gasoek One", "Gothic A1", "Gowun Batang",
  "Gowun Dodum", "Hahmlet", "IBM Plex Sans KR", "Jua", "Nanum Gothic Coding", "Nanum Myeongjo",
  "Noto Sans KR", "Noto Serif KR", "Orbit", "Song Myung",
]);

/** 웹폰트 없이 주요 운영체제가 기본으로 가진 라틴 서체입니다(Editorial의 Georgia). */
const SYSTEM_FONTS = new Set(["Georgia"]);

/** 디자인이 쓰는 웹폰트의 Google Fonts 스타일시트 주소. 쓸 웹폰트가 없으면 null. */
export function fontStylesheetUrl(spec: DesignSystemSpecV2): string | null {
  // 한글 서체는 대체 사슬에 있다 — 라틴 가족 뒤에 와야 라틴 글자를 뺏지 않는다.
  // 그래서 이름과 대체 사슬을 함께 훑는다.
  const declared = (["display", "body", "mono"] as const)
    .flatMap((role) => [spec.typography[role].family, ...spec.typography[role].fallback.split(",")])
    .map((name) => name.trim());
  const families = declared
    .map((family) => WEB_FONTS[family])
    .filter((value, index, all): value is string => Boolean(value) && all.indexOf(value) === index);
  if (families.length === 0) return null;
  const query = families.map((family) => `family=${family}`).join("&");
  return `https://fonts.googleapis.com/css2?${query}&display=swap`;
}

export function fontLink(spec: DesignSystemSpecV2): string {
  const url = fontStylesheetUrl(spec);
  return url ? `<link rel="stylesheet" href="${url}">` : "";
}

/** 지면 CSS의 맨 앞에 두는 글꼴 불러오기. 스타일시트의 첫 규칙이어야 동작한다. */
export function fontImportCss(spec: DesignSystemSpecV2): string {
  const url = fontStylesheetUrl(spec);
  return url ? `@import url("${url}");\n` : "";
}

function mixHex(from: string, to: string, amount: number): string {
  const channel = (hex: string, index: number) => Number.parseInt(hex.slice(index, index + 2), 16);
  return `#${[1, 3, 5]
    .map((index) => Math.round(channel(from, index) + (channel(to, index) - channel(from, index)) * amount))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
}

/**
 * 글자색이 바탕 위에서 기준 명암비를 넘게 합니다.
 *
 * 넘으면 그대로 두고, 모자라면 `toward` 쪽으로 가장 적게 섞은 색을 돌려줍니다.
 * 디자인의 색을 바꾸는 폭을 가장 작게 하려고 2%씩 올려 봅니다.
 */
export function ensureContrast(foreground: string, background: string, minimum: number, toward: string): string {
  if (contrastRatio(foreground, background) >= minimum) return foreground;
  for (let step = 1; step <= 50; step++) {
    const mixed = mixHex(foreground, toward, step / 50);
    if (contrastRatio(mixed, background) >= minimum) return mixed;
  }
  return toward;
}

/** 본문 크기 글자에 쓰는 WCAG 2.1 AA 기준. */
export const TEXT_CONTRAST = 4.5;

/**
 * 키트가 글자로 쓰는 보정 색입니다.
 *
 * 보조 글자는 바탕과 면 위에, 강조색은 글자(링크·표식)로, 행동 글자는 행동색 위에 놓입니다.
 * 색면 · 반전 섹션의 보조 글자와 반전 섹션의 강조 글자도 여기서 정합니다.
 * 원래 토큰이 기준을 넘으면 그대로입니다.
 */
export function readableColors(spec: DesignSystemSpecV2) {
  const { canvas, surface, text, muted, accent, action, actionText } = spec.colors;
  const mutedOnCanvas = ensureContrast(muted.value, canvas.value, TEXT_CONTRAST, text.value);
  const fieldText = ensureContrast(actionText.value, action.value, TEXT_CONTRAST, contrastRatio("#000000", action.value) > contrastRatio("#ffffff", action.value) ? "#000000" : "#ffffff");
  return {
    mutedOnCanvas,
    mutedOnSurface: ensureContrast(mutedOnCanvas, surface.value, TEXT_CONTRAST, text.value),
    accentText: ensureContrast(accent.value, canvas.value, TEXT_CONTRAST, text.value),
    actionText: fieldText,
    // 색면(행동색 바탕) · 반전(본문색 바탕) 섹션의 보조 글자는 그 바탕의 글자색을 바탕 쪽으로 30% 섞어 낮추고, 대비가 모자라면 글자색 쪽으로 되돌립니다.
    mutedOnField: ensureContrast(mixHex(fieldText, action.value, 0.3), action.value, TEXT_CONTRAST, fieldText),
    mutedOnInverse: ensureContrast(mixHex(canvas.value, text.value, 0.3), text.value, TEXT_CONTRAST, canvas.value),
    accentOnInverse: ensureContrast(accent.value, text.value, TEXT_CONTRAST, canvas.value),
  };
}

function remToPx(size: string): number | null {
  const match = /^([0-9.]+)(rem|px)$/.exec(size.trim());
  if (!match) return null;
  return match[2] === "rem" ? Number(match[1]) * 16 : Number(match[1]);
}

/**
 * 그리기 전에 토큰만으로 판정하는 품질 조건입니다.
 *
 * 보정 뒤 대비, 본문 크기, 웹폰트 존재를 봅니다. 화면을 봐야 아는 결함(넘침·줄바꿈)은
 * 브라우저 검사가 맡습니다.
 */
export function designQa(spec: DesignSystemSpecV2): PageQaCheck[] {
  const readable = readableColors(spec);
  const { canvas, surface, text, action } = spec.colors;
  const pairs: [string, string, string][] = [
    ["본문/바탕", text.value, canvas.value],
    ["보조/바탕", readable.mutedOnCanvas, canvas.value],
    ["보조/면", readable.mutedOnSurface, surface.value],
    ["강조 글자/바탕", readable.accentText, canvas.value],
    ["행동 글자/행동색", readable.actionText, action.value],
    ["보조/색면", readable.mutedOnField, action.value],
    ["반전 글자/반전", canvas.value, text.value],
    ["보조/반전", readable.mutedOnInverse, text.value],
    ["강조 글자/반전", readable.accentOnInverse, text.value],
    ...backdropPairs(spec),
  ];
  const weak = pairs.filter(([, fg, bg]) => contrastRatio(fg, bg) < TEXT_CONTRAST);
  const bodyPx = remToPx(spec.typography.scale[0]!.size);
  // 라틴 서체는 웹폰트나 시스템 서체여야 하고, 한글은 대체 사슬의 한글 웹폰트가 맡아야 합니다.
  const fontOk = (["display", "body"] as const).every((role) => {
    const font = spec.typography[role];
    const family = font.family.trim();
    const latinOk = BARE_FAMILIES.has(family) || SYSTEM_FONTS.has(family) || family in WEB_FONTS;
    const koreanOk = KOREAN_WEB_FONTS.has(family) || font.fallback.split(",").some((name) => KOREAN_WEB_FONTS.has(name.trim()));
    return latinOk && koreanOk;
  });
  return [
    {
      name: "design-contrast",
      status: weak.length ? "fail" : "pass",
      severity: "error",
      detail: weak.length
        ? `명암비 ${TEXT_CONTRAST}:1 미만: ${weak.map(([label, fg, bg]) => `${label} ${contrastRatio(fg, bg).toFixed(2)}:1`).join(", ")}`
        : `글자 대비 ${pairs.length}종이 ${TEXT_CONTRAST}:1 이상입니다.`,
    },
    {
      name: "design-type-size",
      status: bodyPx !== null && bodyPx >= 15 ? "pass" : "fail",
      severity: "error",
      detail: `본문 단계 ${spec.typography.scale[0]!.size}${bodyPx === null ? "(크기를 읽지 못함)" : ` = ${bodyPx}px`}, 기준 15px 이상.`,
    },
    {
      name: "design-fonts",
      status: fontOk ? "pass" : "fail",
      severity: "error",
      detail: fontOk
        ? `제목·본문 서체를 싣습니다: ${spec.typography.display.family} · ${spec.typography.body.family}.`
        : `싣지 못하는 서체가 있거나 한글 대체 웹폰트가 없습니다: ${spec.typography.display.family}(${spec.typography.display.fallback}) · ${spec.typography.body.family}(${spec.typography.body.fallback}).`,
    },
  ];
}

/** 첫 화면 배경 위 글자마다 가장 낮은 대비가 나오는 바탕 표본을 대비 쌍으로 냅니다. */
function backdropPairs(spec: DesignSystemSpecV2): [string, string, string][] {
  const colors = backdropColors(spec);
  const worst = (foreground: string, samples: readonly string[]) =>
    samples.reduce((low, sample) => (contrastRatio(foreground, sample) < contrastRatio(foreground, low) ? sample : low));
  const name = { line: "선 배경", light: "빛 배경" } as const;
  return (["line", "light"] as const).flatMap((ink) => {
    const onCanvas = colors.canvas[ink];
    const onField = colors.field[ink];
    return [
      [`본문/${name[ink]}`, onCanvas.primary, worst(onCanvas.primary, onCanvas.samples)],
      [`보조/${name[ink]}`, onCanvas.muted, worst(onCanvas.muted, onCanvas.samples)],
      [`강조 글자/${name[ink]}`, onCanvas.accent, worst(onCanvas.accent, onCanvas.samples)],
      [`행동 글자/색면 ${name[ink]}`, onField.primary, worst(onField.primary, onField.samples)],
    ] as [string, string, string][];
  });
}

/** 첫 화면 배경의 부류입니다. line=선 · 점 · 줄무늬처럼 얇은 그림, light=넓게 번지는 빛. */
export type BackdropInk = "line" | "light";

/**
 * 배경 잉크를 바탕에 섞는 비율입니다. 배경은 이 세기를 넘는 색을 그리지 않습니다.
 * 값은 2026-10-28 견본(Clarity · Signal, 1440 · 390)을 눈으로 보고 정했습니다 — 선은 글자 뒤에서 거슬리지 않을 만큼, 빛은 바탕색이 바뀐 것을 알아볼 만큼입니다.
 */
export const BACKDROP_STRENGTH: Record<BackdropInk, number> = { line: 0.16, light: 0.34 };

/** 글자색 하나가 바탕 여럿 모두에서 기준을 넘도록 `toward` 쪽으로 가장 적게 섞은 색입니다. */
function ensureContrastAll(foreground: string, backgrounds: readonly string[], minimum: number, toward: string): string {
  for (let step = 0; step <= 50; step++) {
    const mixed = step ? mixHex(foreground, toward, step / 50) : foreground;
    if (backgrounds.every((background) => contrastRatio(mixed, background) >= minimum)) return mixed;
  }
  return toward;
}

/**
 * 배경이 그릴 수 있는 바탕색 표본입니다. 잉크는 투명에서 잉크색까지 번지고(radial-gradient · 선의 가장자리),
 * 빛 두 개는 겹쳐 그려지므로 두 잉크를 차례로 섞은 조합까지 봅니다.
 */
export function backdropSamples(background: string, inks: readonly string[]): string[] {
  const steps = Array.from({ length: 11 }, (_, index) => index / 10);
  const [first, second] = inks;
  if (!first) return [background];
  const once = steps.map((amount) => mixHex(background, first, amount));
  if (!second) return once;
  return once.flatMap((base) => steps.map((amount) => mixHex(base, second, amount)));
}

type BackdropPalette = {
  /** 잉크를 섞은 바탕색입니다. 장면 캔버스가 이 색을 바탕으로 칠합니다. */
  background: string;
  /** 잉크 두 개. 선 부류는 둘이 같습니다. 바탕에 세기만큼 섞은 불투명 색입니다. */
  inks: [string, string];
  /** 바탕에 섞은 비율. 본문 글자를 검정 · 흰색까지 진하게 해도 대비가 모자랄 때만 기본 세기보다 낮아집니다. */
  strength: number;
  /** 배경 위 첫 화면의 본문 · 보조 · 링크 글자색입니다. */
  primary: string;
  muted: string;
  accent: string;
  /** 대비를 잰 바탕색 표본입니다. */
  samples: string[];
};

function backdropPalette(background: string, raw: readonly [string, string], ink: BackdropInk, text: { primary: string; muted: string; accent: string }): BackdropPalette {
  const nominal = BACKDROP_STRENGTH[ink];
  // 본문 글자는 바탕에서 먼 쪽 끝(검정 · 흰색)으로, 보조 · 링크 글자는 본문 글자 쪽으로 섞습니다(readableColors와 같은 방향).
  const extreme = contrastRatio("#000000", background) > contrastRatio("#ffffff", background) ? "#000000" : "#ffffff";
  for (let strength = nominal; strength > 0; strength = Math.round((strength - 0.01) * 100) / 100) {
    const inks: [string, string] = [mixHex(background, raw[0], strength), mixHex(background, raw[1], strength)];
    const samples = backdropSamples(background, ink === "line" ? [inks[0]] : inks);
    if (!samples.every((sample) => contrastRatio(extreme, sample) >= TEXT_CONTRAST)) continue;
    const primary = ensureContrastAll(text.primary, samples, TEXT_CONTRAST, extreme);
    return {
      background,
      inks,
      strength,
      primary,
      muted: ensureContrastAll(text.muted, samples, TEXT_CONTRAST, primary),
      accent: ensureContrastAll(text.accent, samples, TEXT_CONTRAST, primary),
      samples,
    };
  }
  return { background, inks: [background, background], strength: 0, ...text, samples: [background] };
}

/**
 * 첫 화면 배경의 잉크와 그 위 글자색입니다. 바탕(canvas=지면 바탕, field=포스터 첫 화면의 행동색 면) × 부류마다 계산합니다.
 *
 * 지면 바탕에서 선 부류는 글자색을, 빛 부류는 강조색 · 행동색을 바탕에 섞습니다. 행동색 면에서는 글자색 · 바탕색 중
 * 행동 글자와 대비가 큰 쪽(선 · 빛)과 강조색(빛)을 섞습니다. 배경이 가장 짙은 자리에서도 본문 · 보조 · 링크 글자가 4.5:1을 넘게
 * 글자색을 진하게 합니다.
 */
export function backdropColors(spec: DesignSystemSpecV2) {
  const readable = readableColors(spec);
  const { canvas, text, accent, action } = spec.colors;
  const onCanvas = { primary: text.value, muted: readable.mutedOnCanvas, accent: readable.accentText };
  const onField = { primary: readable.actionText, muted: readable.actionText, accent: readable.actionText };
  // 행동색 면의 글자는 대비 여유가 적어, 잉크는 글자에서 먼 쪽 토큰(글자색 · 바탕색 중 행동 글자와 대비가 큰 것)으로 둡니다.
  const away = contrastRatio(text.value, readable.actionText) > contrastRatio(canvas.value, readable.actionText) ? text.value : canvas.value;
  return {
    canvas: {
      line: backdropPalette(canvas.value, [text.value, text.value], "line", onCanvas),
      light: backdropPalette(canvas.value, [accent.value, action.value], "light", onCanvas),
    },
    field: {
      line: backdropPalette(action.value, [away, away], "line", onField),
      light: backdropPalette(action.value, [away, accent.value], "light", onField),
    },
  };
}
