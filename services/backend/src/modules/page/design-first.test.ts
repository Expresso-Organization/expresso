import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { PageGenerationManifestSchema, validateStructuredPortfolio, type StructuredPortfolioContent } from "@expresso/contracts";
import type { AiCallSpec, AiFix } from "../../platform/ai/client.js";
import { ScriptedAiClient } from "../../platform/ai/scripted-client.js";
import { StructuredPageGenerator } from "./structured-generator.js";
import type { PageGenerationContext } from "./generator.js";
import { findPortfolioDesign } from "../design-systems/index.js";
import { METRIC_VALUE_PATTERN, fillViolations, fitToContent } from "./design-first.js";

/** 계약으로 응답을 고르는 가짜 공급자입니다. 실제 어댑터와 같은 검사 · 고치기 순서를 탑니다. */
class RoutedAi extends ScriptedAiClient {
  constructor(route: (request: AiCallSpec, attempt: number) => unknown, fix?: (request: AiCallSpec, paths: string[]) => AiFix[]) {
    super(route, fix, (request) => (request.contract === "page_design" ? "opus-test" : "sonnet-test"));
  }
}

const context: PageGenerationContext = { userId: null,
  author: { name: "가상 하린" },
  portfolioPlan: null,
  sections: [
    { id: "lcp", title: "상품 상세 성능", purpose: "LCP 개선", goal: "", points: ["LCP 3.8초 → 1.9초", "JS 420KB → 180KB"], targetLength: 200, sourceIds: ["rec-1"] },
    { id: "ui", title: "디자인 시스템", purpose: "컴포넌트 통합", goal: "", points: ["컴포넌트 48개 정리"], targetLength: 200, sourceIds: ["rec-2"] },
    { id: "misc", title: "기타 메모", purpose: "", goal: "", points: [], targetLength: 50, sourceIds: [] },
  ],
  evidence: [
    { id: "rec-1", label: "성능 개선 기록", text: "상품 상세 LCP를 3.8초에서 1.9초로 줄였다. 클라이언트 JS는 420KB에서 180KB가 됐다." },
    { id: "rec-2", label: "디자인 시스템 기록", text: "흩어진 컴포넌트 48개를 하나로 정리했다. 진단 · 토큰 정리 · 배포 순서로 진행했다." },
  ],
  media: [],
  jobTitle: null,
  company: null,
  // 기본 디자인(토큰 키트)으로 그립니다. 디자인이 없으면 수집 원본 렌더러로 그려 새 부품이 보이지 않습니다.
  design: findPortfolioDesign({}),
};

