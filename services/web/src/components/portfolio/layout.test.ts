import type { LayoutSpec, PortfolioBlock, PortfolioDetail } from "@expresso/contracts";
import { describe, expect, it } from "vitest";

import { classesFor, fallbackSpec, layoutVariables } from "./layout";

/**
 * 지면 합성 규칙.
 *
 * 여기서 지키는 것은 셋이다 — 블록별 지면이 종류 기본값을 **덮어쓰는지**,
 * 스펙의 값이 CSS로 **나가는지**, 그리고 기본 지면이 여전히 서는지.
 */

const spec: LayoutSpec = {
  type: { display: "sans-neutral", body: "sans-neutral", scaleRatio: 1.25, measure: 62 },
  palette: { ink: "#16223A", paper: "#FFFFFF", accent: "#9A4030", muted: "#5A6473" },
  rhythm: { density: "comfortable", sectionGap: 96 },
  pageClassName: "font-body text-ink bg-paper break-keep",
  sectionLabelClassName: "text-step-1 font-mono",
  sections: [],
  blockClasses: {
    heading: "text-step2 font-display leading-tight",
    paragraph: "text-step0 leading-relaxed",
  },
  rationale: "테스트용 지면입니다.",
};

function block(kind: PortfolioBlock["kind"], style: Record<string, unknown> = {}): PortfolioBlock {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    orderNo: 0,
    kind,
    content: { text: "가" },
    style,
    sourceRecordId: null,
    syncState: "synced",
    locked: false,
  };
}

describe("지면 합성", () => {
  it("배치 나무가 준 클래스가 종류 기본값의 같은 자리를 걷어낸다", () => {
    // 표지의 제목만 크게 세운다. `text-step2`가 남아 있으면 어느 쪽이 이길지
    // 우리가 정할 수 없다 — 같은 특정도면 스타일시트 순서가 정한다.
    const classes = classesFor(block("heading"), spec, "text-step4 text-paper");
    expect(classes).toContain("text-step4");
    expect(classes).not.toContain("text-step2");
    // 건드리지 않은 자리는 그대로 남는다.
    expect(classes).toContain("font-display");
    expect(classes).toContain("leading-tight");
  });

  it("사용자가 04b에서 고른 모양이 지면과 배치보다 세다 (P3)", () => {
    const classes = classesFor(block("heading", { size: "step0" }), spec, "text-step4");
    expect(classes).toContain("text-step0");
    expect(classes).not.toContain("text-step4");
    expect(classes).not.toContain("text-step2");
  });

  it("어휘 밖 클래스는 배치가 줘도 붙지 않는다", () => {
    const classes = classesFor(block("paragraph"), spec, "w-24 backdrop-blur-sm");
    expect(classes).toContain("w-24");
    expect(classes).not.toContain("backdrop-blur-sm");
  });

  it("리듬이 CSS 변수로 나간다 — 읽는 사람이 없으면 죽은 값이다", () => {
    const variables = layoutVariables(spec) as Record<string, string>;
    expect(variables["--pf-gap"]).toBe("96px");
    expect(variables["--pf-step5"]).toBe("3.052rem");
    expect(variables["--pf-muted"]).toBe("#5A6473");
  });

  it("지면이 없는 포트폴리오도 그릴 수 있다", () => {
    const portfolio = {
      templateStyle: { background: "#0F172A", text: "#E2E8F0", accent: "#38BDF8", font: "sans" },
      sections: [
        { id: "s1", visible: true, blocks: [block("paragraph")] },
        { id: "s2", visible: true, blocks: [] },
      ],
    } as unknown as PortfolioDetail;
    const fallback = fallbackSpec(portfolio);
    // 빈 섹션은 자리를 잡지 않는다 — 채움 문구보다 없는 편이 낫다.
    expect(fallback.sections).toHaveLength(1);
    expect(fallback.palette.paper).toBe("#0F172A");
    expect(fallback.sections[0]?.items).toEqual([]);
  });
});
