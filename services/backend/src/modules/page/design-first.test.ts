import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { PageGenerationManifestSchema, validateStructuredPortfolio } from "@expresso/contracts";
import type { AiCallSpec, AiClient } from "../../platform/ai/client.js";
import { StructuredPageGenerator } from "./structured-generator.js";
import type { PageGenerationContext } from "./generator.js";
import { findPortfolioDesign } from "../design-systems/index.js";

/** 계약과 프롬프트로 응답을 고르는 가짜 공급자입니다. 채우기는 병렬이라 순서가 아니라 내용으로 고릅니다. */
class RoutedAi implements AiClient {
  calls: AiCallSpec[] = [];
  constructor(private readonly route: (request: AiCallSpec) => unknown) {}
  async complete<T>(request: AiCallSpec, schema: z.ZodType<T>) {
    this.calls.push(request);
    const data = schema.parse(this.route(request));
    return { data, usage: { model: request.contract === "page_design" ? "opus-test" : "sonnet-test", inputTokens: 1, outputTokens: 100, cacheReadTokens: 0, cacheCreationTokens: 0, durationMs: 50, costUsd: 0.01 } };
  }
}

const context: PageGenerationContext = {
  author: { name: "가상 하린" },
  portfolioPlan: null,
  sections: [
    { id: "lcp", title: "상품 상세 성능", purpose: "LCP 개선", goal: "", points: ["LCP 3.8초 → 1.9초", "JS 420KB → 180KB"], targetLength: 200, sourceIds: ["rec-1"] },
    { id: "ui", title: "디자인 시스템", purpose: "컴포넌트 통합", goal: "", points: ["컴포넌트 48개 정리"], targetLength: 200, sourceIds: ["rec-2"] },
    { id: "misc", title: "기타 메모", purpose: "", goal: "", points: [], targetLength: 50, sourceIds: [] },
  ],
  evidence: [
    { id: "rec-1", label: "성능 개선 기록", text: "상품 상세 LCP를 3.8초에서 1.9초로 줄였다. 클라이언트 JS는 420KB에서 180KB가 됐다." },
    { id: "rec-2", label: "디자인 시스템 기록", text: "흩어진 컴포넌트 48개를 하나로 정리했다." },
  ],
  media: [],
  jobTitle: null,
  company: null,
  // 기본 디자인(토큰 키트)으로 그립니다. 디자인이 없으면 수집 원본 렌더러로 그려 새 부품이 보이지 않습니다.
  design: findPortfolioDesign({}),
};

const plan = {
  concept: "성능 수치를 앞세운 지면",
  profile: { intro: 120, focus: 2 },
  sections: [
    { id: "lcp", include: true, pattern: "project", form: "before-after", emphasis: "lead", budget: { title: 30, summary: 60, body: 200, details: 0, metrics: 2 }, media: [] },
    // 이전 값이 없는 수치만 채워지면 기술형으로 내려야 합니다.
    { id: "ui", include: true, pattern: "project", form: "before-after", emphasis: "standard", budget: { title: 30, summary: 60, body: 120, details: 2, metrics: 1 }, media: [] },
    { id: "misc", include: false, pattern: "about", form: "essay", emphasis: "compact", budget: { title: 20, summary: 0, body: 0, details: 0, metrics: 0 }, media: [] },
  ],
  evidence: true,
  career: false,
};
const spec = {
  root: "page",
  elements: {
    page: { type: "PortfolioPage", props: { profile: { $state: "/profile" }, motion: "showcase", rationale: "수치를 먼저 보입니다." }, children: ["intro", "metrics", "group-1", "section-misc", "evidence", "career"] },
    intro: { type: "NameIntro", props: { profile: { $state: "/profile" }, sections: { $state: "/sections" }, variant: "statement" }, children: [] },
    index: { type: "ProjectIndex", props: { sections: { $state: "/sections" }, variant: "rows" }, children: [] },
    metrics: { type: "MetricStrip", props: { sections: { $state: "/sections" } }, children: [] },
    "group-1": { type: "Columns", props: { variant: "wide-start" }, children: ["section-lcp", "section-ui"] },
    "section-lcp": { type: "CaseBeforeAfter", props: { section: { $state: "/sectionById/lcp" } }, children: [] },
    "section-ui": { type: "CaseBeforeAfter", props: { section: { $state: "/sectionById/ui" } }, children: [] },
    "section-misc": { type: "CaseEssay", props: { section: { $state: "/sectionById/misc" } }, children: [] },
    evidence: { type: "EvidenceGrid", props: { evidence: { $state: "/evidence" } }, children: [] },
    career: { type: "CareerTimeline", props: { career: { $state: "/career" } }, children: [] },
  },
};
// 설계 단계 스키마는 모든 요소를 요구합니다. 목차는 page.children에 넣지 않으면 누락이므로 페이지에 둡니다.
spec.elements.page.children.splice(1, 0, "index");