const noText = { quote: 0, steps: 0 };
const plan = {
  concept: "성능 수치를 앞세운 지면",
  profile: { intro: 120, focus: 2 },
  sections: [
    { id: "lcp", include: true, pattern: "project", form: "before-after", emphasis: "lead", surface: "inverse", width: "bleed", budget: { title: 30, summary: 60, body: 200, details: 0, metrics: 2, quote: 40, steps: 0 }, media: [] },
    // 이전 값이 없는 수치만 채워지면 기술형으로 내려야 합니다. 단계 세 개를 채우면 과정 흐름은 그대로입니다.
    { id: "ui", include: true, pattern: "project", form: "flow", emphasis: "standard", surface: "field", width: "content", budget: { title: 30, summary: 60, body: 120, details: 2, metrics: 1, quote: 0, steps: 3 }, media: [] },
    { id: "misc", include: false, pattern: "about", form: "essay", emphasis: "compact", surface: "canvas", width: "content", budget: { title: 20, summary: 0, body: 0, details: 0, metrics: 0, ...noText }, media: [] },
  ],
  evidence: true,
  career: false,
};
const spec = {
  root: "page",
  elements: {
    page: { type: "PortfolioPage", props: { profile: { $state: "/profile" }, motion: "showcase", rationale: "수치를 먼저 보입니다." }, children: ["intro", "metrics", "group-1", "quote-1", "section-misc", "evidence", "career"] },
    intro: { type: "NameIntro", props: { profile: { $state: "/profile" }, sections: { $state: "/sections" }, variant: "statement", backdrop: "contour" }, children: [] },
    index: { type: "ProjectIndex", props: { sections: { $state: "/sections" }, variant: "rows" }, children: [] },
    metrics: { type: "MetricStrip", props: { sections: { $state: "/sections" }, surface: "inverse", width: "bleed" }, children: [] },
    "group-1": { type: "Columns", props: { variant: "wide-start" }, children: ["section-lcp", "section-ui"] },
    // 설계 모델이 Spec에 적은 크기 · 배경은 설계안 값으로 덮어써집니다.
    "section-lcp": { type: "CaseBeforeAfter", props: { section: { $state: "/sectionById/lcp" }, scale: "compact" }, children: [] },
    "section-ui": { type: "CaseFlow", props: { section: { $state: "/sectionById/ui" } }, children: [] },
    "section-misc": { type: "CaseEssay", props: { section: { $state: "/sectionById/misc" } }, children: [] },
    "quote-1": { type: "PullQuote", props: { section: { $state: "/sectionById/lcp" }, scale: "lead" }, children: [] },
    evidence: { type: "EvidenceGrid", props: { evidence: { $state: "/evidence" } }, children: [] },
    career: { type: "CareerTimeline", props: { career: { $state: "/career" } }, children: [] },
  },
};
// 설계 단계 스키마는 모든 요소를 요구합니다. 목차는 page.children에 넣지 않으면 누락이므로 페이지에 둡니다.
spec.elements.page.children.splice(1, 0, "index");

function fill(lcpValue = "1.9초") {
  return {
    role: "프론트엔드 개발자", headline: "커머스 화면의 성능을 고칩니다.", intro: "성능과 접근성을 다룹니다.", focus: ["성능", "접근성"],
    sections: {
      lcp: {
        title: "상품 상세 LCP 절반으로", summary: "렌더링 구조를 바꿨습니다.", body: "서버 컴포넌트로 옮겼습니다.", details: [],
        // 출처에 없는 숫자(99%)는 지워져야 합니다.
        metrics: [{ label: "LCP", value: lcpValue, before: "3.8초" }, { label: "전환율", value: "99%" }],
        quote: "측정한 수치로만 개선을 말합니다.", steps: [],
      },
      ui: {
        title: "디자인 시스템 통합", summary: "흩어진 컴포넌트를 묶었습니다.", body: "", details: [{ label: "범위", text: "컴포넌트 48개" }], metrics: [{ label: "컴포넌트", value: "48개" }],
        quote: "", steps: [{ label: "진단", text: "흩어진 컴포넌트 목록" }, { label: "토큰 정리", text: "" }, { label: "배포", text: "하나로 정리" }],
      },
    },
    career: [],
    evidence: [{ id: "rec-1", title: "성능 개선 기록", kind: "기록", summary: "LCP 개선", body: "" }],
  };
}

function route(request: AiCallSpec) {
  if (request.contract === "page_design") return { plan, spec };
  return fill();
}

