import { describe, expect, it } from "vitest";
import { validateStructuredPortfolio, type StructuredPortfolioContent, type StructuredPortfolioSnapshot } from "@expresso/contracts";

import { changedElementKeys, describeChange, revertChange } from "./structured-history.js";

const section = (id: string, title: string, metric: string) => ({
  id,
  title,
  summary: `${title} 요약`,
  body: `${title} 본문`,
  pattern: "project" as const,
  details: [],
  media: [],
  sourceIds: [],
  metrics: [{ label: `${title} 지표`, value: metric }],
});

const content: StructuredPortfolioContent = {
  version: 1,
  profile: { name: "가상 인물", role: "엔지니어", headline: "경로를 설계합니다.", intro: "소개", focus: [] },
  sections: [section("a", "경로 재설계", "24분"), section("b", "품질 점검", "30분")],
  career: [],
  evidence: [],
  contact: null,
};

const spec = {
  root: "page",
  elements: {
    page: {
      type: "PortfolioPage",
      props: { profile: { $state: "/profile" }, design: { layout: "editorial" }, motion: "subtle", rationale: "근거" },
      children: ["intro", "metrics", "section-a", "section-b"],
    },
    intro: { type: "NameIntro", props: { profile: { $state: "/profile" }, variant: "statement" }, children: [] },
    metrics: { type: "MetricStrip", props: { sections: { $state: "/sections" } }, children: [] },
    "section-a": { type: "CaseEssay", props: { section: { $state: "/sectionById/a" } }, children: [] },
    "section-b": { type: "CaseEssay", props: { section: { $state: "/sectionById/b" } }, children: [] },
  },
};

const base = validateStructuredPortfolio(spec, content);

/** 지면을 고친 새 판. 고치는 함수는 복사본을 받는다. */
function edit(from: StructuredPortfolioSnapshot, change: (draft: { spec: typeof spec; content: StructuredPortfolioContent }) => void): StructuredPortfolioSnapshot {
  const draft = structuredClone({ spec: from.spec, content: from.content }) as { spec: typeof spec; content: StructuredPortfolioContent };
  change(draft);
  return validateStructuredPortfolio(draft.spec, draft.content);
}

const metricValue = (snapshot: StructuredPortfolioSnapshot, id: string) => snapshot.content.sections.find((item) => item.id === id)?.metrics?.[0]?.value;
const body = (snapshot: StructuredPortfolioSnapshot, id: string) => snapshot.content.sections.find((item) => item.id === id)?.body;

describe("판 비교", () => {
  it("글이 바뀐 요소를 지면 순서대로 낸다", () => {
    const next = edit(base, (draft) => { draft.content.sections[0]!.metrics![0]!.value = "20분"; });
    // 수치 띠와 사례 A 둘 다 그 수치를 보인다. 고를 때는 사례가 먼저고, 요약은 바뀐 칸 하나로 부른다.
    expect(changedElementKeys(base, next)).toEqual(["section-a", "metrics"]);
    expect(describeChange(base, next)).toBe("경로 재설계 · 수치 1 값 고침");
  });

  it("한 섹션의 여러 칸은 섹션으로, 여러 섹션이면 첫 칸과 나머지 수로 부른다", () => {
    const one = edit(base, (draft) => { draft.content.sections[0]!.body = "새 본문"; draft.content.sections[0]!.summary = "새 요약"; });
    expect(describeChange(base, one)).toBe("경로 재설계 · 글 2곳 고침");
    const two = edit(base, (draft) => { draft.content.sections[0]!.body = "새 본문"; draft.content.sections[1]!.body = "새 본문"; });
    expect(describeChange(base, two)).toBe("경로 재설계 · 본문 외 1곳 고침");
  });

  it("글자 모양만 바뀐 요소를 따로 부른다", () => {
    const next = edit(base, (draft) => { (draft.spec.elements["section-b"].props as Record<string, unknown>).scale = "lead"; });
    expect(changedElementKeys(base, next)).toEqual(["section-b"]);
    expect(describeChange(base, next)).toBe("품질 점검 · 모양 고침");
  });

  it("순서만 바꾸면 목차 순서로 부른다", () => {
    const next = edit(base, (draft) => { draft.spec.elements.page.children = ["intro", "metrics", "section-b", "section-a"]; });
    expect(changedElementKeys(base, next)).toEqual(["page"]);
    expect(describeChange(base, next)).toBe("목차 순서 바꿈");
  });
});

