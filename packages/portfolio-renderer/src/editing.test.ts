import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DesignSystemSpecV2Schema,
  STRUCTURED_GROUP_TYPES,
  type StructuredPortfolioContent,
} from "@expresso/contracts";

import { structuredCatalog } from "./catalog.js";
import { STRUCTURED_PARTS, STRUCTURED_TYPE_LABELS, editableFields, elementStyleCss, styleProblems } from "./editing.js";
import { renderStructuredPortfolio } from "./renderer.js";

const designs = JSON.parse(readFileSync(new URL("./fixtures/designs.json", import.meta.url), "utf8"));
const clarity = DesignSystemSpecV2Schema.parse(designs.clarity);

const content: StructuredPortfolioContent = {
  version: 1,
  profile: { name: "가상 인물", role: "엔지니어", headline: "경로를 설계합니다.", intro: "소개", focus: [] },
  sections: [
    {
      id: "a",
      title: "경로 재설계",
      summary: "우회 계획",
      body: "본문",
      pattern: "project",
      details: [],
      media: [],
      sourceIds: [],
      quote: "막히면 돌아갑니다.",
      metrics: [{ label: "지연", value: "24분" }, { label: "정지", value: "3회" }],
    },
  ],
  career: [],
  evidence: [],
  contact: { label: "메일", href: "mailto:a@example.com" },
};

const spec = {
  root: "page",
  elements: {
    page: {
      type: "PortfolioPage",
      props: { profile: { $state: "/profile" }, design: { layout: "editorial" }, motion: "showcase", rationale: "근거" },
      children: ["intro", "metrics", "group-1", "contact"],
    },
    intro: { type: "NameIntro", props: { profile: { $state: "/profile" }, variant: "statement" }, children: [] },
    metrics: { type: "MetricStrip", props: { sections: { $state: "/sections" } }, children: [] },
    "group-1": { type: "Band", props: { variant: "panel" }, children: ["section-a", "quote-1"] },
    "section-a": {
      type: "CaseEssay",
      props: { section: { $state: "/sectionById/a" }, style: { title: { color: "accent", size: clarity.typography.scale.at(-1)!.name } } },
      children: [],
    },
    "quote-1": { type: "PullQuote", props: { section: { $state: "/sectionById/a" } }, children: [] },
    contact: { type: "Contact", props: { contact: { $state: "/contact" } }, children: [] },
  },
};

describe("편집용 요소 표시", () => {
  it("요소마다 최상위 DOM에 Spec 키를 단다", () => {
    const { html } = renderStructuredPortfolio(spec, content, { design: clarity });
    for (const key of ["intro", "metrics", "group-1", "section-a", "quote-1", "contact"])
      expect(html).toContain(`data-xp-key="${key}"`);
    // 내부 키는 props에만 있고 마크업 속성으로 새지 않습니다.
    expect(html).not.toContain("xpKey");
  });

  it("요소 style을 그 요소 안으로 좁힌 규칙으로 바꾼다", () => {
    const { css } = renderStructuredPortfolio(spec, content, { design: clarity });
    const step = clarity.typography.scale.at(-1)!.name;
    expect(css).toContain(`.xp-page [data-xp-key="section-a"] :is(.xp-head .xp-h2){color:var(--xp-accent-text);font-size:min(var(--type-${step}),11vw);line-height:var(--line-${step})}`);
    expect(elementStyleCss({ root: "page", elements: { page: spec.elements.page } } as never)).toBe("");
  });

  it("없는 부분 · 없는 단계를 문제로 돌려준다", () => {
    expect(styleProblems("CaseEssay", { title: { size: clarity.typography.scale[0]!.name } }, clarity)).toEqual([]);
    expect(styleProblems("CaseEssay", { quote: {} }, clarity)).toEqual(["기사형 사례에는 'quote' 부분이 없습니다."]);
    expect(styleProblems("PullQuote", { quote: { size: "giant" } }, clarity)).toEqual(["글자 크기 'giant'는 이 디자인의 단계가 아닙니다."]);
  });
});

describe("카탈로그에서 읽는 편집 칸", () => {
  const leaves = Object.keys(structuredCatalog.data.components).filter(
    (type) => type !== "PortfolioPage" && !(STRUCTURED_GROUP_TYPES as readonly string[]).includes(type),
  );

  it("카탈로그의 모든 부품에 이름과 글자 부분이 있다", () => {
    for (const type of leaves) {
      expect(STRUCTURED_TYPE_LABELS[type], type).toBeTruthy();
      expect(Object.keys(STRUCTURED_PARTS[type] ?? {}).length, type).toBeGreaterThan(0);
    }
  });

  it("선택지가 정해진 props만 편집 칸으로 낸다", () => {
    expect(editableFields("CaseEssay").map((field) => field.name)).toEqual(["scale", "surface", "width"]);
    const intro = editableFields("NameIntro");
    expect(intro.map((field) => field.name)).toEqual(["variant", "backdrop"]);
    expect(intro[0]!.options.find((option) => option.value === "split")?.label).toBe("좌우 분할");
    expect(editableFields("Columns")[0]!.options.map((option) => option.value)).toEqual(["even", "wide-start", "wide-end"]);
    expect(editableFields("Contact")).toEqual([]);
  });
});