describe("설계가 먼저 오는 생성", () => {
  it("설계 한 번과 섹션 · 프로필 채우기로 지면을 만들고, 설계와 어긋난 부품을 내리고 뺀 섹션을 지운다", async () => {
    const ai = new RoutedAi(route);
    const result = await new StructuredPageGenerator(ai).generate(context);
    expect(ai.calls.map((call) => call.contract)).toEqual(["page_design", "page_fill"]);
    // 레시피 섹션에 기록 연결이 없어도 채우기는 근거 원문을 모두 봅니다.
    expect(ai.calls[1]!.prompt).toContain("1.9초로 줄였다");
    expect(ai.calls[1]!.prompt).toContain("인용 40자");
    expect(ai.calls[1]!.prompt).toContain("단계 3개");
    const structured = result.manifest.structured!;
    expect(validateStructuredPortfolio(structured.spec, structured.content).content.sections.map((section) => section.id)).toEqual(["lcp", "ui"]);
    const lcp = structured.content.sections.find((section) => section.id === "lcp")!;
    expect(lcp.metrics).toEqual([{ label: "LCP", value: "1.9초", before: "3.8초" }]);
    expect(lcp.quote).toBe("측정한 수치로만 개선을 말합니다.");
    expect(structured.spec.elements["section-lcp"]?.type).toBe("CaseBeforeAfter");
    expect(structured.spec.elements["section-ui"]?.type).toBe("CaseFlow");
    expect(structured.spec.elements["section-misc"]).toBeUndefined();
    expect(structured.spec.elements.career).toBeUndefined();
    // 사례 요소의 크기 · 배경 · 폭은 설계안을 따릅니다.
    expect(structured.spec.elements["section-lcp"]?.props).toMatchObject({ scale: "lead", surface: "inverse", width: "bleed" });
    expect(structured.spec.elements["section-ui"]?.props).toMatchObject({ scale: "standard", surface: "field", width: "content" });
    // 수치가 두 개(LCP · 컴포넌트)라 수치 강조 줄은 남습니다.
    expect(structured.spec.elements.metrics?.type).toBe("MetricStrip");
    expect(result.html).toContain("xp-metric-strip");
    expect(result.html).toContain('data-form="before-after"');
    expect(result.html).toContain('data-surface="inverse"');
    expect(result.html).toContain("xp-flow");
    expect(result.html).toContain("측정한 수치로만 개선을 말합니다.");
    // 설계 모델이 고른 첫 화면 배경을 그대로 그립니다. 설계 프롬프트가 배경마다 쓰임을 알립니다.
    expect(ai.calls[0]!.prompt).toContain("contour=등고선");
    expect(structured.spec.elements.intro?.props).toMatchObject({ backdrop: "contour" });
    expect(result.html).toContain('data-backdrop="contour"');
    expect(result.manifest.designPlan?.concept).toBe("성능 수치를 앞세운 지면");
    expect(result.manifest.calls?.map((call) => call.model)).toEqual(["opus-test", "sonnet-test"]);
    expect(result.manifest.timeline?.map((item) => item.stage)).toEqual(["designed", "filled", "rendered"]);
    expect(PageGenerationManifestSchema.parse(result.manifest)).toEqual(result.manifest);
  });

  it("수치 값에 설명이 붙으면 채우기 출력을 거절하지 않고, 그 칸만 같은 대화에서 고쳐 받는다", async () => {
    const ai = new RoutedAi(
      (request) => (request.contract === "page_design" ? { plan, spec } : fill("1.9초 절반 이하")),
      (request, paths) => (request.contract === "page_fill" && paths.includes("/sections/lcp/metrics") ? [{ path: "/sections/lcp/metrics", value: [{ label: "LCP", value: "1.9초", before: "3.8초" }] }] : []),
    );
    const result = await new StructuredPageGenerator(ai).generate(context);
    // 채우기는 한 번만 부르고, 고치기 요청에는 걸린 칸과 기준이 갑니다(출처 자료를 다시 보내지 않습니다).
    expect(ai.calls.filter((call) => call.contract === "page_fill")).toHaveLength(1);
    const fixRequest = ai.fixRequests.find((request) => request.contract === "page_fill")!;
    // 출처에 없는 숫자(99%) 때문에 수치 목록 전체를 고쳐 받고, 그 안의 값 모양 위반 이유도 함께 갑니다.
    expect(fixRequest.paths).toContain("/sections/lcp/metrics");
    expect(fixRequest.prompt).toContain("출처에 없는 숫자");
    expect(fixRequest.prompt).toContain("/0/value: 수치 값은 숫자와 단위만");
    expect(fixRequest.prompt).not.toContain("1.9초로 줄였다");
    expect(result.manifest.structured!.content.sections[0]!.metrics?.[0]?.value).toBe("1.9초");
  });

  it("설계안에 빠진 섹션은 설계를 거절하지 않고 그 목록만 고쳐 받으며, 고쳐도 빠지면 그 섹션은 싣지 않는다", async () => {
    const ai = new RoutedAi((request) => (request.contract === "page_design" ? { plan: { ...plan, sections: plan.sections.slice(0, 1) }, spec } : fill()));
    const result = await new StructuredPageGenerator(ai).generate(context);
    expect(ai.calls.filter((call) => call.contract === "page_design")).toHaveLength(1);
    const designFixes = ai.fixRequests.filter((request) => request.contract === "page_design");
    // 걸린 칸이 줄지 않으면 한 번 고친 뒤 멈춘다(진전 기준).
    expect(designFixes).toHaveLength(1);
    expect(designFixes[0]!.paths).toEqual(["/plan/sections"]);
    expect(designFixes[0]!.prompt).toContain("빠진 섹션: ui, misc");
    expect(result.manifest.structured!.content.sections.map((section) => section.id)).toEqual(["lcp"]);
  });
});

