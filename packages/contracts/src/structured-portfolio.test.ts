import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  applyStructuredTextPatches,
  EditStructuredPageSchema,
  readStructuredText,
  StructuredContentModelSchema,
  StructuredMediaSchema,
  StructuredPortfolioContentSchema,
  structuredModelSchema,
  structuredLeaves,
  validateStructuredPortfolio,
  type StructuredPortfolioContent,
} from "./structured-portfolio.js";

export const content: StructuredPortfolioContent = {
  version: 1,
  profile: {
    name: "가상 인물",
    role: "엔지니어",
    headline: "경로를 설계하는 엔지니어입니다.",
    intro: "입력 설명",
    focus: ["경로"],
  },
  sections: [
    {
      id: "project-a",
      title: "가상 경로",
      summary: "요약",
      body: "본문",
      pattern: "project",
      details: [
        { label: "문제", text: "막힌 경로" },
        { label: "작업", text: "우회 계획" },
      ],
      media: [],
      sourceIds: ["e-a"],
    },
  ],
  career: [],
  evidence: [
    {
      id: "e-a",
      title: "기록",
      kind: "시험",
      summary: "설명",
      body: "출처 본문",
    },
  ],
  contact: null,
};
export const spec = {
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
      children: ["intro", "evidence", "case-a"],
    },
    intro: {
      type: "NameIntro",
      props: { profile: { $state: "/profile" } },
      children: [],
    },
    evidence: {
      type: "EvidenceGrid",
      props: { evidence: { $state: "/evidence" } },
      children: [],
    },
    "case-a": {
      type: "CaseTechnical",
      props: { section: { $state: "/sectionById/project-a" } },
      children: [],
    },
  },
};
describe("구조화 포트폴리오 계약", () => {
  it("모델 출력 스키마에 위치별 튜플 문법을 포함하지 않는다", () => {
    const json = JSON.stringify(z.toJSONSchema(structuredModelSchema(content)));
    expect(json).not.toContain("prefixItems");
    expect(json).not.toContain('"items":false');
    // 컨테이너가 있으면 page.children 길이가 달라지므로 고정 길이 대신 상한을 둡니다.
    expect(json).toContain('"minItems":2');
    expect(json).toContain('"maxItems":8');
    expect(json).toContain('"group-1"');
    const reordered = structuredClone(spec);
    reordered.elements.page.children = ["evidence", "intro", "case-a"];
    expect(() => validateStructuredPortfolio(reordered, content)).toThrow(
      "첫 섹션",
    );
    const withContact = {
      ...spec,
      elements: {
        ...spec.elements,
        page: {
          ...spec.elements.page,
          children: ["intro", "contact", "evidence", "case-a"],
        },
        contact: {
          type: "Contact",
          props: { contact: { $state: "/contact" } },
          children: [],
        },
      },
    };
    expect(() =>
      validateStructuredPortfolio(withContact, {
        ...content,
        contact: { label: "연락", href: "mailto:fictional@example.com" },
      }),
    ).toThrow("마지막");
  });
  it("내용 정리 모델 스키마는 연락처를 묻지 않고, 소개 문장 규칙은 저장 계약에만 둔다", () => {
    const { contact: _contact, ...model } = content;
    const twoSentences = {
      ...model,
      profile: {
        ...model.profile,
        headline: "첫 문장입니다. 둘째 문장입니다.",
      },
    };
    const jsonSchema = z.toJSONSchema(StructuredContentModelSchema) as {
      properties: Record<string, unknown>;
    };
    expect(Object.keys(jsonSchema.properties)).not.toContain("contact");
    expect(StructuredContentModelSchema.safeParse(twoSentences).success).toBe(
      true,
    );
    expect(StructuredContentModelSchema.safeParse(content).success).toBe(false);
    const stored = StructuredPortfolioContentSchema.safeParse({
      ...twoSentences,
      contact: null,
    });
    expect(stored.success).toBe(false);
    expect(stored.error?.issues[0]?.message).toContain("한 문장");
  });
  it("업로드 경로의 외부 URL과 경로 이탈을 거부한다", () => {
    const media = { alt: "업로드 이미지", origin: "uploaded" };
    expect(
      StructuredMediaSchema.safeParse({
        ...media,
        src: "/v1/media/4ddbf7b4-4372-40cc-b03d-10d7ab0bfa67?w=640",
      }).success,
    ).toBe(true);
    for (const src of [
      "https://other.test/image.png",
      "/v1/media/../../secret",
      "/v1/media/invalid",
      "/v1/media/4ddbf7b4-4372-40cc-b03d-10d7ab0bfa67/other",
    ])
      expect(StructuredMediaSchema.safeParse({ ...media, src }).success).toBe(
        false,
      );
  });
  it("근거를 사례 앞에 놓아도 원문 참조를 보존한다", () => {
    expect(
      validateStructuredPortfolio(spec, content).spec.elements.page?.children,
    ).toEqual(["intro", "evidence", "case-a"]);
  });
  it("누락·중복·임의 참조·연결되지 않은 요소를 거부한다", () => {
    const missing = structuredClone(spec);
    missing.elements.page.children.pop();
    const duplicate = structuredClone(spec);
    duplicate.elements.page.children.push("case-a");
    const path = structuredClone(spec);
    path.elements["case-a"].props.section.$state = "/profile";
    const disconnected = {
      ...spec,
      elements: { ...spec.elements, extra: spec.elements.intro },
    };
    for (const raw of [missing, duplicate, path, disconnected])
      expect(() => validateStructuredPortfolio(raw, content)).toThrow();
  });
  it("이미지가 없는 자료를 갤러리로 꾸미지 않는다", () => {
    const raw = structuredClone(spec);
    raw.elements["case-a"].type = "CaseGallery";
    expect(() => validateStructuredPortfolio(raw, content)).toThrow(
      "제공 이미지",
    );
  });
  it("문장 패치가 지정한 위치만 바꾸고 입력 원본은 보존한다", () => {
    const edit = EditStructuredPageSchema.parse({
      expectedRevision: 0,
      patches: [
        { path: "/sections/project-a/details/1/text", value: "새 우회 계획" },
      ],
    });
    const result = applyStructuredTextPatches(content, edit.patches);
    expect(result.sections[0]?.details[1]?.text).toBe("새 우회 계획");
    expect(content.sections[0]?.details[1]?.text).toBe("우회 계획");
    expect(result.sections[0]?.sourceIds).toEqual(["e-a"]);
    expect(() =>
      EditStructuredPageSchema.parse({
        expectedRevision: 0,
        patches: [
          {
            path: "/sections/project-a/media/0/src",
            value: "https://other.test",
          },
        ],
      }),
    ).toThrow();
  });
  it("인용 · 단계 · 수치 · 기간 · 설명 이름표를 고치고, 비운 선택 칸은 지운다", () => {
    const rich: StructuredPortfolioContent = {
      ...content,
      sections: [
        {
          ...content.sections[0]!,
          period: "2025.08 — 2026.02",
          quote: "막히면 돌아갑니다.",
          steps: [{ label: "관찰", text: "" }, { label: "우회", text: "계획" }],
          metrics: [{ label: "지연", value: "24분", before: "3시간", note: "야간 배치" }],
        },
      ],
    };
    const edit = EditStructuredPageSchema.parse({
      expectedRevision: 0,
      patches: [
        { path: "/sections/project-a/quote", value: "돌아가도 닿습니다." },
        { path: "/sections/project-a/steps/1/text", value: "새 계획" },
        { path: "/sections/project-a/metrics/0/value", value: "20분" },
        { path: "/sections/project-a/metrics/0/note", value: " " },
        { path: "/sections/project-a/details/0/label", value: "막힌 곳" },
        { path: "/sections/project-a/period", value: "" },
        { path: "/profile/role", value: "설계자" },
      ],
    });
    const result = applyStructuredTextPatches(rich, edit.patches);
    const section = result.sections[0]!;
    expect(section.quote).toBe("돌아가도 닿습니다.");
    expect(section.steps?.[1]?.text).toBe("새 계획");
    expect(section.metrics?.[0]).toEqual({ label: "지연", value: "20분", before: "3시간" });
    expect(section.details[0]?.label).toBe("막힌 곳");
    expect(section).not.toHaveProperty("period");
    expect(result.profile.role).toBe("설계자");
    expect(readStructuredText(rich, "/sections/project-a/metrics/0/before")).toBe("3시간");
    expect(readStructuredText(rich, "/sections/project-a/steps/9/text")).toBeNull();
    // 목록마다 정해진 칸만 받습니다. 단계에는 수치 칸이 없습니다.
    expect(() => applyStructuredTextPatches(rich, [{ path: "/sections/project-a/steps/0/value", value: "x" }])).toThrow("편집할 글");
    expect(() => applyStructuredTextPatches(rich, [{ path: "/sections/project-a/metrics/0/value", value: "" }])).toThrow();
  });
  it("요소의 글자 부분 모양은 토큰 이름만 받는다", () => {
    const styled = {
      ...spec,
      elements: {
        ...spec.elements,
        "case-a": { ...spec.elements["case-a"], props: { ...spec.elements["case-a"].props, style: { title: { color: "accent", font: "display", size: "h2" } } } },
      },
    };
    expect(() => validateStructuredPortfolio(styled, content)).not.toThrow();
    const raw = (style: unknown) => ({ ...styled, elements: { ...styled.elements, "case-a": { ...styled.elements["case-a"], props: { ...styled.elements["case-a"].props, style } } } });
    expect(() => validateStructuredPortfolio(raw({ title: { color: "#ff0000" } }), content)).toThrow();
    expect(() => validateStructuredPortfolio(raw({ title: { size: "32px" } }), content)).toThrow();
    expect(() => validateStructuredPortfolio(raw({ title: { weight: 700 } }), content)).toThrow();
  });
  describe("컨테이너 트리", () => {
    const content2 = {
      ...content,
      sections: [
        ...content.sections,
        { ...content.sections[0]!, id: "project-b", title: "가상 경로 2", sourceIds: [] },
      ],
      contact: { label: "연락", href: "mailto:fictional@example.com" },
    };
    const tree = () => ({
      root: "page",
      elements: {
        ...structuredClone(spec.elements),
        page: {
          ...structuredClone(spec.elements.page),
          children: ["intro", "group-1", "evidence", "contact"],
        },
        "group-1": {
          type: "Columns",
          props: { variant: "wide-start" },
          children: ["case-a", "case-b"],
        },
        "case-b": {
          type: "CaseEssay",
          props: { section: { $state: "/sectionById/project-b" } },
          children: [],
        },
        contact: {
          type: "Contact",
          props: { contact: { $state: "/contact" } },
          children: [],
        },
      } as Record<string, unknown>,
    });
    it("색 묶음 · 서체 종류가 없는 새 판과 있는 저장본을 모두 받는다", () => {
      const fresh = structuredClone(tree());
      (fresh.elements.page as { props: Record<string, unknown> }).props.design = { layout: "library" };
      expect(() => validateStructuredPortfolio(fresh, content2)).not.toThrow();
      expect(() => validateStructuredPortfolio(tree(), content2)).not.toThrow();
    });
    it("컨테이너 안의 사례를 한 번씩 연결한 트리를 받는다", () => {
      const result = validateStructuredPortfolio(tree(), content2);
      expect(structuredLeaves(result.spec).map((item) => [item.key, item.parent])).toEqual([
        ["intro", "page"],
        ["case-a", "group-1"],
        ["case-b", "group-1"],
        ["evidence", "page"],
        ["contact", "page"],
      ]);
      // 모델 계약도 같은 트리를 받습니다.
      const { "case-a": a, "case-b": b, ...rest } = tree().elements;
      const modelTree = (variant: string) => ({
        root: "page",
        elements: {
          ...rest,
          intro: { ...spec.elements.intro, props: { profile: { $state: "/profile" }, sections: { $state: "/sections" }, variant } },
          index: { type: "ProjectIndex", props: { sections: { $state: "/sections" }, variant: "rows" }, children: [] },
          "section-project-a": a,
          "section-project-b": b,
          "group-1": { type: "Columns", props: { variant: "even" }, children: ["section-project-a", "section-project-b"] },
          // 모델은 design을 고르지 않습니다. 생성기가 검사 전에 채웁니다.
          page: (() => {
            const { design: _design, ...props } = spec.elements.page.props;
            return { ...spec.elements.page, props, children: ["intro", "index", "group-1", "evidence", "contact"] };
          })(),
        },
      });
      const parsed = structuredModelSchema(content2).safeParse(modelTree("split"));
      expect(parsed.error?.issues ?? []).toEqual([]);
      // 섹션 이미지가 없으면 이미지 중심 첫 화면을 고를 수 없습니다.
      expect(content2.sections.some((section) => section.media.length)).toBe(false);
      expect(structuredModelSchema(content2).safeParse(modelTree("media")).success).toBe(false);
      const withImage = structuredClone(content2);
      withImage.sections[0]!.media = [{ src: "data:image/png;base64,AAAA", alt: "가상 이미지", origin: "fictional" }];
      expect(structuredModelSchema(withImage).safeParse(modelTree("media")).error?.issues ?? []).toEqual([]);
      // 넓은 여백 디자인처럼 컨테이너를 쓸 수 없으면 group 요소를 고를 수 없습니다.
      const noGroups = structuredModelSchema(content2, { intro: [], section: [], guidance: [], groups: [] });
      expect(noGroups.safeParse(modelTree("split")).success).toBe(false);
      const flat = modelTree("split");
      const { "group-1": _group, ...flatElements } = flat.elements;
      const flatTree = {
        ...flat,
        elements: {
          ...flatElements,
          page: { ...flat.elements.page, children: ["intro", "index", "section-project-a", "section-project-b", "evidence", "contact"] },
        },
      };
      expect(noGroups.safeParse(flatTree).error?.issues ?? []).toEqual([]);
      // 모델이 design을 내면 거절합니다.
      const withDesign = structuredClone(flatTree);
      (withDesign.elements.page.props as Record<string, unknown>).design = { layout: "library", palette: "sage", font: "sans" };
      expect(noGroups.safeParse(withDesign).success).toBe(false);
    });
    it("컨테이너 규칙을 어긴 트리를 거부한다", () => {
      const cases: [string, (raw: ReturnType<typeof tree>) => void, string][] = [
        ["중첩", (raw) => { raw.elements["group-2"] = { type: "Band", props: { variant: "panel" }, children: ["case-b"] }; (raw.elements["group-1"] as { children: string[] }).children = ["case-a", "group-2"]; }, "넣을 수 없는"],
        ["소개를 컨테이너에", (raw) => { (raw.elements.page as { children: string[] }).children = ["group-1", "evidence", "contact"]; (raw.elements["group-1"] as { children: string[] }).children = ["intro", "case-a"]; raw.elements["group-3"] = { type: "Band", props: { variant: "panel" }, children: ["case-b"] }; (raw.elements.page as { children: string[] }).children.splice(1, 0, "group-3"); }, "넣을 수 없는"],
        ["연락처를 컨테이너에", (raw) => { (raw.elements.page as { children: string[] }).children = ["intro", "group-1", "evidence"]; raw.elements["group-1"] = { type: "Grid", props: { variant: "even" }, children: ["case-a", "case-b", "contact"] }; }, "넣을 수 없는"],
        ["중복", (raw) => { (raw.elements.page as { children: string[] }).children.splice(2, 0, "case-a"); }, "중복 ID: case-a"],
        ["연결되지 않은 컨테이너", (raw) => { raw.elements["group-2"] = { type: "Band", props: { variant: "panel" }, children: ["case-b"] }; }, "누락 ID: group-2"],
        ["자식 수", (raw) => { (raw.elements["group-1"] as { children: string[] }).children = ["case-a"]; (raw.elements.page as { children: string[] }).children.splice(2, 0, "case-b"); }, "2개"],
        ["variant 짝", (raw) => { (raw.elements["group-1"] as { props: { variant: string } }).props.variant = "panel"; }, "variant"],
      ];
      for (const [name, change, message] of cases) {
        const raw = tree();
        change(raw);
        expect(() => validateStructuredPortfolio(raw, content2), name).toThrow(message);
      }
    });
  });
});

