import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DesignSystemSpecV2Schema, type StructuredPortfolioContent } from "@expresso/contracts";
import { renderStructuredPortfolio } from "../renderer.js";
import { barScale } from "./bars.js";
import { parsePeriod, readablePeriods } from "./period.js";

const designs = JSON.parse(readFileSync(new URL("../fixtures/designs.json", import.meta.url), "utf8"));
const clarity = DesignSystemSpecV2Schema.parse(designs.clarity);
const now = new Date(Date.UTC(2026, 9, 28));
const month = (year: number, value: number) => year * 12 + value - 1;

describe("기간 글자 읽기", () => {
  it("연 · 월 구간, 열린 구간, 연도만 적힌 구간을 월 단위로 읽고 원문 조각을 남긴다", () => {
    expect(parsePeriod("2024.04 — 2024.11", now)).toEqual({ start: month(2024, 4), end: month(2024, 11), open: false, startText: "2024.04", endText: "2024.11" });
    expect(parsePeriod("2023.03 — 현재", now)).toEqual({ start: month(2023, 3), end: month(2026, 10), open: true, startText: "2023.03", endText: "현재" });
    expect(parsePeriod("2021년 3월 ~ 2022년", now)).toMatchObject({ start: month(2021, 3), end: month(2022, 12), startText: "2021년 3월", endText: "2022년" });
    expect(parsePeriod("2022 – 현재", now)).toMatchObject({ start: month(2022, 1), open: true });
    expect(parsePeriod("2024-05", now)).toMatchObject({ start: month(2024, 5), end: month(2024, 5) });
    expect(parsePeriod("2024 - 2025", now)).toMatchObject({ start: month(2024, 1), end: month(2025, 12) });
  });

  it("연도가 없거나 끝이 시작보다 앞서거나 월이 틀리면 읽지 않는다", () => {
    for (const text of ["6개월", "", undefined, "2025.09 — 2024.01", "2024.13 — 2025.01", "⟦3⟧"]) expect(parsePeriod(text, now)).toBeNull();
    expect(readablePeriods(["2024.04 — 2024.11", "6개월", "2023.03 — 현재"], now)).toBe(2);
  });
});

describe("막대 비율", () => {
  const metric = (value: string) => ({ label: "-", value });
  it("같은 단위는 가장 큰 값을 100%로, %는 0–100% 눈금으로 둔다", () => {
    expect(barScale([metric("5년"), metric("5년"), metric("2년")])).toEqual({ mode: "relative", widths: ["100%", "100%", "40%"] });
    expect(barScale([metric("92%"), metric("30%")])).toEqual({ mode: "percent", widths: ["92%", "30%"] });
    expect(barScale([metric("1,200만 건"), metric("300만 건")])).toEqual({ mode: "relative", widths: ["100%", "25%"] });
  });
  it("단위가 다르거나 숫자로 시작하지 않거나 하나뿐이면 비교하지 않는다", () => {
    expect(barScale([metric("1.9초"), metric("180KB")])).toBeNull();
    expect(barScale([metric("약 3배"), metric("2배")])).toBeNull();
    expect(barScale([metric("5년")])).toBeNull();
  });
});

const content: StructuredPortfolioContent = {
  version: 1,
  profile: { name: "가상 인물", role: "프론트엔드 엔지니어", headline: "빠른 화면을 만듭니다.", intro: "", focus: [] },
  sections: [
    {
      id: "a",
      title: "상세 페이지 전환",
      summary: "App Router 전환",
      body: "전환했습니다.",
      pattern: "project",
      period: "2024.04 — 2024.11",
      details: [],
      media: [],
      sourceIds: [],
    },
    {
      id: "b",
      title: "디자인 시스템 구축",
      summary: "공통 컴포넌트 정리",
      body: "",
      pattern: "project",
      period: "2023.06 — 2024.03",
      details: [],
      media: [],
      sourceIds: [],
      metrics: [
        { label: "TypeScript", value: "5년" },
        { label: "React", value: "5년" },
        { label: "Next.js", value: "2년", note: "App Router" },
      ],
    },
  ],
  career: [
    { id: "c1", organization: "모아마켓", role: "프론트엔드 엔지니어", period: "2023.03 — 현재", description: "상품 상세 담당" },
    { id: "c2", organization: "리듬노트", role: "주니어 개발자", period: "2021.01 — 2023.02", description: "정산 표 담당" },
  ],
  evidence: [],
  contact: null,
};

