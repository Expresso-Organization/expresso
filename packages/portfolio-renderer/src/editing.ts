import type {
  DesignSystemSpecV2,
  StructuredElementStyle,
  StructuredPortfolioSpec,
} from "@expresso/contracts";
import { z } from "zod";

import { structuredCatalog } from "./catalog.js";

/**
 * 편집 화면이 쓰는 요소 정의입니다. 렌더 결과를 바꾸지 않고, 요소를 고르고 고칠 칸을 정합니다.
 *
 * 요소 루트는 키트가 `data-xp-key`로 표시합니다. 글자 부분은 그 루트 기준 CSS 선택자로 정합니다. 마크업에 부분 속성을
 * 따로 달지 않으므로 키트 구성이 바뀌어도 선택자만 맞추면 됩니다. 키트에 부품을 더하면 이 표에도 한 줄을 더합니다
 * (`editing.test.ts`가 카탈로그와 이 표의 부품 목록을 맞춰 봅니다).
 */
export const ELEMENT_KEY_ATTRIBUTE = "data-xp-key";

export type StructuredPart = { label: string; selector: string };

const CASE_PARTS: Record<string, StructuredPart> = {
  title: { label: "제목", selector: ".xp-head .xp-h2" },
  summary: { label: "요약", selector: ".xp-head .xp-lead" },
  body: { label: "본문", selector: ".xp-case-body .xp-body" },
};

export const STRUCTURED_PARTS: Record<string, Record<string, StructuredPart>> = {
  NameIntro: {
    name: { label: "이름", selector: ".xp-name, .xp-poster-name, .xp-sentence-meta strong" },
    role: { label: "직무", selector: ".xp-hero > .xp-eyebrow, .xp-hero > div > .xp-eyebrow, .xp-hero-text > .xp-eyebrow, .xp-poster-role" },
    headline: { label: "한 문장 소개", selector: ".xp-headline, .xp-poster-line, .xp-sentence" },
    intro: { label: "소개 글", selector: ".xp-lead, .xp-poster-about-text, .xp-sentence-intro" },
  },
  ProjectIndex: {
    title: { label: "작업 제목", selector: "li strong, .xp-mosaic strong" },
    summary: { label: "작업 요약", selector: "li .xp-small:not(.xp-num), .xp-mosaic .xp-small:not(.xp-num)" },
  },
  CaseBeforeAfter: CASE_PARTS,
  CaseFlow: CASE_PARTS,
  CaseShowcase: CASE_PARTS,
  CaseEssay: CASE_PARTS,
  CaseGallery: CASE_PARTS,
  CaseTechnical: CASE_PARTS,
  CaseProcess: CASE_PARTS,
  ContentPanel: CASE_PARTS,
  CaseRow: {
    title: { label: "제목", selector: ".xp-row-title" },
    summary: { label: "요약", selector: ".xp-row-summary" },
    body: { label: "본문", selector: ".xp-row-body .xp-body" },
  },
  MetricStrip: {
    value: { label: "수치", selector: ".xp-metric-value" },
    label: { label: "수치 이름", selector: ".xp-metric-label" },
  },
  PullQuote: {
    quote: { label: "인용", selector: ".xp-quote-text" },
  },
  CareerTimeline: {
    organization: { label: "조직", selector: ".xp-timeline .xp-h3" },
    body: { label: "설명", selector: ".xp-timeline .xp-body" },
  },
  EvidenceGrid: {
    title: { label: "자료 제목", selector: ".xp-evidence-list summary strong" },
  },
  Contact: {
    heading: { label: "제목", selector: ".xp-contact .xp-h2" },
  },
};

/** 부품과 선택지의 화면 이름입니다. 표에 없는 값은 값 그대로 보입니다. */
export const STRUCTURED_TYPE_LABELS: Record<string, string> = {
  PortfolioPage: "페이지",
  NameIntro: "첫 화면",
  ProjectIndex: "작업 목차",
  CaseBeforeAfter: "전후 비교",
  CaseFlow: "과정 흐름",
  CaseShowcase: "대표 이미지",
  CaseEssay: "기사형 사례",
  CaseGallery: "이미지 전시",
  CaseTechnical: "기술 설명",
  CaseProcess: "과정형 사례",
  ContentPanel: "내용 패널",
  CaseRow: "목록 행",
  MetricStrip: "수치 띠",
  PullQuote: "큰 인용",
  CareerTimeline: "경력",
  EvidenceGrid: "근거 자료",
  Contact: "연락처",
  Columns: "두 열 묶음",
  Grid: "같은 폭 묶음",
  Band: "띠 묶음",
};

const PROP_LABELS: Record<string, string> = {
  variant: "구도",
  scale: "크기",
  surface: "배경",
  width: "폭",
};

