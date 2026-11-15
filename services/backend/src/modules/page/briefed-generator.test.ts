import { describe, expect, it } from "vitest";
import { pagePolicyPrompt } from "@expresso/contracts";

import { ScriptedAiClient } from "../../platform/ai/scripted-client.js";
import { BriefedPageGenerator, briefedSystem, skillBody } from "./briefed-generator.js";
import { AiPageGenerator, type PageGenerationContext } from "./generator.js";
import type { PageBrief } from "./page-brief.js";

const context: PageGenerationContext = {
  userId: null,
  author: { name: "윤하린" },
  portfolioPlan: null,
  sections: [{ id: "s-perf", title: "성능 개선", purpose: "수치로 보인다", goal: "", points: [], targetLength: 300, sourceIds: ["r1"] }],
  evidence: [{ id: "r1", label: "대시보드 성능", text: "LCP를 4.2초에서 1.9초로 줄였다." }],
  media: [],
  jobTitle: null,
  company: null,
  modelTier: "sonnet",
  // 디자인 시스템을 고른 포트폴리오의 문맥은 키트를 켠 채로 옵니다.
  useKit: true,
  style: {
    name: "Clarity", description: "한 줄기의 읽기 흐름", toneTags: [], background: "#ffffff", text: "#111111", accent: "#0066cc",
    font: "sans", density: "comfortable", structure: "single-column", composition: "linear-story", typography: "display-led",
    geometry: "contained-cards", motion: "calm-responsive", interaction: "evidence-exploration", imagery: "typography-first", antiPatterns: [],
  },
};

const brief: PageBrief = {
  role: "프론트엔드 개발자",
  headline: "느린 화면을 재서 고치는 프론트엔드 개발자입니다.",
  intro: "",
  focus: [],
  subject: "대시보드",
  lead: [],
  sections: [{ id: "s-perf", title: "성능 개선", claim: "4.2초 걸리던 첫 화면", body: "1.9초로 줄였다.", metrics: [{ label: "LCP", value: "1.9초", before: "4.2초" }] }],
  career: [],
  evidence: [{ id: "r1", title: "대시보드 성능", kind: "기록", summary: "" }],
};

const SKILL = "---\nname: frontend-design\n---\n\n# Frontend Design\n\n지침 본문";
const draft = { html: "<main><h1>윤하린</h1><p>LCP 4.2초에서 1.9초</p></main>", css: "main{margin:0}", rationale: "수치를 첫 화면에 세웠다" };
const plan = { subject: "대시보드", palette: "먹 #111", type: "고딕", layout: "한 열", signature: "큰 수치", revised: "" };

describe("정리본 · 디자인 지침 자유 생성", () => {
  it("둘 다 끄면 키트를 끈 자유 생성과 같은 시스템 · 같은 요청을 보낸다", async () => {
    const baseline = new ScriptedAiClient(() => draft);
    const lab = new ScriptedAiClient(() => draft);
    await new AiPageGenerator(baseline).generate({ ...context, useKit: false });
    const result = await new BriefedPageGenerator(lab).generate(context);
    expect(lab.calls).toHaveLength(1);
    expect(lab.calls[0]).toEqual(baseline.calls[0]);
    expect(result.plan).toBeNull();
    expect(result.brief).toBeNull();
  });

  it("문맥이 키트를 켜고 와도 키트 부품을 요구하지 않는다", async () => {
    const kit = new ScriptedAiClient(() => ({ ...draft, html: `<div class="k-page">${draft.html}</div>` }));
    await new AiPageGenerator(kit).generate(context);
    const lab = new ScriptedAiClient(() => draft);
    const result = await new BriefedPageGenerator(lab).generate(context);
    expect(kit.calls[0]!.system).toContain("지면 키트");
    expect(lab.calls[0]!.system).not.toContain("지면 키트");
    expect(result.qaReport.status).toBe("ready");
  });

  it("정제를 켜면 정리 호출 뒤에 지면을 쓰고, 지면 요청은 원문 대신 정리본을 받는다", async () => {
    const ai = new ScriptedAiClient((request) => (request.contract === "page_fill" ? brief : draft));
    const result = await new BriefedPageGenerator(ai, { refine: true }).generate(context);
    expect(ai.calls.map((call) => call.contract)).toEqual(["page_fill", "page_generation"]);
    const prompt = ai.calls[1]!.prompt;
    expect(prompt).toContain("## 자료 정리본");
    expect(prompt).toContain("- 수치 · LCP: 4.2초 → 1.9초");
    expect(prompt).not.toContain("## 출처 맥락");
    expect(prompt).toContain("이름: 윤하린");
    expect(result.brief).toEqual(brief);
    expect(result.briefUsage).not.toBeNull();
  });

  it("받은 정리본이 있으면 정제 호출을 건너뛴다", async () => {
    const ai = new ScriptedAiClient(() => draft);
    const result = await new BriefedPageGenerator(ai, { refine: true, brief }).generate(context);
    expect(ai.calls.map((call) => call.contract)).toEqual(["page_generation"]);
    expect(result.briefUsage).toBeNull();
  });

  it("지침을 켜면 본문 뒤에 지면 정책을 다시 두고, 계획을 html보다 먼저 받는다", async () => {
    const ai = new ScriptedAiClient(() => ({ plan, ...draft }));
    const result = await new BriefedPageGenerator(ai, { designSkill: SKILL }).generate(context);
    const system = ai.calls[0]!.system;
    expect(system).not.toContain("name: frontend-design");
    expect(system.indexOf("지침 본문")).toBeGreaterThan(system.indexOf("## 디자인하는 법"));
    expect(system.lastIndexOf(pagePolicyPrompt())).toBeGreaterThan(system.indexOf("지침 본문"));
    expect(result.plan).toEqual(plan);
    expect(result.html).toContain("윤하린");
    // 지침만 켜면 요청은 키트를 끈 자유 생성과 같다.
    const baseline = new ScriptedAiClient(() => draft);
    await new AiPageGenerator(baseline).generate({ ...context, useKit: false });
    expect(ai.calls[0]!.prompt).toBe(baseline.calls[0]!.prompt);
  });

  it("지침이 없으면 시스템 프롬프트를 바꾸지 않는다", () => {
    expect(briefedSystem(null)).toBe(briefedSystem(undefined));
    expect(skillBody(SKILL)).toBe("# Frontend Design\n\n지침 본문");
  });

  it("스크립트는 소독으로 지우고, 모델이 쓴 스크립트 수와 지운 속성을 남긴다", async () => {
    const ai = new ScriptedAiClient(() => ({ plan, ...draft, html: `${draft.html}<button onclick="go()">열기</button><script>alert(1)</script>` }));
    const result = await new BriefedPageGenerator(ai, { designSkill: SKILL }).generate(context);
    expect(result.html).not.toContain("<script");
    expect(result.html).not.toContain("onclick");
    expect(result.blockedTags).toBe(1);
    expect(result.removed).toContain("속성 onclick");
  });
});