function pageSpec(index: string, career: Record<string, unknown>, barsType = "CaseBars") {
  return {
    root: "page",
    elements: {
      page: {
        type: "PortfolioPage",
        props: { profile: { $state: "/profile" }, design: { layout: "dossier" }, motion: "none", rationale: "-" },
        children: ["intro", "index", "section-a", "section-b", "career"],
      },
      intro: { type: "NameIntro", props: { profile: { $state: "/profile" }, sections: { $state: "/sections" } }, children: [] },
      index: { type: "ProjectIndex", props: { sections: { $state: "/sections" }, variant: index }, children: [] },
      "section-a": { type: "CaseEssay", props: { section: { $state: "/sectionById/a" } }, children: [] },
      "section-b": { type: barsType, props: { section: { $state: "/sectionById/b" } }, children: [] },
      career: { type: "CareerTimeline", props: { career: { $state: "/career" }, ...career }, children: [] },
    },
  };
}

const render = (spec: unknown, value: StructuredPortfolioContent = content) => renderStructuredPortfolio(spec, value, { design: clarity, now }).html;
// 지면에 보이는 글자만 남깁니다. 속성 값(막대 너비 등)은 지면의 숫자가 아닙니다.
const visibleText = (html: string) => html.replace(/<[^>]+>/g, " ");

describe("차트 부품", () => {
  it("막대 차트는 같은 단위 수치를 막대로 그리고 값 글자는 받은 그대로 둔다", () => {
    const html = render(pageSpec("rows", {}));
    expect(html).toContain('data-case-type="bars"');
    expect(html).toContain('class="xp-barlist" data-bars="relative"');
    expect(html).toContain("--w:40%");
    expect(html).toContain("App Router");
  });

  it("목차 기간 차트와 경력 기간 차트는 기간 막대를 그리고, 축에는 원문 조각만 적는다", () => {
    const html = render(pageSpec("timeline", { variant: "chart" }));
    expect(html).toContain('data-variant="timeline"');
    expect(html).toContain('data-variant="chart"');
    expect(html.match(/class="xp-period-bar"/g)).toHaveLength(4);
    expect(html).toContain("data-open");
    expect(html).toContain('href="#section-a"');
    // 원문에 없는 숫자(연도 눈금 · 개월 수)를 찍지 않습니다.
    const source = JSON.stringify(content);
    for (const number of visibleText(html).match(/\d[\d.,]*/g) ?? []) expect(source).toContain(number);
  });

  it("기간을 두 개 이상 읽지 못하면 목록으로, 옛 저장본의 경력은 목록으로 그린다", () => {
    const sparse: StructuredPortfolioContent = {
      ...content,
      sections: content.sections.map((section, index) => (index ? { ...section, period: "6개월" } : section)),
      career: content.career.map((item, index) => (index ? { ...item, period: "" } : item)),
    };
    const html = render(pageSpec("timeline", { variant: "chart" }), sparse);
    expect(html).toContain('data-variant="rows"');
    expect(html).not.toContain("xp-period");
    expect(html).toContain('class="xp-timeline"');
    expect(render(pageSpec("rows", {}))).toContain('class="xp-timeline"');
  });

  it("단위가 다른 수치는 막대 없이 이름과 값만 그린다", () => {
    const mixed: StructuredPortfolioContent = {
      ...content,
      sections: content.sections.map((section) => (section.metrics ? { ...section, metrics: [{ label: "LCP", value: "1.9초" }, { label: "JS", value: "180KB" }] } : section)),
    };
    const html = render(pageSpec("rows", {}), mixed);
    expect(html).toContain('data-bars="neutral"');
    expect(html).not.toContain("xp-barlist-fill");
  });
});
