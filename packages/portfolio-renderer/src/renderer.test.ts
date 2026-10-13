import { describe, expect, it } from "vitest";
import { renderStructuredPortfolio, StructuredRenderError } from "./renderer.js";
import type { StructuredPortfolioContent } from "@expresso/contracts";
const content: StructuredPortfolioContent = {
  version: 1,
  profile: {
    name: "가상 인물",
    role: "엔지니어",
    headline: "경로를 설계하는 엔지니어입니다.",
    intro: "설명",
    focus: [],
  },
  sections: [
    {
      id: "a",
      title: "시험",
      summary: "요약",
      body: "우회 계획",
      pattern: "project",
      details: [],
      media: [],
      sourceIds: [],
    },
  ],
  career: [],
  evidence: [],
  contact: null,
};
const spec = {
  root: "page",
  elements: {
    page: {
      type: "PortfolioPage",
      props: {
        profile: { $state: "/profile" },
        design: { layout: "dossier", palette: "sage", font: "sans" },
        motion: "showcase",
        rationale: "근거 중심",
      },
      children: ["intro", "case-a"],
    },
    intro: {
      type: "NameIntro",
      props: { profile: { $state: "/profile" } },
      children: [],
    },
    "case-a": {
      type: "CaseTechnical",
      props: { section: { $state: "/sectionById/a" } },
      children: [],
    },
  },
};

describe("등록 지면 렌더러", () => {
  it("유효한 개별 입력도 합친 지면이 저장 한도를 넘으면 거부한다", () => {
    const value = structuredClone(content);
    value.sections[0]!.media = [{ src: "data:image/svg+xml;base64," + "A".repeat(600_000), alt: "가상 시험 이미지", origin: "fictional" }];
    expect(() => renderStructuredPortfolio(spec, value)).toThrow("저장 크기 제한");
  });
  it("렌더링 단계 실패만 StructuredRenderError로 구분한다", () => {
    const value = structuredClone(content);
    value.sections[0]!.media = [{ src: "data:image/svg+xml;base64," + "A".repeat(600_000), alt: "가상 시험 이미지", origin: "fictional" }];
    const tooLarge = (() => { try { renderStructuredPortfolio(spec, value); } catch (error) { return error; } })();
    expect(tooLarge).toBeInstanceOf(StructuredRenderError);
    expect((tooLarge as StructuredRenderError).code).toBe("PAGE_TOO_LARGE");
    const broken = structuredClone(spec);
    broken.elements.page.children = ["case-a", "intro"];
    const invalid = (() => { try { renderStructuredPortfolio(broken, content); } catch (error) { return error; } })();
    expect(invalid).toBeInstanceOf(Error);
    expect(invalid).not.toBeInstanceOf(StructuredRenderError);
  });
  it("동일 내용의 전체 배치를 바꾸고 세 지면 유형을 저장 HTML에 표시한다", () => {
    for (const layout of ["editorial", "gallery", "dossier"]) {
      const tree = structuredClone(spec);
      tree.elements.page.props.design.layout = layout;
      const result = renderStructuredPortfolio(tree, content);
      expect(result.html).toContain(`data-layout="${layout}"`);
      expect(result.html).toContain("가상 인물");
      expect(result.html).toContain("우회 계획");
      expect(result.css).toContain("prefers-reduced-motion");
    }
  });
  it("본문을 실행 코드로 해석하지 않고 사용자 스타일의 색을 보존한다", () => {
    const value = structuredClone(content);
    value.sections[0]!.body = '<script>alert("x")</script>';
    const result = renderStructuredPortfolio(spec, value, {
      background: "#eeeeee",
      text: "#111111",
      accent: "#123456",
    });
    expect(result.html).toContain("&lt;script&gt;");
    expect(result.html).not.toContain("<script>");
    expect(result.css).toContain("--sp-accent:#123456");
  });
});
