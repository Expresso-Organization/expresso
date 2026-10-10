import fs from "node:fs";
import { describe, it, expect } from "vitest";
import {
  PageLibrarySearchSchema,
  PageLibraryResultSchema,
  type StructuredPortfolioContent,
  type StructuredPortfolioSpec,
} from "@expresso/contracts";
import {
  searchPageLibrary,
  retrievePageLibrary,
  librarySelection,
  collectedBoundDetails,
  LIBRARY_TOTAL,
} from "./library.js";
import { renderStructuredPortfolio } from "./renderer.js";
const content: StructuredPortfolioContent = {
  version: 1,
  profile: {
    name: "가상 서연",
    role: "설계자",
    headline: "사용자 인터페이스를 설계합니다.",
    intro: "입력 설명",
    focus: ["접근성"],
  },
  sections: [
    {
      id: "a",
      title: "첫번째 프로젝트",
      summary: "프로젝트 설명",
      body: "입력 원문 <script>안전</script>",
      pattern: "project",
      details: Array.from({ length: 5 }, (_, i) => ({
        label: `항목 ${i}`,
        text: `설명 ${i}`,
      })),
      media: [],
      sourceIds: [],
    },
  ],
  career: [],
  evidence: [],
  contact: null,
};
const spec: StructuredPortfolioSpec = {
  root: "page",
  elements: {
    page: {
      type: "PortfolioPage",
      props: {
        profile: { $state: "/profile" },
        design: { layout: "library", palette: "ivory", font: "sans" },
        motion: "showcase",
        rationale: "원본 선택",
      },
      children: ["intro", "case"],
    },
    intro: {
      type: "NameIntro",
      props: {
        profile: { $state: "/profile" },
        sections: { $state: "/sections" },
      },
      children: [],
    },
    case: {
      type: "CaseTechnical",
      props: { section: { $state: "/sectionById/a" } },
      children: [],
    },
  },
};
const search = (extra: Record<string, unknown> = {}) =>
  searchPageLibrary(PageLibrarySearchSchema.parse({ limit: 100, ...extra }));