describe("포트폴리오 유형별 모델 스키마", () => {
  const value: StructuredPortfolioContent = {
    version: 1,
    profile: { name: "가상 인물", role: "엔지니어", headline: "경로를 설계하는 엔지니어입니다.", intro: "설명", focus: [] },
    sections: [
      { id: "a", title: "시험", summary: "요약", body: "본문", pattern: "project", period: "2025.01 — 2025.05", details: [], media: [], sourceIds: [] },
    ],
    career: [],
    evidence: [],
    contact: null,
  };
  const page = (children: string[]) => ({ type: "PortfolioPage", props: { profile: { $state: "/profile" }, motion: "showcase", rationale: "근거" }, children });
  const intro = (variant: string) => ({ type: "NameIntro", props: { profile: { $state: "/profile" }, sections: { $state: "/sections" }, variant }, children: [] });
  const index = (variant: string) => ({ type: "ProjectIndex", props: { sections: { $state: "/sections" }, variant }, children: [] });
  const caseNode = (type: string) => ({ type, props: { section: { $state: "/sectionById/a" } }, children: [] });
  const schema = (archetype: "case-study" | "poster" | "list") => structuredModelSchema(value, { intro: [], section: [], guidance: [], archetype });

  it("포스터형은 포스터 첫 화면과 포스터 목차만 고르고 컨테이너가 없다", () => {
    const ok = { root: "page", elements: { page: page(["intro", "index", "section-a"]), intro: intro("poster"), index: index("poster"), "section-a": caseNode("CaseEssay") } };
    expect(schema("poster").safeParse(ok).error?.issues ?? []).toEqual([]);
    expect(schema("poster").safeParse({ ...ok, elements: { ...ok.elements, intro: intro("statement") } }).success).toBe(false);
    expect(schema("poster").safeParse({ ...ok, elements: { ...ok.elements, index: index("rows") } }).success).toBe(false);
    expect(schema("poster").safeParse({ ...ok, elements: { ...ok.elements, "section-a": caseNode("CaseRow") } }).success).toBe(false);
    const grouped = { ...ok, elements: { ...ok.elements, page: page(["intro", "group-1"]), "group-1": { type: "Columns", props: { variant: "even" }, children: ["index", "section-a"] } } };
    expect(schema("poster").safeParse(grouped).success).toBe(false);
  });

  it("글 · 목록형은 목차 없이 문장 첫 화면과 사례 행만 쓴다", () => {
    const ok = { root: "page", elements: { page: page(["intro", "section-a"]), intro: intro("sentence"), "section-a": caseNode("CaseRow") } };
    expect(schema("list").safeParse(ok).error?.issues ?? []).toEqual([]);
    expect(schema("list").safeParse({ ...ok, elements: { ...ok.elements, index: index("rows"), page: page(["intro", "index", "section-a"]) } }).success).toBe(false);
    expect(schema("list").safeParse({ ...ok, elements: { ...ok.elements, "section-a": caseNode("CaseEssay") } }).success).toBe(false);
  });

  it("사례 상세형은 지금과 같고 새 변형 · 사례 행을 고를 수 없다", () => {
    const ok = { root: "page", elements: { page: page(["intro", "index", "section-a"]), intro: intro("split"), index: index("rows"), "section-a": caseNode("CaseTechnical") } };
    expect(schema("case-study").safeParse(ok).error?.issues ?? []).toEqual([]);
    expect(structuredModelSchema(value).safeParse(ok).error?.issues ?? []).toEqual([]);
    expect(schema("case-study").safeParse({ ...ok, elements: { ...ok.elements, intro: intro("poster") } }).success).toBe(false);
    expect(schema("case-study").safeParse({ ...ok, elements: { ...ok.elements, "section-a": caseNode("CaseRow") } }).success).toBe(false);
  });

  it("저장 계약은 유형 · 기간이 있는 새 판과 없는 옛 판을 모두 받는다", () => {
    const stored = (archetype?: string) => ({
      root: "page",
      elements: {
        page: { ...page(["intro", "section-a"]), props: { ...page([]).props, design: { layout: "library" }, ...(archetype ? { archetype } : {}) } },
        intro: intro("sentence"),
        "section-a": caseNode("CaseRow"),
      },
    });
    expect(() => validateStructuredPortfolio(stored("list"), value)).not.toThrow();
    expect(() => validateStructuredPortfolio(stored(), value)).not.toThrow();
    const { period: _period, ...section } = value.sections[0]!;
    expect(() => validateStructuredPortfolio(stored(), { ...value, sections: [section] })).not.toThrow();
  });
});

