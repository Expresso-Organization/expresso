import type { PageRenderDefect, StructuredPortfolioContent } from "@expresso/contracts";

/** 생성 중 측정과 개발 검사 스크립트가 함께 쓰는 너비입니다. 폰 · 태블릿 가로 · 데스크톱입니다. */
export const RENDER_MEASURE_WIDTHS = [390, 926, 1440] as const;

/** 페이지 한 너비에서 잰 값입니다. `inspectRenderedPage`가 페이지 안에서 만듭니다. */
export interface RenderMeasurement {
  overflow: boolean;
  brokenImages: number;
  missingAnchors: string[];
  h1: number;
  nameSize: number;
  headlineSize: number | null;
  introMotion: string;
  hiddenCases: number;
  /** 요소 묶음은 `id` 속성이 있는 가장 가까운 조상의 ID입니다(사례 · 소개 · 목차 · 연락처). */
  stretchedTags: { element: string | null; text: string }[];
  overlappedCaptions: { element: string | null; text: string }[];
  orphans: { element: string | null; text: string }[];
  escaped: { element: string | null; text: string }[];
  casesWithImage: string[];
  caseNumbers: string[];
  displayFamily: string;
  bodyFamily: string;
  loadedFamilies: string[];
  contrast: { element: string | null; text: string; ratio: number; min: number }[];
  /** 지면에 보이는 글 전체입니다. 본문 누락 판정에 씁니다. */
  text: string;
}

/**
 * 지연 적재 이미지와 웹폰트가 들어올 때까지 기다립니다. 줄바꿈과 칸 폭이 서체 · 이미지 크기에 따라 달라지므로 측정 전에 부릅니다.
 * `inspectRenderedPage`처럼 페이지 안에서 돌기 때문에 바깥 참조가 없습니다.
 */
export async function settleRenderedPage(): Promise<void> {
  for (const image of document.images) {
    image.loading = "eager";
    await image.decode().catch(() => undefined);
  }
  await document.fonts.ready;
}

/**
 * 페이지 안에서 도는 측정입니다.
 *
 * Playwright가 이 함수를 문자열로 보내 페이지에서 실행하므로 바깥 변수나 import를 참조하지 않습니다.
 * 결과는 직렬화할 수 있는 값만 돌려줍니다.
 */