describe("설계 트리 연결", () => {
  it("연결하지 않은 요소가 있으면 설계를 거절하지 않고 page.children만 같은 대화에서 고쳐 받는다", async () => {
    const loose = { ...spec, elements: { ...spec.elements, page: { ...spec.elements.page, children: spec.elements.page.children.filter((key) => key !== "index") } } };
    const ai = new RoutedAi((request) => (request.contract === "page_design" ? { plan, spec: loose } : fill()), (request, paths) =>
      request.contract === "page_design" ? paths.map((path) => ({ path, value: spec.elements.page.children })) : [],
    );
    const result = await new StructuredPageGenerator(ai).generate(context);
    const designFixes = ai.fixRequests.filter((request) => request.contract === "page_design");
    expect(designFixes).toHaveLength(1);
    expect(designFixes[0]!.paths).toEqual(["/spec/elements/page/children"]);
    expect(designFixes[0]!.prompt).toContain("트리에 연결하지 않은 요소가 있습니다: index");
    expect(result.manifest.structured!.spec.elements.index?.type).toBe("ProjectIndex");
  });
});

describe("청사진과 순차 채움", () => {
  it("검사에 걸린 칸은 고친 글이 오면 그 글 자리에 고친 글로 다시 보낸다", async () => {
    const twoSentences = { ...fill(), headline: "커머스 화면을 고칩니다. 성능도 봅니다." };
    const ai = new RoutedAi(
      (request) => (request.contract === "page_design" ? { plan, spec } : twoSentences),
      (request, paths) => (request.contract === "page_fill" && paths.includes("/headline") ? [{ path: "/headline", value: "커머스 화면의 성능을 고칩니다." }] : []),
    );
    const fills: { path: string; text: string; revised: boolean }[] = [];
    const sink = { delta: () => undefined, thinking: () => undefined, blueprint: () => undefined, stage: () => undefined, fill: (path: string, text: string, _done: boolean, revised?: boolean) => fills.push({ path, text, revised: revised ?? false }) };
    const result = await new StructuredPageGenerator(ai).generate(context, sink);
    // 처음 쓴 글이 먼저 흐르고, 고친 글이 뒤에 고친 표시와 함께 옵니다.
    const headline = fills.filter((item) => item.path === "/profile/headline");
    expect(headline.at(-2)).toMatchObject({ text: "커머스 화면을 고칩니다. 성능도 봅니다.", revised: false });
    expect(headline.at(-1)).toEqual({ path: "/profile/headline", text: "커머스 화면의 성능을 고칩니다.", revised: true });
    expect(result.manifest.structured!.content.profile.headline).toBe("커머스 화면의 성능을 고칩니다.");
  });

  it("설계가 끝나면 최종 구조의 청사진을 보내고, 채우는 글을 글 자리 경로로 흘린 뒤 단계를 알린다", async () => {
    const events: { event: string; [key: string]: unknown }[] = [];
    const sink = {
      delta: (text: string) => events.push({ event: "delta", text }),
      thinking: () => undefined,
      blueprint: (page: { html: string; css: string }) => events.push({ event: "blueprint", ...page }),
      fill: (path: string, text: string, done: boolean) => events.push({ event: "fill", path, text, done }),
      stage: (name: string) => events.push({ event: "stage", name }),
    };
    await new StructuredPageGenerator(new RoutedAi(route)).generate(context, sink);

    const order = events.map((item) => (item.event === "stage" ? `stage:${item.name}` : item.event)).filter((name, index, list) => name !== list[index - 1]);
    expect(order).toEqual(["blueprint", "stage:designed", "fill", "stage:filled", "stage:rendered", "delta"]);

    const blueprint = events.find((item) => item.event === "blueprint") as { html: string; css: string } | undefined;
    // 표지는 하나도 남지 않고, 설계한 칸마다 글 자리가 있습니다. 뺀 섹션(misc)은 청사진에도 없습니다.
    expect(blueprint!.html).not.toMatch(/⟦\d+⟧/);
    for (const path of ["/profile/headline", "/sections/lcp/title", "/sections/lcp/metrics/0/before", "/sections/ui/details/1/text", "/sections/lcp/quote", "/sections/ui/steps/2/label"])
      expect(blueprint!.html).toContain(`data-slot="${path}"`);
    // 설계안의 크기 · 배경 · 폭과 부품(흐름 · 큰 인용)도 청사진에서 이미 최종 판과 같습니다.
    expect(blueprint!.html).toContain('data-surface="inverse"');
    expect(blueprint!.html).toContain('data-case-type="flow"');
    expect(blueprint!.html).not.toContain("/sections/misc/");
    expect(blueprint!.html).toContain("xp-metric-strip");
    expect(blueprint!.css).toContain('[data-slot-state="empty"]');

    const fills = events.filter((item) => item.event === "fill") as unknown as { path: string; text: string; done: boolean }[];
    const last = (path: string) => { const found = fills.filter((item) => item.path === path).at(-1); return found && { path: found.path, text: found.text, done: found.done }; };
    expect(last("/profile/headline")).toEqual({ path: "/profile/headline", text: "커머스 화면의 성능을 고칩니다.", done: true });
    expect(last("/sections/lcp/metrics/0/before")).toEqual({ path: "/sections/lcp/metrics/0/before", text: "3.8초", done: true });
    // 글은 조각마다 자라며 오고, 근거의 id는 글 칸이 아니라 보내지 않습니다.
    expect(fills.filter((item) => item.path === "/sections/lcp/title").length).toBeGreaterThan(1);
    expect(fills.some((item) => item.path.endsWith("/id"))).toBe(false);
  });
});

