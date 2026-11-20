import { describe, expect, it } from "vitest";
import { pagePolicyPrompt, PAGE_SCRIPT_BREAK } from "@expresso/contracts";

import { ScriptedAiClient } from "../../platform/ai/scripted-client.js";
import { findDesignSystemRevision } from "../design-systems/index.js";
import { createHash } from "node:crypto";
import { BriefedPageGenerator, briefedPrompt, briefedSystem, freePageGenerator, skillBody } from "./briefed-generator.js";
import { FRONTEND_DESIGN_SKILL } from "./design-skill/frontend-design.js";
import { FormatRoutingPageGenerator } from "./format-router.js";
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
    // 그림 스크립트를 쓰는 호출이라 정책도 스크립트 칸을 알린다.
    expect(system.lastIndexOf(pagePolicyPrompt({ script: true }))).toBeGreaterThan(system.indexOf("지침 본문"));
    expect(result.plan).toEqual(plan);
    expect(result.html).toContain("윤하린");
    // 지침만 켜면 요청은 키트를 끈 자유 생성과 같다.
    const baseline = new ScriptedAiClient(() => draft);
    await new AiPageGenerator(baseline).generate({ ...context, useKit: false });
    expect(ai.calls[0]!.prompt).toBe(baseline.calls[0]!.prompt);
  });

  it("토큰 방식은 색 · 서체 · 밀도만 넘기고 골격 규칙을 뺀다", () => {
    const grammar = briefedPrompt(context, brief);
    const tokens = briefedPrompt(context, brief, "tokens");
    expect(grammar).toContain("단일 칼럼 서사");
    expect(tokens).not.toContain("단일 칼럼 서사");
    expect(tokens).not.toContain("금지 패턴");
    expect(tokens).toContain("`#0066cc`");
    expect(tokens).toContain("서체 계열: 고딕");
    expect(tokens).toContain("배치 · 단 구성 · 첫 화면의 모양은 스타일이 정하지 않았다");
    expect(tokens).toContain("## 자료 정리본");
  });

  it("스펙 방식은 스타일 문법에 디자인 시스템의 시각 규칙을 더하고 부품별 내용 구성은 싣지 않는다", () => {
    const design = findDesignSystemRevision("5d8f5f2d-6d2a-4f24-9d1a-2b8f9e7c1202")!.spec;
    const spec = briefedPrompt({ ...context, design }, brief, "spec");
    expect(spec).toContain("단일 칼럼 서사");
    expect(spec).toContain(`## 고른 디자인 시스템 상세 — ${design.identity.name}`);
    expect(spec).toContain(design.identity.visualThesis);
    expect(spec).toContain(design.colors.surface.value);
    expect(spec).toContain(`면을 두르는 방식 ${design.componentKit.chrome}`);
    expect(spec).not.toContain(design.components.hero!.description);
    // 스펙이 없으면 스타일 문법만 남는다.
    expect(briefedPrompt(context, brief, "spec")).toBe(briefedPrompt(context, brief));
  });

  it("지침을 켜면 계획 → CSS → HTML 순서로 받는다 — 생성 중 미리보기가 꾸밈 없는 글을 보이지 않게", async () => {
    const seen: string[] = [];
    const ai = new ScriptedAiClient(() => ({ ...draft, plan }));
    await new BriefedPageGenerator(ai, { designSkill: SKILL }).generate(context, { delta: (text) => seen.push(text), thinking: () => undefined });
    // 가짜 공급자는 받은 객체를 그대로 흘리므로, 순서는 시스템 프롬프트의 안내로 확인한다.
    const system = ai.calls[0]!.system;
    expect(system.indexOf("- `plan`")).toBeLessThan(system.lastIndexOf("- `css`"));
    expect(system.lastIndexOf("- `css`")).toBeLessThan(system.lastIndexOf("- `html`"));
    expect(seen.join("")).toContain("main{margin:0}");
  });

  it("제품의 자유 생성은 정리본 · 내장 지침 · 색과 서체만 넘기는 조합이고 키트를 쓰지 않는다", async () => {
    const ai = new ScriptedAiClient((request) => (request.contract === "page_fill" ? brief : { plan, ...draft }));
    const generator = freePageGenerator(ai);
    expect(generator.usesKit()).toBe(false);
    const thinking: number[] = [];
    await generator.generate(context, { delta: () => undefined, thinking: (tokens) => thinking.push(tokens) });
    expect(ai.calls.map((call) => call.contract)).toEqual(["page_fill", "page_generation"]);
    const { system, prompt } = ai.calls[1]!;
    expect(system).toContain("Approach this as the design lead");
    expect(prompt).toContain("## 자료 정리본");
    expect(prompt).not.toContain("단일 칼럼 서사");
    // 내장 본문은 실험에 쓴 사본과 같다.
    expect(createHash("sha256").update(FRONTEND_DESIGN_SKILL).digest("hex")).toBe("51e3aa519fba86baab67503e71b2e604f1e9682213efb8f9536b48da980bf528");
  });

  it("지시를 붙여 고칠 때는 다시 정리하지 않고, 직전 지면 · 지시 · 디자인을 유지하라는 말을 싣는다", async () => {
    const ai = new ScriptedAiClient((request) => (request.contract === "page_fill" ? brief : { plan, ...draft }));
    await freePageGenerator(ai).generate({ ...context, instruction: "첫 화면을 더 크게", previous: { html: "<main>직전 지면</main>", css: "main{color:red}" } });
    // 정제 호출 없이 지면 호출 한 번이다. 사람이 화면 앞에서 기다린다.
    expect(ai.calls.map((call) => call.contract)).toEqual(["page_generation"]);
    const prompt = ai.calls[0]!.prompt;
    expect(prompt).toContain("## 출처 맥락");
    expect(prompt).not.toContain("단일 칼럼 서사");
    expect(prompt).toContain("<main>직전 지면</main>");
    expect(prompt).toContain("## 지시\n첫 화면을 더 크게");
    expect(prompt.indexOf("## 지시")).toBeLessThan(prompt.indexOf("지금 지면의 디자인(색 · 서체 · 배치 · 클래스 이름)과 글을 그대로 두고"));
    // 새로 만드는 요청에는 그 말이 없다.
    await freePageGenerator(ai).generate({ ...context, previous: { html: "<main>직전 지면</main>", css: "" } });
    expect(ai.calls.at(-1)!.prompt).not.toContain("이번 요청은 지금 지면을 고치는 일이다");
  });

  it("지면 기록의 사용량에 정제 호출을 더한다", async () => {
    const ai = new ScriptedAiClient((request) => (request.contract === "page_fill" ? brief : { plan, ...draft }));
    const result = await freePageGenerator(ai).generate(context);
    // 가짜 공급자는 호출마다 $0.01 · 50ms · 출력 100토큰을 낸다.
    expect(result.usage.costUsd).toBeCloseTo(0.02);
    expect(result.manifest.usage.costUsd).toBeCloseTo(0.02);
    expect(result.manifest.usage.durationMs).toBe(100);
    expect(result.briefUsage?.costUsd).toBeCloseTo(0.01);
  });

  it("라우터는 고른 방식의 생성기에게 키트를 쓰는지 묻는다", () => {
    const kit = { generate: async () => { throw new Error("부르지 않는다"); } };
    const router = new FormatRoutingPageGenerator({ html: freePageGenerator(new ScriptedAiClient(() => draft)), "json-render": kit }, "json-render");
    expect(router.usesKit({ ...context, pageFormat: "html" })).toBe(false);
    expect(router.usesKit({ ...context, pageFormat: "json-render" })).toBe(true);
    expect(router.usesKit(context)).toBe(true);
  });

  it("정리본이 없으면 스타일 방식을 바꿔도 원문 자료를 싣는다", () => {
    const prompt = briefedPrompt(context, null, "tokens");
    expect(prompt).toContain("## 출처 맥락");
    expect(prompt).not.toContain("단일 칼럼 서사");
    expect(prompt).not.toContain("## 자료 정리본");
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
  describe("디자인 대화에서 고른 첫 화면", () => {
    const seed = {
      name: "측정판 리포트", words: "밝은 회색에 파랑", html: '<header class="hero"><h1>윤하린</h1></header>', css: "body{margin:0}.hero{color:#111827}",
      tokens: { background: "#f3f4f6", text: "#111827", accent: "#1d4ed8", font: "mono" as const, density: "compact" as const },
    };
    const rest = { plan, css: ".sec{margin:0}", html: '<section class="sec"><h2>성능 개선</h2></section>', rationale: "첫 화면을 이었다" };

    it("모델은 첫 화면 뒤만 쓰고, 지면은 고른 첫 화면의 마크업과 CSS로 시작한다", async () => {
      const ai = new ScriptedAiClient((request) => (request.contract === "page_fill" ? brief : rest));
      const seeded: { html: string; css: string }[] = [];
      const result = await freePageGenerator(ai).generate({ ...context, seed }, { delta: () => undefined, thinking: () => undefined, seed: (page) => { seeded.push(page); } });
      expect(result.html).toBe(`${seed.html}\n${rest.html}`);
      expect(result.css).toBe(`${seed.css}\n${rest.css}`);
      // 화면에는 자료를 정리하기 전에 첫 화면부터 보낸다.
      expect(seeded).toEqual([{ html: seed.html, css: seed.css }]);
      const prompt = ai.calls.at(-1)!.prompt;
      expect(prompt).toContain("## 확정된 첫 화면");
      expect(prompt).toContain(seed.html);
      expect(prompt).toContain("`html`에는 첫 화면 **바로 다음부터** 쓴다");
      // 스타일 문단은 문법(고딕으로 내린 값) 대신 첫 화면이 쓴 색과 서체 계열을 적는다.
      expect(prompt).toContain("고른 것: **측정판 리포트**");
      expect(prompt).toContain("강조 `#1d4ed8`");
      expect(prompt).toContain("서체 계열: 고정폭");
      expect(prompt).not.toContain("고른 것: **Clarity**");
    });

    it("첫 화면의 그림 스크립트를 보이고, 지면 스크립트는 첫 화면의 것과 이어 쓴 것을 모듈로 나눠 잇는다", async () => {
      const seedScript = 'import * as THREE from "three"; hero()';
      const ai = new ScriptedAiClient((request) => (request.contract === "page_fill" ? brief : { ...rest, script: 'import * as THREE from "three"; rings()' }));
      const result = await freePageGenerator(ai).generate({ ...context, seed: { ...seed, script: seedScript } });
      expect(result.script).toBe(`${seedScript}${PAGE_SCRIPT_BREAK}import * as THREE from "three"; rings()`);
      const prompt = ai.calls.at(-1)!.prompt;
      expect(prompt).toContain(`\`\`\`js\n${seedScript}\n\`\`\``);
      expect(prompt).toContain("`script`에는 뒤 섹션의 그림에 필요한 스크립트만 쓴다");
      // 그림이 없는 지면은 칸을 두지 않는다.
      const plain = await freePageGenerator(new ScriptedAiClient((request) => (request.contract === "page_fill" ? brief : rest))).generate({ ...context, seed });
      expect(plain.script).toBeUndefined();
    });

    it("지금 지면을 지시로 고칠 때는 첫 화면을 다시 붙이지 않는다 — 직전 지면에 이미 있다", async () => {
      const ai = new ScriptedAiClient(() => ({ plan, ...draft }));
      const previous = { html: `${seed.html}<section>앞 판</section>`, css: seed.css };
      const result = await freePageGenerator(ai).generate({ ...context, seed, previous, instruction: "더 차분하게" });
      expect(result.html).toBe(draft.html);
      expect(ai.calls.at(-1)!.prompt).not.toContain("## 확정된 첫 화면");
    });

    it("첫 화면이 없으면 요청과 결과가 지금과 같다", async () => {
      const ai = new ScriptedAiClient((request) => (request.contract === "page_fill" ? brief : { plan, ...draft }));
      const result = await freePageGenerator(ai).generate(context);
      expect(result.html).toBe(draft.html);
      expect(ai.calls.at(-1)!.prompt).not.toContain("확정된 첫 화면");
    });
  });
});
