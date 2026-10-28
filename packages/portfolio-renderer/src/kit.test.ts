import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DesignSystemSpecV2Schema,
  STRUCTURED_BACKDROPS,
  type StructuredPortfolioContent,
} from "@expresso/contracts";
import { renderStructuredPortfolio } from "./renderer.js";
import { retrievePageLibrary } from "./library.js";
import { metricNumber } from "./kit.js";
import { BACKDROP_CSS } from "./backdrop.js";
import { KIT_CSS } from "./kit-styles.js";

// 백엔드 기본 디자인(Clarity · Signal)의 스펙을 그대로 떠 둔 고정 자료입니다.
const designs = JSON.parse(readFileSync(new URL("./fixtures/designs.json", import.meta.url), "utf8"));
const clarity = DesignSystemSpecV2Schema.parse(designs.clarity);
const signal = DesignSystemSpecV2Schema.parse(designs.signal);

const image = { src: "data:image/png;base64,AAAA", alt: "가상 회로 사진", origin: "fictional" as const };
const content: StructuredPortfolioContent = {
  version: 1,
  profile: {
    name: "가상 인물",
    role: "로봇 엔지니어",
    headline: "현장에서 멈추지 않는 경로를 설계합니다.",
    intro: "첫 문단입니다.\n\n둘째 문단입니다.",
    focus: ["경로 계획", "센서 융합"],
  },
  sections: [
    {
      id: "a",
      title: "창고 로봇 경로 재설계",
      summary: "정지 시간을 줄인 우회 계획",
      body: "우회 계획을 세웠습니다.",
      pattern: "project",
      details: [
        { label: "문제", text: "교차로 정체" },
        { label: "결과", text: "정지 시간 40% 감소" },
      ],
      media: [image],
      sourceIds: ["e1"],
    },
    {
      id: "b",
      title: "다루는 기술",
      summary: "현장에서 쓴 도구",
      body: "<script>alert(1)</script>",
      pattern: "skills",
      details: [{ label: "ROS 2", text: "3년간 주행 스택 운영" }],
      media: [],
      sourceIds: [],
    },
  ],
  career: [
    { id: "c1", organization: "가상 물류", role: "엔지니어", period: "2022 – 현재", description: "주행 스택 담당" },
  ],
  evidence: [
    { id: "e1", kind: "문서", title: "경로 실험 보고서", summary: "실험 기록", body: "기록 본문" },
  ],
  contact: null,
};

function pageSpec(intro: Record<string, unknown> = {}, indexVariant = "rows") {
  return {
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
        children: ["intro", "index", "section-a", "section-b", "career", "evidence"],
      },
      intro: {
        type: "NameIntro",
        props: { profile: { $state: "/profile" }, sections: { $state: "/sections" }, ...intro },
        children: [],
      },
      index: {
        type: "ProjectIndex",
        props: { sections: { $state: "/sections" }, variant: indexVariant },
        children: [],
      },
      "section-a": { type: "CaseTechnical", props: { section: { $state: "/sectionById/a" } }, children: [] },
      "section-b": { type: "ContentPanel", props: { section: { $state: "/sectionById/b" } }, children: [] },
      career: { type: "CareerTimeline", props: { career: { $state: "/career" } }, children: [] },
      evidence: { type: "EvidenceGrid", props: { evidence: { $state: "/evidence" } }, children: [] },
    },
  };
}

