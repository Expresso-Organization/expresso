import { PORTFOLIO_STYLE_PRESETS, type TemplatePreview } from "@expresso/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./design-actions", () => ({ startGenerationAction: vi.fn() }));

import { filterDesignPreviews } from "./design-filters";
import { DesignPicker } from "./DesignPicker";
import { TemplateThumb } from "./TemplateThumb";
import thumbStyles from "./template-thumb.module.css";

const previews: TemplatePreview[] = PORTFOLIO_STYLE_PRESETS.map((preset) => ({
  templateId: preset.templateId, code: preset.code, name: preset.name,
  description: preset.description,
  designStyle: { mode: preset.mode, sourceUrl: preset.sourceUrl, version: preset.version },
  style: preset.style, planRequired: "free", recommended: false,
  recommendationReason: "레시피의 모든 섹션을 담습니다.", contrastRatio: 7, colorAdjusted: false,
  sections: [{ recipeSectionId: "00000000-0000-4000-8000-000000000001", title: "대표 프로젝트", state: "filled", content: ["정산 시간을 24분으로 줄였습니다."] }],
}));

describe("디자인 선택", () => {
  it("30종과 실제 설명, 밝기·서체 필터, 생성 팔레트를 렌더한다", () => {
    const html = renderToStaticMarkup(<DesignPicker
      brewId="brew" recipeId="recipe" previews={previews} planCode="free" usage={null}
      allowed companyName={null} useCompanyColors={false} madePortfolioId={null} failureCode={null}
    />);
    expect(html).toContain("전체 30");
    expect(html).toContain("밝게");
    expect(html).toContain("어둡게");
    expect(html).toContain('aria-label="서체로 스타일 찾기"');
    expect(html).toContain(previews[0]!.description);
    expect(html).toContain('name="accent" value="' + previews[0]!.style.accent + '"');
    expect(html).toContain('aria-label="선택한 디자인의 서체"');
    expect(html).toContain(`aria-describedby="design-desc-${previews[0]!.templateId} design-plan-${previews[0]!.templateId}"`);
    expect(html.match(/aria-pressed="(?:true|false)" aria-label=".*? 선택"/g)).toHaveLength(30);
    expect(html).not.toContain("대표 프로젝트");
    expect(html).not.toContain("정산 시간을 24분으로 줄였습니다.");
    expect(html).not.toContain("레시피 1개 섹션");
  });

  it("밝기와 서체 필터를 조합하되 원본 후보와 순서를 바꾸지 않는다", () => {
    const original = previews.map((p) => p.templateId);
    expect(filterDesignPreviews(previews, "dark", "mono").map((p) => p.name)).toEqual(["Terminal", "Cyberpunk"]);
    expect(filterDesignPreviews(previews, "light", "mono")).toEqual([]);
    expect(filterDesignPreviews(previews, "all", "all")).toHaveLength(30);
    expect(previews.map((p) => p.templateId)).toEqual(original);
    expect(filterDesignPreviews([{ ...previews[0]!, designStyle: undefined }], "light", "all")).toHaveLength(1);
    const signal = { ...previews[0]!, code: "signal", designStyle: undefined,
      style: { ...previews[0]!.style, background: "#0f172a" } };
    expect(filterDesignPreviews([signal], "dark", "all")).toHaveLength(1);
    expect(filterDesignPreviews([signal], "light", "all")).toEqual([]);
  });

  it("디자인 견본은 내용과 무관하게 서체·팔레트·구성만 표시한다", () => {
    const terminal = previews.find((p) => p.name === "Terminal")!;
    const html = renderToStaticMarkup(<TemplateThumb preview={terminal} />);
    expect(html).toContain('data-style="terminal"');
    expect(html).toContain('data-structure="dense-grid"');
    expect(html).toContain('var(--ex-font-mono)');
    expect(html).toContain("Terminal");
    expect(html).not.toContain(">Aa<");
    expect(html).not.toContain("대표 프로젝트");
    expect(html).not.toContain("정산 시간을 24분으로 줄였습니다.");
    const otherRecipe = { ...terminal, sections: [{ ...terminal.sections[0]!, title: "다른 내용", state: "empty" as const, content: [] }] };
    expect(renderToStaticMarkup(<TemplateThumb preview={otherRecipe} />)).toBe(html);
  });

  it("모든 견본의 서체 문구는 각 디자인의 이름이다", () => {
    for (const preview of previews) {
      const html = renderToStaticMarkup(<TemplateThumb preview={preview} />);
      expect(html.replace(/<[^>]*>/g, "")).toBe(preview.name);
    }
  });

  it.each(["Monochrome", "Bauhaus", "Modern Dark"])("%s 포스터는 공통 색상칩과 막대 없이 이름을 온전히 표시한다", (name) => {
    const preview = previews.find((item) => item.name === name)!;
    const html = renderToStaticMarkup(<TemplateThumb preview={preview} />);
    expect(html.replace(/<[^>]*>/g, "")).toBe(name);
    expect(html).not.toContain(thumbStyles.colorStudy);
    expect(html).not.toContain(thumbStyles.weightStudy);
  });
});