describe("시각 부품과 지면 변화 계약", () => {
  const rich: StructuredPortfolioContent = {
    ...content,
    sections: [
      {
        ...content.sections[0]!,
        quote: "막히면 돌아갑니다.",
        steps: [
          { label: "관찰", text: "" },
          { label: "우회", text: "계획" },
        ],
      },
    ],
  };
  const withCase = (node: Record<string, unknown>, extra: Record<string, unknown> = {}, children = ["intro", "evidence", "case-a"]) => ({
    ...spec,
    elements: { ...spec.elements, page: { ...spec.elements.page, children }, "case-a": { ...spec.elements["case-a"], ...node }, ...extra },
  });
  const quote = (id = "project-a", props: Record<string, unknown> = {}) => ({ type: "PullQuote", props: { section: { $state: `/sectionById/${id}` }, ...props }, children: [] });

  it("과정 흐름은 단계 두 개, 이미지 전시는 이미지, 큰 인용은 인용 문장이 있어야 한다", () => {
    expect(() => validateStructuredPortfolio(withCase({ type: "CaseFlow" }), rich)).not.toThrow();
    expect(() => validateStructuredPortfolio(withCase({ type: "CaseFlow" }), content)).toThrow("두 개 이상의 단계");
    expect(() => validateStructuredPortfolio(withCase({ type: "CaseShowcase" }), rich)).toThrow("제공 이미지");
    const quoted = withCase({}, { "quote-1": quote() }, ["intro", "evidence", "case-a", "quote-1"]);
    expect(() => validateStructuredPortfolio(quoted, rich)).not.toThrow();
    expect(() => validateStructuredPortfolio(quoted, content)).toThrow("quote가 필요");
    const twice = withCase({}, { "quote-1": quote(), "quote-2": quote() }, ["intro", "evidence", "case-a", "quote-1", "quote-2"]);
    expect(() => validateStructuredPortfolio(twice, rich)).toThrow("중복");
    expect(() => validateStructuredPortfolio(withCase({}, { "quote-1": quote("missing") }, ["intro", "evidence", "case-a", "quote-1"]), rich)).toThrow("섹션 참조");
  });

  it("크기 · 배경 · 폭은 정해진 값만 받고 없어도 된다", () => {
    const staged = withCase({ props: { section: { $state: "/sectionById/project-a" }, scale: "lead", surface: "inverse", width: "bleed" } });
    expect(() => validateStructuredPortfolio(staged, rich)).not.toThrow();
    expect(() => validateStructuredPortfolio(withCase({ props: { section: { $state: "/sectionById/project-a" }, surface: "accent" } }), rich)).toThrow();
    expect(() => validateStructuredPortfolio(spec, content)).not.toThrow();
  });

  it("모델 스키마는 내용이 허용하는 부품만 열고, 글 · 목록형에는 지면 변화와 큰 인용이 없다", () => {
    const shape = (value: StructuredPortfolioContent, archetype: "case-study" | "list" = "case-study") =>
      JSON.stringify(z.toJSONSchema(structuredModelSchema(value, { intro: [], section: [], guidance: [], archetype })));
    expect(shape(content)).not.toContain("CaseFlow");
    expect(shape(content)).not.toContain("quote-1");
    expect(shape(rich)).toContain("CaseFlow");
    expect(shape(rich)).toContain("quote-1");
    expect(shape(rich)).not.toContain("quote-2");
    expect(shape(rich)).not.toContain("CaseShowcase");
    expect(shape(rich)).toContain('"inverse"');
    expect(shape(rich, "list")).not.toContain('"inverse"');
    expect(shape(rich, "list")).not.toContain("PullQuote");
  });
});