const OPTION_LABELS: Record<string, Record<string, string>> = {
  variant: {
    statement: "큰 문장",
    split: "좌우 분할",
    media: "이미지 중심",
    poster: "포스터",
    sentence: "문장 중심",
    rows: "목록",
    mosaic: "타일",
    rail: "측면 목차",
    even: "같은 폭",
    "wide-start": "왼쪽 넓게",
    "wide-end": "오른쪽 넓게",
    panel: "면 배경",
    accent: "강조선",
  },
  scale: { lead: "크게", standard: "보통", compact: "작게" },
  surface: { canvas: "기본", field: "색 면", inverse: "반전" },
  width: { content: "본문 폭", bleed: "창 폭 전체" },
};

export const STYLE_COLOR_LABELS: Record<string, string> = { text: "본문색", muted: "흐린색", accent: "강조색" };
export const STYLE_FONT_LABELS: Record<string, string> = { display: "제목 서체", body: "본문 서체", mono: "고정폭 서체" };

export type EditableOption = { value: string; label: string };
export type EditableField = { name: string; label: string; options: EditableOption[]; optional: boolean };

/** zod 스키마에서 선택지(enum)를 읽습니다. optional로 감싼 enum도 읽습니다. */
function enumValues(schema: z.ZodType): { values: string[]; optional: boolean } | null {
  let current: z.ZodType = schema;
  let optional = false;
  while (current instanceof z.ZodOptional) {
    optional = true;
    current = current.unwrap() as z.ZodType;
  }
  if (current instanceof z.ZodEnum) return { values: current.options.map(String), optional };
  return null;
}

/**
 * 부품의 모양 선택지를 카탈로그에서 읽습니다. 카탈로그 props 가운데 선택지가 정해진 칸(구도 · 크기 · 배경 · 폭)만 돌려줍니다.
 * 수집 원본(`sourceId`)과 데이터 바인딩은 편집 칸이 아닙니다.
 */
export function editableFields(type: string): EditableField[] {
  const component = (structuredCatalog.data.components as Record<string, { props: z.ZodType } | undefined>)[type];
  if (!component || !(component.props instanceof z.ZodObject)) return [];
  const shape = component.props.shape as Record<string, z.ZodType>;
  return Object.entries(shape).flatMap(([name, schema]) => {
    const found = enumValues(schema);
    if (!found) return [];
    return [{
      name,
      label: PROP_LABELS[name] ?? name,
      optional: found.optional,
      options: found.values.map((value) => ({ value, label: OPTION_LABELS[name]?.[value] ?? value })),
    }];
  });
}

/** 디자인 시스템의 글자 크기 단계입니다. 작은 것부터입니다. */
export function typeSteps(design: DesignSystemSpecV2): { name: string; size: string }[] {
  return design.typography.scale.map((step) => ({ name: step.name, size: step.size }));
}

/**
 * 요소 style이 그 부품의 부분과 디자인의 단계만 쓰는지 봅니다. 문제 문장 목록을 돌려줍니다(없으면 빈 배열).
 */
export function styleProblems(type: string, style: StructuredElementStyle | undefined, design: DesignSystemSpecV2): string[] {
  if (!style) return [];
  const parts = STRUCTURED_PARTS[type] ?? {};
  const steps = new Set(design.typography.scale.map((step) => step.name));
  return Object.entries(style).flatMap(([part, value]) => [
    ...(parts[part] ? [] : [`${STRUCTURED_TYPE_LABELS[type] ?? type}에는 '${part}' 부분이 없습니다.`]),
    ...(value.size && !steps.has(value.size) ? [`글자 크기 '${value.size}'는 이 디자인의 단계가 아닙니다.`] : []),
  ]);
}

const COLOR_VALUES: Record<string, string> = {
  // 색 면 · 반전 배경은 --xp-on을 정합니다. 그 위에서는 본문색이 면에 맞춰 뒤집힙니다.
  text: "var(--xp-on,var(--text))",
  muted: "var(--xp-muted)",
  accent: "var(--xp-accent-text)",
};

/** 요소 style을 CSS 규칙으로 바꿉니다. 선택자는 요소 키로 좁혀 그 요소 안에서만 적용합니다. */
export function elementStyleCss(spec: StructuredPortfolioSpec): string {
  const rules: string[] = [];
  for (const [key, node] of Object.entries(spec.elements)) {
    const style = (node.props as { style?: StructuredElementStyle }).style;
    if (!style) continue;
    const parts = STRUCTURED_PARTS[node.type] ?? {};
    for (const [name, value] of Object.entries(style)) {
      const part = parts[name];
      if (!part) continue;
      const declarations = [
        value.color ? `color:${COLOR_VALUES[value.color]}` : "",
        value.font ? `font-family:var(--font-${value.font})` : "",
        // 큰 단계가 좁은 화면에서 넘치지 않게 화면 폭으로 한 번 더 막습니다.
        value.size ? `font-size:min(var(--type-${value.size}),11vw);line-height:var(--line-${value.size})` : "",
      ].filter(Boolean);
      if (declarations.length)
        rules.push(`.xp-page [${ELEMENT_KEY_ATTRIBUTE}="${key}"] :is(${part.selector}){${declarations.join(";")}}`);
    }
  }
  return rules.join("\n");
}