export function inspectRenderedPage(): RenderMeasurement {
  const owner = (node: Element) => node.closest(".xp-inner [id]")?.id ?? null;
  const snippet = (node: Element) => (node.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
  const firstFamily = (value: string) => value.split(",")[0]!.trim().replace(/^["']|["']$/g, "");
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  const rgba = (color: string) => {
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = color;
    context.fillRect(0, 0, 1, 1);
    return [...context.getImageData(0, 0, 1, 1).data];
  };
  const luminance = (p: number[]) =>
    p.slice(0, 3).map((x) => x / 255).map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)).reduce((sum, x, i) => sum + x * [0.2126, 0.7152, 0.0722][i]!, 0);
  // 글자 뒤의 실제 바탕색: 불투명한 배경을 가진 가장 가까운 조상입니다. 배경 이미지가 있으면 판단하지 않습니다.
  const backdrop = (node: Element) => {
    for (let current: Element | null = node; current; current = current.parentElement) {
      const style = getComputedStyle(current);
      if (style.backgroundImage !== "none") return null;
      const color = rgba(style.backgroundColor);
      if (color[3]! >= 250) return color;
    }
    return rgba(getComputedStyle(document.body).backgroundColor);
  };
  const page = document.querySelector(".xp-page")!;
  const textNodes: Text[] = [];
  const walker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null)
    if (node.textContent!.trim() && node.parentElement!.getClientRects().length) textNodes.push(node);
  const contrast: RenderMeasurement["contrast"] = [];
  for (const parent of new Set(textNodes.map((node) => node.parentElement!))) {
    if (parent.closest("figure,svg,summary ~ *")) continue;
    const style = getComputedStyle(parent);
    if (style.visibility === "hidden" || Number(style.opacity) === 0) continue;
    const bg = backdrop(parent);
    if (!bg) continue;
    const a = luminance(rgba(style.color)), b = luminance(bg);
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    const size = parseFloat(style.fontSize), bold = Number(style.fontWeight) >= 700;
    const min = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
    if (ratio < min) contrast.push({ element: owner(parent), text: snippet(parent), ratio: Number(ratio.toFixed(2)), min });
  }
  // 한 글자만 다음 줄로 넘어간 줄바꿈입니다. 글자마다 줄 위치를 재서 마지막 줄의 글자 수를 셉니다.
  const orphans: RenderMeasurement["orphans"] = [];
  for (const element of document.querySelectorAll(".xp-page :is(h1,h2,h3,.xp-headline,.xp-lead,p,strong,dt,dd,li>a,summary>strong)")) {
    const text = element.textContent!.trim();
    if ([...text].length < 4 || element.querySelector("p,div,li,ul,ol")) continue;
    const lines = new Map<number, number>();
    const tw = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = tw.nextNode() as Text | null; node; node = tw.nextNode() as Text | null) {
      for (let i = 0; i < node.length; i++) {
        if (!node.textContent![i]!.trim()) continue;
        const range = document.createRange();
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const rect = range.getClientRects()[0];
        if (!rect) continue;
        const top = Math.round(rect.top);
        const key = [...lines.keys()].find((value) => Math.abs(value - top) < rect.height / 2) ?? top;
        lines.set(key, (lines.get(key) ?? 0) + 1);
      }
    }
    const counts = [...lines.entries()].sort((x, y) => x[0] - y[0]).map(([, count]) => count);
    if (counts.length > 1 && counts.at(-1) === 1) orphans.push({ element: owner(element), text: snippet(element) });
  }
  // 단 이탈: 지면 안쪽 폭을 넘어 그려진 요소입니다. 바깥으로 넓게 깔도록 표시한 요소(`data-bleed`)는 뺍니다.
  const inner = document.querySelector(".xp-inner")!.getBoundingClientRect();
  const escapedNodes = [...document.querySelectorAll(".xp-inner *")].filter((node) => {
    const rect = node.getBoundingClientRect();
    return rect.width && (rect.right > inner.right + 1 || rect.left < inner.left - 1) && !node.closest("[hidden],details:not([open]) > :not(summary),[data-bleed]");
  });
  // 바깥 요소가 넘치면 안쪽 요소도 함께 넘치므로, 넘친 요소의 안쪽은 따로 세지 않습니다.
  const escaped = escapedNodes.filter((node) => !escapedNodes.some((other) => other !== node && other.contains(node))).slice(0, 8).map((node) => ({ element: owner(node), text: snippet(node) || node.tagName.toLowerCase() }));
  const h1 = document.querySelector("h1")!;
  const headline = document.querySelector(".xp-headline");
  const bodyText = document.querySelector(".xp-body p, .xp-lead") ?? h1;
  const loaded = [...document.fonts].filter((face) => face.status === "loaded").map((face) => face.family.replace(/^["']|["']$/g, ""));
  return {
    overflow: document.documentElement.scrollWidth > innerWidth + 1,
    brokenImages: [...document.images].filter((image) => !image.naturalWidth).length,
    missingAnchors: [...document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')].filter((link) => !document.getElementById(link.hash.slice(1))).map((link) => link.hash),
    h1: document.querySelectorAll("h1").length,
    nameSize: parseFloat(getComputedStyle(h1).fontSize),
    headlineSize: headline ? parseFloat(getComputedStyle(headline).fontSize) : null,
    introMotion: getComputedStyle(document.querySelector("#intro") ?? h1).animationName,
    hiddenCases: [...document.querySelectorAll("[data-case-type]")].filter((node) => Number(getComputedStyle(node).opacity) < 1).length,
    // 태그는 한 줄짜리 항목입니다. 줄 높이의 두 배를 넘게 늘어났으면 격자 행에 끌려 늘어난 것입니다.
    stretchedTags: [...document.querySelectorAll(".xp-tags li")].filter((node) => node.getBoundingClientRect().height > parseFloat(getComputedStyle(node).lineHeight) * 2 + 24).slice(0, 5).map((node) => ({ element: owner(node), text: snippet(node) })),
    // 그림 설명이 그림 상자 밖으로 밀려 다음 요소와 겹친 곳입니다.
    overlappedCaptions: [...document.querySelectorAll(".xp-figure figcaption")].filter((caption) => {
      const next = caption.closest(".xp-figure")?.nextElementSibling;
      if (!next || !caption.getClientRects().length) return false;
      return caption.getBoundingClientRect().bottom > next.getBoundingClientRect().top + 1;
    }).map((caption) => ({ element: owner(caption), text: snippet(caption) })),
    casesWithImage: [...document.querySelectorAll("[data-case-type]")].filter((node) => node.querySelector("img")).map((node) => node.id),
    caseNumbers: [...document.querySelectorAll(".xp-case .xp-head .xp-num")].map((node) => node.textContent ?? ""),
    displayFamily: firstFamily(getComputedStyle(h1).fontFamily),
    bodyFamily: firstFamily(getComputedStyle(bodyText).fontFamily),
    loadedFamilies: [...new Set(loaded)],
    contrast,
    orphans,
    escaped,
    text: (page.textContent ?? "").replace(/\s+/g, " "),
  };
}

/** 측정에서 나온 결함 하나입니다. 형태는 계약(`PageRenderDefectSchema`)이 정합니다. */
export type RenderDefect = PageRenderDefect;

// 웹폰트를 불러오지 않는 시스템 서체입니다. 이 서체는 적재 여부를 검사하지 않습니다.
const SYSTEM_FAMILIES = new Set(["system-ui", "-apple-system", "ui-monospace", "monospace", "sans-serif", "serif", "georgia", "helvetica", "arial"]);
const normalize = (value: unknown) => String(value).replace(/[^\p{L}\p{N}@]/gu, "").toLowerCase();

/** 지면에 보여야 하는 내용 값입니다. 하나라도 지면 글에 없으면 렌더러가 내용을 빠뜨린 것입니다. */
export function renderedContentValues(content: StructuredPortfolioContent): string[] {
  return [
    ...Object.values(content.profile).flat(),
    ...content.sections.flatMap((section) => [section.title, section.summary, section.body, ...section.details.flatMap((item) => [item.label, item.text])]),
    ...content.career.flatMap((item) => [item.period, item.organization, item.role, item.description]),
    ...content.evidence.flatMap((item) => [item.title, item.kind, item.summary, item.body]),
  ].filter((value): value is string => typeof value === "string" && value.trim() !== "");
}

/** 너비별 측정값을 결함 목록으로 바꿉니다. 판정 기준은 개발 검사 스크립트(`verify-token-kit.mjs`)와 같습니다. */
export function renderDefects(
  measurements: readonly { width: number; measurement: RenderMeasurement }[],
  content: StructuredPortfolioContent,
): RenderDefect[] {
  const defects: RenderDefect[] = [];
  const values = renderedContentValues(content);
  for (const { width, measurement: m } of measurements) {
    const add = (kind: RenderDefect["kind"], element: string | null, detail: string, fixable: boolean) => defects.push({ kind, width, element, detail, fixable });
    if (m.overflow) add("overflow", null, "지면이 화면 너비보다 넓어 가로로 스크롤됩니다.", true);
    for (const item of m.orphans) add("orphan", item.element, `"${item.text}"의 마지막 줄에 한 글자만 남습니다.`, true);
    for (const item of m.escaped) add("escaped", item.element, `"${item.text}"이 지면 안쪽 폭을 넘어 그려집니다.`, true);
    for (const item of m.overlappedCaptions) add("caption-overlap", item.element, `그림 설명 "${item.text}"이 다음 요소와 겹칩니다.`, true);
    for (const item of m.stretchedTags) add("stretched-tag", item.element, `태그 "${item.text}"이 격자 행 높이에 끌려 늘어납니다.`, true);
    for (const section of content.sections)
      if (section.media.length && !m.casesWithImage.includes(`section-${section.id}`))
        add("missing-image", `section-${section.id}`, "이미지가 있는 자료인데 사례에 이미지가 보이지 않습니다.", true);
    for (const item of m.contrast) add("contrast", item.element, `"${item.text}"의 글자 대비가 ${item.ratio}:1로 기준 ${item.min}:1보다 낮습니다.`, false);
    for (const family of new Set([m.displayFamily, m.bodyFamily]))
      if (!SYSTEM_FAMILIES.has(family.toLowerCase()) && !m.loadedFamilies.includes(family)) add("font", null, `서체 ${family}가 적재되지 않았습니다.`, false);
    if (m.brokenImages) add("broken-image", null, `이미지 ${m.brokenImages}개를 불러오지 못했습니다.`, false);
    for (const hash of m.missingAnchors) add("missing-anchor", null, `링크 ${hash}의 대상이 없습니다.`, false);
    const expected = m.caseNumbers.map((_, index) => String(index + 1).padStart(2, "0"));
    if (m.caseNumbers.join() !== expected.join()) add("case-number", null, `사례 번호가 ${m.caseNumbers.join(" · ")} 순서입니다.`, false);
    const text = normalize(m.text);
    for (const value of values) if (!text.includes(normalize(value))) add("missing-text", null, `내용 "${value.slice(0, 40)}"이 지면에 없습니다.`, false);
  }
  return defects;
}

/** 구성으로 고칠 결함을 모델이 읽을 수정 요청 문장으로 만듭니다. 같은 요소의 같은 결함은 너비를 묶어 한 줄로 씁니다. */
export function describeRenderDefects(defects: readonly RenderDefect[]): string {
  const lines = new Map<string, number[]>();
  for (const defect of defects.filter((item) => item.fixable)) {
    const key = `${defect.element ? `${defect.element}: ` : ""}${defect.detail}`;
    lines.set(key, [...(lines.get(key) ?? []), defect.width]);
  }
  return [
    "직전 Spec을 그린 지면을 브라우저에서 잰 결과 아래 결함이 있습니다. 내용은 그대로 두고 구성(첫 화면 구도, 사례 유형, 컨테이너, 목차 형태)만 바꿔 결함이 생기지 않게 하세요. 결함이 없는 요소의 구성은 유지합니다.",
    ...[...lines].map(([line, widths]) => `- ${widths.map((width) => `${width}px`).join(" · ")} ${line}`),
  ].join("\n");
}
