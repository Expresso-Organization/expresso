import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DesignSystemSpecV2Schema,
  type StructuredPortfolioContent,
} from "@expresso/contracts";
import { renderStructuredPortfolio } from "./renderer.js";
import { retrievePageLibrary } from "./library.js";

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
    expect(html).toMatch(/<span class="xp-num">02<\/span> · 역량/);
    expect(html).toContain("<dt>문제</dt><dd>교차로 정체</dd>");
    expect(html).toContain('<ul class="xp-tags"><li>ROS 2</li></ul>');
    expect(html).toContain('href="#source-e1"');
    expect(html).toContain("경로 실험 보고서 ↗");
    expect(html).toContain('id="source-e1"');
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
});
