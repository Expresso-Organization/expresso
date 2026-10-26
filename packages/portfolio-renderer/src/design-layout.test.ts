import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DesignSystemSpecV2Schema } from "@expresso/contracts";
import { KIT_LAYOUT, describeDesignLayout, designLayout } from "./design-layout.js";
import { KIT_CSS } from "./kit-styles.js";

const designs = JSON.parse(readFileSync(new URL("./fixtures/designs.json", import.meta.url), "utf8"));
const clarity = DesignSystemSpecV2Schema.parse(designs.clarity);

describe("디자인 배치 계산", () => {
  it("넓은 여백은 제목 칸 · 본문 칸 폭을 키트 비율로 나누고 컨테이너를 막는다", () => {
    const wide = structuredClone(clarity);
    wide.composition.layout = "wide-margin";
    const layout = designLayout(wide);
    const free = wide.spacing.contentWidth - wide.spacing.componentGap * KIT_LAYOUT.wideMargin.gap;
    expect(layout.head).toBe("left");
    expect(layout.headWidth! + layout.bodyWidth).toBe(free);
    expect(layout.headWidth).toBe(Math.round(free / (1 + KIT_LAYOUT.wideMargin.body)));
    expect(layout.groups).toEqual([]);
    expect(layout.columns).toBeNull();
    expect(describeDesignLayout(layout, "가상")).toContain(`왼쪽 칸(약 ${layout.headWidth}px)`);
    expect(describeDesignLayout(layout, "가상")).toContain("컨테이너(Columns · Grid · Band)를 쓸 수 없습니다");
  });

  it("단일 열 · 촘촘한 격자는 컨테이너를 허용하고 Columns 칸 폭을 알린다", () => {
    const layout = designLayout(clarity);
    expect(layout.kind).toBe("single-column");
    expect(layout.groups).toEqual(["Columns", "Grid", "Band"]);
    const free = clarity.spacing.contentWidth - clarity.spacing.componentGap * KIT_LAYOUT.group.gap;
    // 칸 폭은 정수로 반올림하므로 합이 1px 안에서 남는 폭과 같습니다.
    expect(Math.abs(layout.columns!.even[0] + layout.columns!.even[1] - free)).toBeLessThanOrEqual(1);
    expect(layout.columns!["wide-start"][0]).toBeGreaterThan(layout.columns!["wide-start"][1]);
    const text = describeDesignLayout(layout, "Clarity");
    expect(text).toContain("배치는 단일 열입니다");
    expect(text).toContain(`even 약 ${layout.columns!.even[0]}·${layout.columns!.even[1]}px`);
  });

  it("키트 CSS가 같은 상수로 넓은 여백 · 컨테이너 · 접힘 규칙을 만든다", () => {
    const { wideMargin: wm, group, collapseBelow } = KIT_LAYOUT;
    expect(KIT_CSS).toContain(`minmax(${wm.minHead}px,${wm.head}fr) minmax(0,${wm.body}fr);column-gap:calc(var(--component-gap) * ${wm.gap})`);
    expect(KIT_CSS).toContain(`gap:calc(var(--component-gap) * ${group.gap})`);
    expect(KIT_CSS).toContain(`minmax(0,${group.wide}fr) minmax(0,1fr)`);
    expect(KIT_CSS).toContain(`@media (max-width:${collapseBelow}px)`);
  });
});