describe("차트 부품의 청사진", () => {
  it("막대 차트 · 기간 차트를 고른 설계도 청사진을 낸다 — 표지로는 길이 · 기간을 읽지 못해 기술형 · 목록으로 그린다", async () => {
    const charted = {
      ...spec,
      elements: {
        ...spec.elements,
        index: { ...spec.elements.index, props: { ...spec.elements.index.props, variant: "timeline" } },
        career: { ...spec.elements.career, props: { ...spec.elements.career.props, variant: "chart" } },
        "section-ui": { type: "CaseBars", props: { section: { $state: "/sectionById/ui" } }, children: [] },
      },
    };
    const barsPlan = { ...plan, career: true, sections: plan.sections.map((item) => (item.id === "ui" ? { ...item, form: "bars", budget: { ...item.budget, metrics: 2 } } : item)) };
    const pages: { html: string }[] = [];
    const sink = { delta: () => undefined, thinking: () => undefined, blueprint: (page: { html: string; css: string }) => pages.push(page), stage: () => undefined };
    const errors: string[] = [];
    const original = console.error;
    console.error = (line: string) => { errors.push(String(line)); };
    try {
      await new StructuredPageGenerator(new RoutedAi((request) => (request.contract === "page_design" ? { plan: barsPlan, spec: charted } : fill()))).generate(context, sink as never);
    } finally {
      console.error = original;
    }
    expect(errors.filter((line) => line.includes("blueprint_failed"))).toEqual([]);
    expect(pages).toHaveLength(1);
    expect(pages[0]!.html).toContain('data-case-type="technical"');
  });
});