describe("전체 수집 라이브러리 연결", () => {
  it("읽기 쉬운 Registry 키와 기존 수집 ID를 같은 원본으로 해석한다", () => {
    const source = search({ slot: "intro", status: "renderable" }).items[0]!;
    const original = structuredClone(spec),
      alias = structuredClone(spec);
    Object.assign(original.elements.intro!.props, { sourceId: source.id });
    Object.assign(alias.elements.intro!.props, { sourceId: source.renderKey });
    expect(renderStructuredPortfolio(alias, content)).toEqual(
      renderStructuredPortfolio(original, content),
    );
    expect(librarySelection(alias).selected[0]?.id).toBe(source.id);
  });
  it("수집 원본과 모든 추가 목록의 ID를 빠짐없이 검색한다", () => {
    const dir = new URL("../../../docs/library/", import.meta.url);
    const read = (name: string) =>
      JSON.parse(fs.readFileSync(new URL(`${name}.json`, dir), "utf8"));
    const expected = new Set(
      [
        ...read("catalog").items,
        ...read("acquisitions").additions,
        ...read("curation").additions,
        ...read("componentry").additions,
      ].map((x) => x.id),
    );
    const actual = new Set<string>();
    for (let page = 1; actual.size < LIBRARY_TOTAL; page++) {
      const result = PageLibraryResultSchema.parse(search({ page }));
      result.items.forEach((i) => actual.add(i.id));
    }
    expect(actual).toEqual(expected);
    expect(
      search({ q: "componentry" }).items.filter(
        (item) => item.source === "componentry",
      ),
    ).toHaveLength(56);
    expect(search({ status: "asset" }).total).toBe(908);
  });
  it("실행 가능한 모든 원본에서 이름·입력 내용·안전한 HTML을 보존한다", () => {
    for (const item of search({ status: "renderable" }).items) {
      const next = structuredClone(spec),
        node = next.elements[item.slot === "intro" ? "intro" : "case"]!;
      if ("sourceId" in node.props) throw new Error("시험 초기 상태 오류");
      Object.assign(node.props, { sourceId: item.id });
      const result = renderStructuredPortfolio(next, content);
      expect(result.html, item.sourceItemId).toContain(
        `data-library-source="${item.id}"`,
      );
      expect(result.html).toContain("가상 서연");
      expect(result.html).toContain("입력 원문 &lt;script&gt;");
      expect(result.html).not.toMatch(
        /assets\.watermelon|unsplash|Sign in|Watermelon|<script>|<form|src=""/,
      );
      expect(result.html.match(/<h1\b/g)).toHaveLength(1);
      expect(result.css.length).toBeLessThan(512000);
    }
  });
  it("실행 권한·역할·원본 코드가 없는 ID는 저장 전에 거절한다", () => {
    for (const id of [
      "unknown",
      search({ status: "guidance" }).items[0]!.id,
      search({ slot: "section", status: "renderable" }).items[0]!.id,
    ]) {
      const next = structuredClone(spec);
      const intro = next.elements.intro!;
      if (intro.type === "NameIntro") intro.props.sourceId = id;
      expect(() => renderStructuredPortfolio(next, content)).toThrow(
        "사용할 수 없는",
      );
    }
  });
  it("모델 선택지에 전체 호환 목록을 제공하고 실제 선택 원본과 해시를 기록한다", () => {
    const choices = retrievePageLibrary(content);
    expect(choices.intro.length + choices.section.length).toBe(
      search({ status: "renderable" }).total,
    );
    const next = structuredClone(spec);
    const intro = next.elements.intro!;
    if (intro.type === "NameIntro") intro.props.sourceId = choices.intro[0]!.id;
    const selection = librarySelection(next);
    expect(selection.inventoryTotal).toBe(LIBRARY_TOTAL);
    expect(selection.selected[0]?.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});
// 근거·이미지가 있는 입력으로 사례 원본 하나를 그립니다.
const withSource = (
  sourceId: string,
  type: "CaseTechnical" | "CaseProcess" | "CaseEssay" = "CaseTechnical",
) => {
  const input = structuredClone(content);
  input.sections[0]!.sourceIds = ["e1"];
  input.sections[0]!.media = [
    { src: "data:image/png;base64,AA==", alt: "가상 이미지", origin: "fictional" },
  ];
  input.evidence = [
    { id: "e1", kind: "문서", title: "가상 근거 문서", summary: "요약", body: "본문" },
  ];
  const next = structuredClone(spec);
  (next.elements.page!.children as string[]).push("evidence");
  next.elements.evidence = {
    type: "EvidenceGrid",
    props: { evidence: { $state: "/evidence" } },
    children: [],
  };
  next.elements.case = {
    type,
    props: { section: { $state: "/sectionById/a" }, sourceId },
    children: [],
  };
  return renderStructuredPortfolio(next, input);
};
describe("수집 원본 렌더링 품질", () => {
  const sections = () =>
    search({ slot: "section", status: "renderable" }).items;
  it("원본을 고른 사례도 사례 유형별 항목 표현을 쓰고 원본에 연결한 항목은 반복하지 않는다", () => {
    for (const item of sections()) {
      const bound = collectedBoundDetails(item.id);
      const technical = withSource(item.id).html,
        process = withSource(item.id, "CaseProcess").html;
      expect(technical, item.sourceItemId).not.toMatch(/<dl\b|<dd\b/);
      for (let i = 0; i < 5; i++)
        expect(technical.split(`설명 ${i}`).length - 1, item.sourceItemId).toBe(1);
      if (bound < 5) {
        expect(technical, item.sourceItemId).toContain('class="sp-facts"');
        expect(process, item.sourceItemId).toContain('class="sp-steps"');
      }
      expect(technical).toContain(`sp-source-details sp-case-technical`);
    }
    expect(collectedBoundDetails("watermelon-feature-1")).toBe(5);
    expect(collectedBoundDetails("watermelon-feature-4")).toBe(3);
    expect(collectedBoundDetails("watermelon-card")).toBe(0);
  });
  it("원본의 샘플 수치로 그린 그래프와 글자를 지운 빈 샘플 상자를 출력하지 않는다", () => {
    const feature4 = withSource("watermelon-feature-4").html,
      feature1 = withSource("watermelon-feature-1").html;
    for (const sample of ["height:40%", "height:90%", "width:82%", "rotate-45"])
      expect(feature4).not.toContain(sample);
    expect(feature1).not.toContain("bg-white/80 px-2 py-1");
    // 입력 슬롯으로 연결한 제목과 설명은 남는다.
    expect(feature4).toContain("항목 0");
    expect(feature4).toContain("설명 2");
  });
  it("관련 자료 링크가 근거 항목의 제목을 표시한다", () => {
    for (const item of sections()) {
      const html = withSource(item.id).html;
      expect(html, item.sourceItemId).toContain('href="#source-e1"');
      expect(html).toContain("가상 근거 문서 ↗");
      expect(html).not.toMatch(/관련 자료 \d/);
    }
  });
  it("이미지가 있는 히어로는 이름과 자기 정의를 블러 판 하나로 묶는다", () => {
    const input = structuredClone(content);
    input.sections[0]!.media = [
      { src: "data:image/png;base64,AA==", alt: "가상 이미지", origin: "fictional" },
    ];
    for (const item of search({ slot: "intro", status: "renderable" }).items) {
      const next = structuredClone(spec);
      Object.assign(next.elements.intro!.props, { sourceId: item.id });
      const { html, css } = renderStructuredPortfolio(next, input);
      expect(html, item.sourceItemId).toMatch(
        /<div class="sp-source-nameplate"><h1[^>]*>가상 서연<\/h1><p class="sp-definition sp-source-definition">사용자 인터페이스를 설계합니다.<\/p><\/div>/,
      );
      expect(css).toContain("backdrop-filter:blur(");
    }
  });
  it("원본 레이어보다 낮은 레이어에 기본 규칙을 두어 원본 크기 유틸리티를 덮지 않는다", () => {
    const { css, html } = withSource("watermelon-book");
    // 먼저 선언한 레이어가 가장 낮은 우선순위를 갖습니다.
    expect(css.indexOf("@layer")).toBe(css.indexOf("@layer sp-source-base"));
    const reset = [...css.matchAll(/\.sp-source \*\{[^}]*min-width:0/g)];
    expect(reset).toHaveLength(1);
    const layer = css.indexOf("@layer sp-source-base");
    expect(reset[0]!.index).toBeGreaterThan(layer);
    expect(reset[0]!.index).toBeLessThan(css.indexOf("}}", layer));
    expect(html).toContain("min-w-[calc(var(--book-width))]");
  });
});