function route(request: AiCallSpec) {
  if (request.contract === "page_design") return { plan, spec };
  return {
    role: "프론트엔드 개발자", headline: "커머스 화면의 성능을 고칩니다.", intro: "성능과 접근성을 다룹니다.", focus: ["성능", "접근성"],
    sections: {
      lcp: {
        title: "상품 상세 LCP 절반으로", summary: "렌더링 구조를 바꿨습니다.", body: "서버 컴포넌트로 옮겼습니다.", details: [],
        // 출처에 없는 숫자(99%)는 지워져야 합니다.
        metrics: [{ label: "LCP", value: "1.9초", before: "3.8초" }, { label: "전환율", value: "99%" }],
      },
      ui: { title: "디자인 시스템 통합", summary: "흩어진 컴포넌트를 묶었습니다.", body: "", details: [{ label: "범위", text: "컴포넌트 48개" }], metrics: [{ label: "컴포넌트", value: "48개" }] },
    },
    career: [],
    evidence: [{ id: "rec-1", title: "성능 개선 기록", kind: "기록", summary: "LCP 개선", body: "" }],
  };
}

describe("설계가 먼저 오는 생성", () => {
  it("설계 한 번과 섹션 · 프로필 채우기로 지면을 만들고, 설계와 어긋난 부품을 내리고 뺀 섹션을 지운다", async () => {
    const ai = new RoutedAi(route);
    const result = await new StructuredPageGenerator(ai).generate(context);
    expect(ai.calls.map((call) => call.contract)).toEqual(["page_design", "page_fill"]);
    // 레시피 섹션에 기록 연결이 없어도 채우기는 근거 원문을 모두 봅니다.
    expect(ai.calls[1]!.prompt).toContain("1.9초로 줄였다");
    const structured = result.manifest.structured!;
    expect(validateStructuredPortfolio(structured.spec, structured.content).content.sections.map((section) => section.id)).toEqual(["lcp", "ui"]);
    const lcp = structured.content.sections.find((section) => section.id === "lcp")!;
    expect(lcp.metrics).toEqual([{ label: "LCP", value: "1.9초", before: "3.8초" }]);
    expect(structured.spec.elements["section-lcp"]?.type).toBe("CaseBeforeAfter");
    expect(structured.spec.elements["section-ui"]?.type).toBe("CaseTechnical");
    expect(structured.spec.elements["section-misc"]).toBeUndefined();
    expect(structured.spec.elements.career).toBeUndefined();
    // 수치가 두 개(LCP · 컴포넌트)라 수치 강조 줄은 남습니다.
    expect(structured.spec.elements.metrics?.type).toBe("MetricStrip");
    expect(result.html).toContain("xp-metric-strip");
    expect(result.html).toContain('data-form="before-after"');
    expect(result.manifest.designPlan?.concept).toBe("성능 수치를 앞세운 지면");
    expect(result.manifest.calls?.map((call) => call.model)).toEqual(["opus-test", "sonnet-test"]);
    expect(result.manifest.timeline?.map((item) => item.stage)).toEqual(["designed", "filled", "rendered"]);
    expect(PageGenerationManifestSchema.parse(result.manifest)).toEqual(result.manifest);
  });

  it("설계가 계약 검사에 두 번 걸리면 이전 경로(내용 정리 → 구성)로 이어 간다", async () => {
    const ai = new RoutedAi((request) => {
      if (request.contract === "page_design") return { plan: { ...plan, sections: plan.sections.slice(0, 1) }, spec };
      throw new Error("이전 경로 호출");
    });
    await expect(new StructuredPageGenerator(ai).generate(context)).rejects.toThrow("이전 경로 호출");
    expect(ai.calls.filter((call) => call.contract === "page_design")).toHaveLength(2);
    // 두 번째 설계 요청에는 직전 오류가 붙습니다.
    expect(ai.calls[1]!.prompt).toContain("plan.sections에 모든 섹션");
  });
});