describe("기간 숫자", () => {
  it("섹션 · 경력 기간에 출처에 없는 숫자가 있으면 그 칸만 고쳐 받는다", () => {
    const filled = fill();
    const output = {
      ...filled,
      sections: { ...filled.sections, lcp: { ...filled.sections.lcp, metrics: [], period: "2019.01 — 2020.12" }, ui: { ...filled.sections.ui, period: "" } },
      career: [{ period: "2023.03 — 현재", organization: "모아마켓", role: "-", description: "-" }],
    };
    const groundSource = "상품 상세 LCP 3.8초 1.9초 컴포넌트 48개 2023.03 — 현재";
    const violations = fillViolations(output, { ...plan, career: true } as never, plan.sections.filter((item) => item.include) as never, { author: "가상 하린", groundSource, evidenceCount: 1 });
    expect(violations.filter((item) => item.path.endsWith("/period")).map((item) => item.path)).toEqual(["/sections/lcp/period"]);
  });
});

describe("수치 값 모양", () => {
  it("숫자와 단위만 받고 설명이 붙은 값은 거절한다", () => {
    for (const value of ["1.9초", "420KB", "1,200만 건", "-40%", "10만 행", "~3배"]) expect(METRIC_VALUE_PATTERN.test(value), value).toBe(true);
    for (const value of ["10만 행 끊김 없이 스크롤", "약 세 배", "3.8초 → 1.9초", "절반 이하"]) expect(METRIC_VALUE_PATTERN.test(value), value).toBe(false);
  });
});