describe("변경 하나만 무르기", () => {
  it("같은 섹션의 다른 칸을 뒤에 고쳤어도 겹치지 않는다", () => {
    // 판 1: 수치 띠에서 A의 수치를 고친다. 판 2: 사례 A의 본문을 고친다.
    const first = edit(base, (draft) => { draft.content.sections[0]!.metrics![0]!.value = "20분"; });
    const second = edit(first, (draft) => { draft.content.sections[0]!.body = "새 본문"; });
    const result = revertChange(base, first, second);
    expect(result.conflicts).toEqual([]);
    const reverted = validateStructuredPortfolio(result.spec, result.content);
    expect(metricValue(reverted, "a")).toBe("24분");
    expect(body(reverted, "a")).toBe("새 본문");
  });

  it("그 뒤에 같은 칸을 또 고쳤으면 충돌로 알리고, 덮기로 하면 앞 판 값을 쓴다", () => {
    const first = edit(base, (draft) => { draft.content.sections[0]!.metrics![0]!.value = "20분"; });
    const second = edit(first, (draft) => { draft.content.sections[0]!.metrics![0]!.value = "18분"; });
    const kept = revertChange(base, first, second);
    expect(kept.conflicts).toEqual(["/content/sections/a/metrics/0/value"]);
    expect(metricValue(validateStructuredPortfolio(kept.spec, kept.content), "a")).toBe("18분");
    const forced = revertChange(base, first, second, true);
    expect(metricValue(validateStructuredPortfolio(forced.spec, forced.content), "a")).toBe("24분");
  });

  it("더한 사례를 무르면 그 뒤 순서를 바꿨어도 사례만 빠진다", () => {
    const added = edit(base, (draft) => {
      draft.content.sections.push(section("c", "새 사례", "5건"));
      (draft.spec.elements as Record<string, unknown>)["section-c"] = { type: "CaseEssay", props: { section: { $state: "/sectionById/c" } }, children: [] };
      draft.spec.elements.page.children = ["intro", "metrics", "section-a", "section-b", "section-c"];
    });
    const reordered = edit(added, (draft) => { draft.spec.elements.page.children = ["intro", "metrics", "section-c", "section-b", "section-a"]; });
    const result = revertChange(base, added, reordered);
    expect(result.conflicts).toEqual([]);
    const reverted = validateStructuredPortfolio(result.spec, result.content);
    expect(reverted.spec.elements.page?.children).toEqual(["intro", "metrics", "section-b", "section-a"]);
    expect(reverted.spec.elements["section-c"]).toBeUndefined();
    expect(reverted.content.sections.map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("뺀 요소를 무르면 앞 판의 자리로 되살린다", () => {
    const removed = edit(base, (draft) => {
      delete (draft.spec.elements as Record<string, unknown>).metrics;
      draft.spec.elements.page.children = ["intro", "section-a", "section-b"];
    });
    const result = revertChange(base, removed, removed);
    const reverted = validateStructuredPortfolio(result.spec, result.content);
    expect(reverted.spec.elements.page?.children).toEqual(["intro", "metrics", "section-a", "section-b"]);
    expect(reverted.spec.elements.metrics?.type).toBe("MetricStrip");
  });

  it("순서를 바꾼 뒤 또 순서를 바꿨으면 충돌이다", () => {
    const first = edit(base, (draft) => { draft.spec.elements.page.children = ["intro", "metrics", "section-b", "section-a"]; });
    const second = edit(first, (draft) => { draft.spec.elements.page.children = ["intro", "section-b", "metrics", "section-a"]; });
    expect(revertChange(base, first, second).conflicts).toEqual(["/spec/elements/page/children"]);
  });
});