describe("토큰 키트 경로", () => {
  it("수집 원본이 없고 디자인이 있으면 키트로 그리고 글꼴 불러오기를 CSS 맨 앞에 둔다", () => {
    const { html, css } = renderStructuredPortfolio(pageSpec(), content, { design: clarity });
    expect(html).toContain('class="xp-page"');
    expect(html).toContain('data-layout="single-column"');
    expect(html).toContain('data-chrome="plain"');
    expect(html).not.toContain("sp-page");
    expect(css.startsWith('@import url("https://fonts.googleapis.com/')).toBe(true);
    expect(css).toContain("--xp-muted:");
    expect(css).toContain("prefers-reduced-motion");
    expect(css).toContain("@media print");
    // 고정 서체는 키트에 쓰지 않습니다. 서체는 디자인 변수로만 들어옵니다.
    expect(css).not.toMatch(/Pretendard|JetBrains Mono|Outfit/);
  });

  it("디자인마다 구성 규칙과 배치를 루트 속성으로 바꾼다", () => {
    const { html } = renderStructuredPortfolio(pageSpec(), content, { design: signal });
    expect(html).toContain('data-layout="dense-grid"');
    expect(html).toContain('data-marker="numbered"');
    expect(html).toContain('data-emphasis="bar"');
  });

  it("수집 원본이 하나라도 있으면 저장된 판의 렌더러로 그린다", () => {
    const legacy = pageSpec() as ReturnType<typeof pageSpec> & {
      elements: { intro: { props: Record<string, unknown> } };
    };
    legacy.elements.intro.props.sourceId = retrievePageLibrary(content).intro[0]!.renderKey!;
    const { html, css } = renderStructuredPortfolio(legacy, content, { design: clarity });
    expect(html).not.toContain("xp-page");
    expect(css).not.toContain("--xp-muted:");
  });

  it("디자인이 없으면 저장된 판의 렌더러로 그린다", () => {
    const { html } = renderStructuredPortfolio(pageSpec(), content);
    expect(html).not.toContain("xp-page");
  });

  it("첫 화면 구도를 고르고, 이미지 구도는 이미지가 있을 때만 쓴다", () => {
    expect(renderStructuredPortfolio(pageSpec({ variant: "split" }), content, { design: clarity }).html)
      .toContain('data-variant="split"');
    expect(renderStructuredPortfolio(pageSpec({ variant: "media" }), content, { design: clarity }).html)
      .toContain('class="xp-hero-art"');
    // 어느 구도든 집중 분야를 빠뜨리지 않습니다.
    for (const variant of ["statement", "split", "media"])
      expect(renderStructuredPortfolio(pageSpec({ variant }), content, { design: clarity }).html).toContain("<li>센서 융합</li>");
    const noImage = structuredClone(content);
    noImage.sections[0]!.media = [];
    const fallback = renderStructuredPortfolio(pageSpec({ variant: "media" }), noImage, { design: clarity }).html;
    expect(fallback).toContain('data-variant="statement"');
    expect(fallback).not.toContain("xp-hero-art");
  });

  it("연락처가 없으면 연락 행동을 그리지 않는다", () => {
    const { html } = renderStructuredPortfolio(pageSpec(), content, { design: clarity });
    expect(html).not.toContain('href="#contact"');
    const withContact = { ...content, contact: { label: "메일 보내기", href: "mailto:someone@example.com" } };
    const spec = pageSpec();
    spec.elements.page.children.push("contact");
    (spec.elements as Record<string, unknown>).contact = {
      type: "Contact",
      props: { contact: { $state: "/contact" } },
      children: [],
    };
    const rendered = renderStructuredPortfolio(spec, withContact, { design: clarity }).html;
    expect(rendered).toContain('href="#contact"');
    expect(rendered).toContain('id="contact"');
  });

  it("사례·역량·근거를 키트 구성으로 그리고 본문을 실행 코드로 해석하지 않는다", () => {
    const { html } = renderStructuredPortfolio(pageSpec({}, "mosaic"), content, { design: clarity });
    expect(html).toContain('class="xp-mosaic"');
    expect(html).toContain('data-case-type="technical"');
    // 사례 번호는 읽는 순서로 매기고, 컨테이너 안에서도 이어집니다.
    expect(html).toMatch(/<span class="xp-num">01<\/span> · 프로젝트/);
    // 역량 사례에는 번호를 붙이지 않습니다.
    expect(html).toContain('<p class="xp-eyebrow">역량</p>');
    expect(html).toContain("<dt>문제</dt><dd>교차로 정체</dd>");
    expect(html).toContain('<ul class="xp-tags"><li>ROS 2</li></ul>');
    expect(html).toContain('href="#source-e1"');
    expect(html).toContain("경로 실험 보고서 ↗");
    expect(html).toContain('id="source-e1"');
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
});

describe("사례 번호", () => {
  it("목차와 사례 머리가 Spec의 읽는 순서로 같은 번호를 쓴다", () => {
    const two = structuredClone(content);
    two.sections.push({ ...two.sections[0]!, id: "c", title: "두 번째 프로젝트", sourceIds: [] });
    const spec = pageSpec();
    // 사례 c를 a보다 먼저 둡니다.
    spec.elements.page.children = ["intro", "index", "section-c", "section-a", "section-b", "career", "evidence"];
    (spec.elements as Record<string, unknown>)["section-c"] = {
      type: "CaseEssay",
      props: { section: { $state: "/sectionById/c" } },
      children: [],
    };
    const { html } = renderStructuredPortfolio(spec, two, { design: clarity });
    expect(html).toMatch(/href="#section-c"><span class="xp-num">01<\/span>/);
    expect(html).toMatch(/href="#section-a"><span class="xp-num">02<\/span>/);
    expect(html).toMatch(/id="section-c"[^]*?<span class="xp-num">01<\/span> · 프로젝트/);
    expect(html).toMatch(/id="section-a"[^]*?<span class="xp-num">02<\/span> · 프로젝트/);
  });
  it("목차는 내용 순서가 아니라 페이지에서 읽는 순서로 항목을 놓는다", () => {
    const two = structuredClone(content);
    two.sections.push({ ...two.sections[0]!, id: "c", title: "두 번째 프로젝트", sourceIds: [] });
    for (const variant of ["rows", "mosaic", "rail", "poster"]) {
      const spec = pageSpec({}, variant);
      // 내용에서는 a가 먼저지만 페이지에는 c를 먼저 둡니다.
      spec.elements.page.children = ["intro", "index", "section-c", "section-a", "section-b", "career", "evidence"];
      (spec.elements as Record<string, unknown>)["section-c"] = {
        type: "CaseEssay",
        props: { section: { $state: "/sectionById/c" } },
        children: [],
      };
      const { html } = renderStructuredPortfolio(spec, two, { design: clarity });
      const index = html.slice(html.indexOf('id="work"'), html.indexOf('id="section-c"'));
      expect(index.indexOf('href="#section-c"'), variant).toBeGreaterThan(-1);
      expect(index.indexOf('href="#section-c"'), variant).toBeLessThan(index.indexOf('href="#section-a"'));
    }
  });
  it("이미지가 있는 사례는 어느 사례 유형이든 이미지를 하나 이상 표시한다", () => {
    for (const type of ["CaseEssay", "CaseGallery", "CaseTechnical", "CaseProcess", "ContentPanel"]) {
      const spec = pageSpec();
      (spec.elements["section-a"] as { type: string }).type = type;
      const { html } = renderStructuredPortfolio(spec, content, { design: clarity });
      const section = html.slice(html.indexOf('id="section-section-a"') >= 0 ? html.indexOf('id="section-section-a"') : html.indexOf('id="section-a"'));
      expect(section.slice(0, section.indexOf("</article>")), type).toContain(`alt="${image.alt}"`);
    }
  });
  it("사례 블록의 자식은 제목과 본문 묶음 둘뿐이다", () => {
    const { html } = renderStructuredPortfolio(pageSpec(), content, { design: clarity });
    for (const match of html.matchAll(/<article id="section-[^"]+" class="xp-block xp-case"[^>]*>(<header class="xp-head">[\s\S]*?<\/header>)(<div class="xp-case-body">)/g))
      expect(match[2]).toBe('<div class="xp-case-body">');
    expect([...html.matchAll(/class="xp-block xp-case"/g)].length).toBe([...html.matchAll(/class="xp-case-body"/g)].length);
  });
});

describe("포트폴리오 유형", () => {
  const archetypeSpec = (archetype: "poster" | "list") => {
    const base = pageSpec(archetype === "poster" ? { variant: "poster" } : { variant: "sentence" }, "poster");
    const elements = base.elements as Record<string, { type: string; props: Record<string, unknown>; children: string[] }>;
    elements.page!.props.archetype = archetype;
    if (archetype === "list") {
      elements.page!.children = ["intro", "section-a", "section-b", "career", "evidence"];
      delete elements.index;
      elements["section-a"]!.type = "CaseRow";
      elements["section-b"]!.type = "CaseRow";
    }
    return base;
  };

  it("포스터형은 이름 글자 수 단계 · 글자 띠 · 소개 단락 · 포스터 목차를 그린다", () => {
    const { html } = renderStructuredPortfolio(archetypeSpec("poster"), content, { design: clarity });
    expect(html).toContain('data-archetype="poster"');
    // "가상 인물"은 공백을 포함해 다섯 글자라 중간 단계입니다.
    expect(html).toContain('<h1 class="xp-poster-name" data-name-length="medium">가상 인물</h1>');
    expect(html).toContain('class="xp-marquee"');
    expect(html).toContain('<li>경로 계획</li>');
    expect(html).toContain('class="xp-poster-about"');
    expect(html).toContain("첫 문단입니다.");
    expect(html).toContain('class="xp-poster-index"');
  });

  it("글 · 목록형은 문장 첫 화면과 펼치는 사례 행을 그리고 항목표를 쓰지 않는다", () => {
    const withPeriod = structuredClone(content);
    withPeriod.sections[0]!.period = "2025.01 — 2025.05";
    const { html } = renderStructuredPortfolio(archetypeSpec("list"), withPeriod, { design: clarity });
    expect(html).toContain('data-archetype="list"');
    expect(html).toContain('<h1 class="xp-sentence">현장에서 멈추지 않는 경로를 설계합니다.</h1>');
    expect(html).toContain('<span class="xp-row-period xp-small">2025.01 — 2025.05</span>');
    expect(html).toContain("<details>");
    expect(html).toContain("<strong>문제</strong> 교차로 정체");
    expect(html).not.toContain("<dl");
    // 첫 사례 행 위에만 목록 제목을 둡니다.
    expect([...html.matchAll(/class="xp-row-heading"/g)]).toHaveLength(1);
    // 기간이 없는 행은 기간 칸을 그리지 않습니다.
    expect([...html.matchAll(/xp-row-period/g)]).toHaveLength(1);
  });

  it("유형이 없는 옛 판은 사례 상세형으로 그린다", () => {
    const { html } = renderStructuredPortfolio(pageSpec(), content, { design: clarity });
    expect(html).toContain('data-archetype="case-study"');
  });
});

describe("시각 부품과 지면 변화", () => {
  const rich: StructuredPortfolioContent = {
    ...content,
    sections: [
      {
        ...content.sections[0]!,
        quote: "멈추지 않는 경로가 먼저입니다.",
        steps: [
          { label: "관찰", text: "교차로 정체 기록" },
          { label: "설계", text: "" },
          { label: "검증", text: "현장 주행 시험" },
        ],
        metrics: [{ label: "정지 시간", value: "12분", before: "40분" }],
      },
      content.sections[1]!,
    ],
  };
  const withNodes = (nodes: Record<string, unknown>, children: string[]) => {
    const spec = pageSpec();
    Object.assign(spec.elements, nodes);
    (spec.elements.page as { children: string[] }).children = children;
    return spec;
  };

  it("크기 · 배경 · 폭을 최상위 블록의 data 속성으로 그리고 기본값에는 속성을 달지 않는다", () => {
    const spec = pageSpec();
    (spec.elements["section-a"] as { props: Record<string, unknown> }).props = { section: { $state: "/sectionById/a" }, scale: "lead", surface: "inverse", width: "bleed" };
    (spec.elements["section-b"] as { props: Record<string, unknown> }).props = { section: { $state: "/sectionById/b" }, scale: "standard", surface: "canvas", width: "content" };
    const { html, css } = renderStructuredPortfolio(spec, content, { design: clarity });
    expect(html).toMatch(/<article id="section-a" class="xp-block xp-case" data-case-type="technical" data-scale="lead" data-surface="inverse" data-width="bleed" data-bleed="">/);
    expect(html).toMatch(/<article id="section-b" class="xp-block xp-case" data-case-type="panel">/);
    for (const name of ["--xp-muted-field:", "--xp-muted-inverse:", "--xp-accent-inverse:"]) expect(css).toContain(name);
  });

  it("과정 흐름 · 큰 인용 · 이미지 전시를 최상위 블록으로 그리고 글은 받은 그대로 둔다", () => {
    const spec = withNodes(
      {
        "section-a": { type: "CaseFlow", props: { section: { $state: "/sectionById/a" } }, children: [] },
        "quote-1": { type: "PullQuote", props: { section: { $state: "/sectionById/a" }, surface: "field" }, children: [] },
      },
      ["intro", "index", "section-a", "quote-1", "section-b", "career", "evidence"],
    );
    const { html } = renderStructuredPortfolio(spec, rich, { design: clarity });
    // 단계 번호는 배열 순서로 매깁니다.
    expect(html).toMatch(/xp-flow-num">01<[\s\S]*관찰[\s\S]*xp-flow-num">02<[\s\S]*설계[\s\S]*xp-flow-num">03<[\s\S]*검증/);
    expect(html).toContain('<ol class="xp-flow" data-count="3">');
    expect(html).toContain('<figure class="xp-block xp-quote" data-surface="field"><blockquote class="xp-quote-text"><p>멈추지 않는 경로가 먼저입니다.</p>');
    expect(html).toContain('<a href="#section-a">창고 로봇 경로 재설계</a>');

    const showcase = withNodes({ "section-a": { type: "CaseShowcase", props: { section: { $state: "/sectionById/a" }, width: "bleed" }, children: [] } }, ["intro", "index", "section-a", "section-b", "career", "evidence"]);
    const shown = renderStructuredPortfolio(showcase, rich, { design: clarity }).html;
    expect(shown).toMatch(/<article id="section-a" class="xp-block xp-case xp-showcase" data-case-type="showcase" data-width="bleed" data-bleed=""><figure class="xp-showcase-art"><img src="data:image\/png;base64,AAAA" alt="가상 회로 사진"/);
  });

  it("큰 인용이 사례보다 앞에 있어도 사례 번호와 목차는 사례의 순서를 따른다", () => {
    const twoProjects: StructuredPortfolioContent = { ...rich, sections: [rich.sections[0]!, { ...rich.sections[1]!, pattern: "project", quote: "둘째 작업의 원칙입니다." }] };
    const spec = withNodes(
      { "quote-1": { type: "PullQuote", props: { section: { $state: "/sectionById/b" } }, children: [] } },
      ["intro", "index", "quote-1", "section-a", "section-b", "career", "evidence"],
    );
    const { html } = renderStructuredPortfolio(spec, twoProjects, { design: clarity });
    const head = (id: string) => html.slice(html.indexOf(`<article id="section-${id}"`)).match(/xp-num">(\d+)</)?.[1];
    expect(head("a")).toBe("01");
    expect(head("b")).toBe("02");
    expect(html.indexOf('href="#section-a"')).toBeLessThan(html.indexOf('href="#section-b"'));
  });

  it("청사진의 자리 표지처럼 숫자로 시작하지 않는 값은 막대 비율을 읽지 않고 중립 너비로 그린다", () => {
    expect(metricNumber("3.8초")).toBe(3.8);
    expect(metricNumber("1,200만 건")).toBe(1200);
    expect(metricNumber("-40%")).toBe(40);
    expect(metricNumber("⟦12⟧")).toBeNull();
    expect(metricNumber("약 3배")).toBeNull();
    const marked: StructuredPortfolioContent = { ...rich, sections: [{ ...rich.sections[0]!, metrics: [{ label: "⟦3⟧", value: "⟦4⟧", before: "⟦5⟧" }] }, rich.sections[1]!] };
    const spec = withNodes({ "section-a": { type: "CaseBeforeAfter", props: { section: { $state: "/sectionById/a" } }, children: [] } }, ["intro", "index", "section-a", "section-b", "career", "evidence"]);
    const { html } = renderStructuredPortfolio(spec, marked, { design: clarity });
    expect(html).toContain('data-bars="neutral"');
    expect(html).toContain('<span class="xp-bar-value">⟦5⟧</span>');
    expect(html).toContain('<span class="xp-bar-value">⟦4⟧</span>');
    expect(html).not.toContain("--w:");
    const real = renderStructuredPortfolio(spec, rich, { design: clarity }).html;
    expect(real).toContain('data-bars="on"');
    expect(real).toContain("--w:30%");
  });
});

describe("첫 화면 배경", () => {
  const hero = (html: string) => html.slice(html.indexOf('<header id="intro"'), html.indexOf("</header>", html.indexOf('<header id="intro"')) + 9);

  it("고른 배경을 첫 화면의 마지막 자식 층으로 그리고, none이면 층을 두지 않는다", () => {
    for (const backdrop of STRUCTURED_BACKDROPS) {
      const { html } = renderStructuredPortfolio(pageSpec({ variant: "statement", backdrop }), content, { design: clarity });
      const head = hero(html);
      if (backdrop === "none") {
        expect(head).not.toContain("xp-backdrop");
        expect(head).not.toContain("data-backdrop");
        continue;
      }
      expect(head).toContain(`data-backdrop="${backdrop}"`);
      expect(head).toMatch(/<div class="xp-backdrop" data-shape="[a-z]+" aria-hidden="true" data-bleed="">[\s\S]*<\/div><\/header>$/);
      expect(html).not.toContain("<script");
    }
  });

  it("다섯 구도 모두 배경을 그리고, 배경이 없는 옛 포스터는 사선 줄무늬다", () => {
    for (const variant of ["statement", "split", "media", "sentence", "poster"])
      expect(hero(renderStructuredPortfolio(pageSpec({ variant, backdrop: "rings" }), content, { design: clarity }).html)).toContain('data-shape="rings"');
    expect(hero(renderStructuredPortfolio(pageSpec({ variant: "poster" }), content, { design: clarity }).html)).toContain('data-backdrop="stripes"');
    expect(hero(renderStructuredPortfolio(pageSpec({ variant: "poster", backdrop: "none" }), content, { design: clarity }).html)).not.toContain("xp-backdrop");
    expect(hero(renderStructuredPortfolio(pageSpec({ variant: "statement" }), content, { design: clarity }).html)).not.toContain("xp-backdrop");
  });

  it("배경 CSS는 새 색을 만들지 않고 디자인에서 계산한 잉크 변수만 쓴다", () => {
    expect(BACKDROP_CSS).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|\b(?:black|white)\b/);
    expect(BACKDROP_CSS).not.toMatch(/filter\s*:|backdrop-filter/);
    const { css } = renderStructuredPortfolio(pageSpec({ variant: "statement", backdrop: "grid" }), content, { design: clarity });
    expect(css).toMatch(/\.xp-hero\[data-backdrop-ink="line"\]\{--xp-bd-1:#[0-9a-f]{6};--xp-bd-2:#[0-9a-f]{6};color:#[0-9a-f]{6};--xp-muted:#[0-9a-f]{6}/);
    // 옛 포스터 면의 줄무늬는 배경 층으로 옮겼습니다. 첫 화면 조상에 배경 이미지가 없어야 렌더 대비 검사가 글자를 잽니다.
    expect(css).not.toContain("repeating-linear-gradient(-45deg,color-mix(in srgb,var(--xp-action-text)");
  });

  it("반복 모션은 움직임 줄이기를 고르지 않았고 모션 없음 지면이 아닐 때만 돈다", () => {
    const [still, moving] = BACKDROP_CSS.split("@media (prefers-reduced-motion:no-preference){");
    expect(still).not.toMatch(/animation:xp-bd-/);
    const lines = moving!.split("\n").filter((line) => line.includes("animation:xp-bd-"));
    expect(lines.length).toBeGreaterThanOrEqual(5);
    for (const line of lines) expect(line.trim().startsWith('.xp-page:not([data-motion="none"])')).toBe(true);
  });
});

/** `start`로 시작하는 at-규칙 블록의 범위입니다. 중괄호 짝으로 닫는 자리를 찾습니다. */
function blockRange(css: string, start: string, from = 0): [number, number] {
  const open = css.indexOf(start, from);
  expect(open, `${start} 블록이 없습니다`).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (let index = css.indexOf("{", open); index < css.length; index++) {
    if (css[index] === "{") depth++;
    if (css[index] === "}" && --depth === 0) return [open, index];
  }
  throw new Error(`${start} 블록이 닫히지 않습니다`);
}
const positions = (css: string, needle: string) => [...css.matchAll(new RegExp(needle.replace(/[()[\]]/g, "\\$&"), "g"))].map((match) => match.index!);

describe("등장 규칙(data-reveal)", () => {
  it("스크롤 등장 선언은 움직임 줄이기가 아닐 때 · 스크롤 타임라인을 지원할 때만 있다", () => {
    const [motionStart, motionEnd] = blockRange(KIT_CSS, "@media (prefers-reduced-motion:no-preference)");
    const [supportsStart, supportsEnd] = blockRange(KIT_CSS, "@supports (animation-timeline:view())", motionStart);
    expect(supportsEnd).toBeLessThan(motionEnd);
    const timelines = positions(KIT_CSS, "animation-timeline:view()").filter((index) => index !== supportsStart + "@supports (".length);
    expect(timelines.length).toBeGreaterThan(0);
    for (const index of timelines) expect(index > supportsStart && index < supportsEnd).toBe(true);
    // 투명한 시작 상태를 쓰는 애니메이션은 모두 움직임 줄이기 조건 안에 있습니다.
    for (const index of positions(KIT_CSS, "animation:xp-rise")) expect(index > motionStart && index < motionEnd).toBe(true);
  });

  it("그룹 안 블록까지 직계 자식과 목록 항목을 단위로 잡고, 청사진 · 끈 지면 · 빠진 요소는 제외한다", () => {
    const [supportsStart, supportsEnd] = blockRange(KIT_CSS, "@supports (animation-timeline:view())");
    const rule = KIT_CSS.slice(supportsStart, supportsEnd);
    expect(rule).toContain(':root:not([data-stage]) .xp-page:not([data-motion="none"]) .xp-block:not([data-reveal="none"],[data-reveal="none"] *)>:not(ul,ol,[data-reveal])');
    expect(rule).toContain('>:is(ul,ol,[data-reveal="stagger"])>:not([data-reveal="none"])');
    expect(rule).toContain("animation:xp-rise var(--motion-easing) both,xp-settle linear forwards;animation-timeline:view(),scroll(root);animation-range:cover 0% cover 25vh,calc(100% - 25vh) 100%");
    expect(rule).toContain("animation-range:cover calc(var(--xp-reveal-step) * 3) cover calc(25vh + var(--xp-reveal-step) * 3),calc(100% - 25vh) 100%");
    // 예전의 최상위 블록 단위 규칙은 그룹 안 블록을 놓쳤습니다.
    expect(KIT_CSS).not.toContain(".xp-inner>.xp-block{animation");
  });

  it("문서 끝 마무리는 끝 상태만 적어 앞 애니메이션의 현재 값에서 이어 간다", () => {
    expect(KIT_CSS).toContain("@keyframes xp-settle{to{opacity:1;transform:none}}");
  });

  it("떠오르는 거리와 순서 간격을 디자인의 간격 토큰에서 가져온다", () => {
    expect(KIT_CSS).toContain("--xp-reveal-rise:var(--element-gap);--xp-reveal-step:var(--component-gap)");
    expect(KIT_CSS).toContain("translateY(var(--xp-reveal-rise))");
  });

  it("목록 요소가 아닌 근거 자료 묶음은 차례 등장 속성을 단다", () => {
    const { html } = renderStructuredPortfolio(pageSpec(), content, { design: clarity });
    expect(html).toContain('class="xp-evidence-list" data-reveal="stagger"');
  });
});