describe("내용에 맞춘 부품 내림", () => {
  const section = (id: string, extra: Partial<StructuredPortfolioContent["sections"][number]> = {}) => ({
    id, title: id, summary: "", body: "", pattern: "project" as const, details: [], media: [], sourceIds: [], ...extra,
  });
  const content: StructuredPortfolioContent = {
    version: 1,
    profile: { name: "가상 하린", role: "개발자", headline: "화면을 고칩니다.", intro: "", focus: [] },
    sections: [
      section("a", { details: [{ label: "문제", text: "-" }, { label: "결과", text: "-" }] }),
      section("b"),
      section("c", { quote: "한 문장입니다." }),
    ],
    career: [],
    evidence: [],
    contact: null,
  };
  const node = (type: string, props: Record<string, unknown>) => ({ type, props, children: [] as string[] });
  const raw = {
    root: "page",
    elements: {
      page: { type: "PortfolioPage", props: {}, children: ["intro", "group-1", "section-c", "quote-2"] },
      intro: node("NameIntro", { profile: { $state: "/profile" } }),
      "group-1": { type: "Band", props: { variant: "panel" }, children: ["section-a", "quote-1"] },
      "section-a": node("CaseFlow", { section: { $state: "/sectionById/a" } }),
      "section-b": node("CaseShowcase", { section: { $state: "/sectionById/b" } }),
      "section-c": node("CaseFlow", { section: { $state: "/sectionById/c" } }),
      "quote-1": node("PullQuote", { section: { $state: "/sectionById/b" } }),
      "quote-2": node("PullQuote", { section: { $state: "/sectionById/c" } }),
    },
  };

  it("단계가 모자란 흐름 · 이미지 없는 전시를 글 부품으로 내리고, 인용 문장이 없는 큰 인용을 지운다", () => {
    const fitted = fitToContent(raw, content);
    // 설명 항목이 둘이면 과정형, 아니면 기사형입니다.
    expect(fitted.elements["section-a"]?.type).toBe("CaseProcess");
    expect(fitted.elements["section-c"]?.type).toBe("CaseEssay");
    expect(fitted.elements["section-b"]?.type).toBe("CaseEssay");
    expect(fitted.elements["quote-1"]).toBeUndefined();
    expect(fitted.elements["quote-2"]?.type).toBe("PullQuote");
    // 인용을 잃은 묶음도 자식 수 조건(Band 1–3개)을 지키므로 남습니다.
    expect(fitted.elements["group-1"]?.children).toEqual(["section-a"]);
  });

  it("같은 단위 수치가 없는 막대 차트와 기간을 두 개 읽지 못한 기간 차트를 내린다", () => {
    const years = [{ label: "TypeScript", value: "5년" }, { label: "Next.js", value: "2년" }];
    const mixed = [{ label: "LCP", value: "1.9초" }, { label: "JS", value: "180KB" }];
    const charts = (value: StructuredPortfolioContent) =>
      fitToContent(
        {
          root: "page",
          elements: {
            page: { type: "PortfolioPage", props: {}, children: ["intro", "index", "section-a", "section-b", "career"] },
            intro: node("NameIntro", { profile: { $state: "/profile" } }),
            index: node("ProjectIndex", { sections: { $state: "/sections" }, variant: "timeline" }),
            "section-a": node("CaseBars", { section: { $state: "/sectionById/a" } }),
            "section-b": node("CaseBars", { section: { $state: "/sectionById/b" } }),
            career: node("CareerTimeline", { career: { $state: "/career" }, variant: "chart" }),
          },
        },
        value,
      ).elements;
    const career = (period: string, id: string) => ({ id, period, organization: id, role: "-", description: "-" });
    const dated: StructuredPortfolioContent = {
      ...content,
      sections: [section("a", { metrics: years, period: "2024.04 — 2024.11" }), section("b", { metrics: mixed, period: "2023.03 — 현재" })],
      career: [career("2023.03 — 현재", "c1"), career("2021.01 — 2023.02", "c2")],
    };
    let fitted = charts(dated);
    expect(fitted["section-a"]?.type).toBe("CaseBars");
    expect(fitted["section-b"]?.type).toBe("CaseTechnical");
    expect(fitted.index?.props.variant).toBe("timeline");
    expect(fitted.career?.props.variant).toBe("chart");
    fitted = charts({ ...dated, sections: dated.sections.map((item, index) => (index ? { ...item, period: "6개월" } : item)), career: [career("", "c1"), career("2021.01 — 2023.02", "c2")] });
    expect(fitted.index?.props.variant).toBe("rows");
    expect(fitted.career?.props.variant).toBe("list");
  });

  it("고쳐도 트리에 연결되지 않은 요소는 선택 요소면 지우고, 나머지는 페이지에 붙인다", () => {
    const loose = {
      ...raw,
      elements: {
        ...raw.elements,
        index: node("ProjectIndex", { sections: { $state: "/sections" }, variant: "rows" }),
        "group-2": { type: "Columns", props: { variant: "even" }, children: ["section-b", "quote-1"] },
      },
    };
    const fitted = fitToContent(loose, content);
    expect(fitted.elements["group-2"]).toBeUndefined();
    expect(fitted.elements[fitted.root]?.children.slice(0, 2)).toEqual(["intro", "index"]);
    expect(fitted.elements[fitted.root]?.children).toContain("section-b");
  });

  it("설계안의 크기 · 배경 · 폭을 사례 요소에 옮기고 설계안이 없으면 그대로 둔다", () => {
    const stage = { id: "c", emphasis: "lead", surface: "field", width: "bleed" } as const;
    const fitted = fitToContent(raw, content, { sections: [stage as never] });
    expect(fitted.elements["section-c"]?.props).toMatchObject({ scale: "lead", surface: "field", width: "bleed" });
    expect(fitToContent(raw, content).elements["section-c"]?.props).not.toHaveProperty("scale");
    // 글 · 목록형 사례 행에는 옮기지 않습니다. 다듬기의 모델 스키마가 그 props를 받지 않습니다.
    const rows = { ...raw, elements: { ...raw.elements, "section-c": node("CaseRow", { section: { $state: "/sectionById/c" } }) } };
    expect(fitToContent(rows, content, { sections: [stage as never] }).elements["section-c"]?.props).toEqual({ section: { $state: "/sectionById/c" } });
  });
});
