import { describe, expect, it } from "vitest";
import type { StructuredPortfolioContent } from "@expresso/contracts";
import { describeRenderDefects, renderDefects, type RenderMeasurement } from "./measure.js";

const content: StructuredPortfolioContent = {
  version: 1,
  profile: { name: "가상 인물", role: "분석가", headline: "녹지를 지도로 읽습니다.", intro: "소개 문단입니다.", focus: ["공간 분석"] },
  sections: [
    { id: "a", title: "녹지 격차 아틀라스", summary: "구별 녹지 비교", body: "지도를 만들었습니다.", pattern: "project", details: [], media: [{ src: "/v1/media/x", alt: "지도", origin: "uploaded" }], sourceIds: [] },
  ],
  career: [],
  evidence: [],
  contact: null,
};

/** 결함이 하나도 없는 측정값입니다. 테스트마다 필요한 칸만 바꿉니다. */
function clean(overrides: Partial<RenderMeasurement> = {}): RenderMeasurement {
  return {
    overflow: false, brokenImages: 0, missingAnchors: [], h1: 1, nameSize: 60, headlineSize: 20, introMotion: "none", hiddenCases: 0,
    stretchedTags: [], overlappedCaptions: [], orphans: [], escaped: [], casesWithImage: ["section-a"], caseNumbers: ["01"],
    displayFamily: "system-ui", bodyFamily: "system-ui", loadedFamilies: [], contrast: [],
    text: "가상 인물 분석가 녹지를 지도로 읽습니다. 소개 문단입니다. 공간 분석 녹지 격차 아틀라스 구별 녹지 비교 지도를 만들었습니다.",
    ...overrides,
  };
}

describe("renderDefects", () => {
  it("결함 없는 측정값은 빈 목록이다", () => {
    expect(renderDefects([{ width: 390, measurement: clean() }], content)).toEqual([]);
  });

  it("구성으로 고칠 결함과 기록만 할 결함을 나눈다", () => {
    const defects = renderDefects([{ width: 1440, measurement: clean({
      orphans: [{ element: "section-a", text: "녹지 격차 아틀라스" }],
      casesWithImage: [],
      contrast: [{ element: "intro", text: "소개", ratio: 3.1, min: 4.5 }],
      displayFamily: "Outfit",
    }) }], content);
    expect(defects.map((item) => [item.kind, item.fixable])).toEqual([
      ["orphan", true], ["missing-image", true], ["contrast", false], ["font", false],
    ]);
  });

  it("지면 글에 없는 내용 값을 누락으로 잡는다", () => {
    const defects = renderDefects([{ width: 390, measurement: clean({ text: "가상 인물" }) }], content);
    expect(defects.every((item) => item.kind === "missing-text" && !item.fixable)).toBe(true);
    expect(defects.length).toBeGreaterThan(0);
  });
});

describe("describeRenderDefects", () => {
  it("같은 요소의 같은 결함은 너비를 묶어 한 줄로 쓰고, 기록만 할 결함은 넣지 않는다", () => {
    const orphan = { element: "section-a", text: "녹지 격차 아틀라스" };
    const defects = renderDefects([
      { width: 926, measurement: clean({ orphans: [orphan] }) },
      { width: 1440, measurement: clean({ orphans: [orphan], contrast: [{ element: "intro", text: "소개", ratio: 3.1, min: 4.5 }] }) },
    ], content);
    const lines = describeRenderDefects(defects).split("\n");
    expect(lines.slice(1)).toEqual(['- 926px · 1440px section-a: "녹지 격차 아틀라스"의 마지막 줄에 한 글자만 남습니다.']);
  });
});
