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
